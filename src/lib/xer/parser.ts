import type {
  XerActivity,
  XerIssue,
  XerParseResult,
  XerProject,
  XerRelationship,
  XerSource,
  XerTableSummary,
} from './types'

const requiredColumns = {
  PROJECT: ['proj_id', 'proj_short_name'],
  TASK: ['task_id', 'proj_id', 'task_code'],
  TASKPRED: ['task_pred_id', 'task_id', 'pred_task_id', 'proj_id', 'pred_proj_id'],
} as const

type CoreTable = keyof typeof requiredColumns

interface PendingRow {
  table: XerTableSummary
  source: XerSource
}

const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

function isCoreTable(name: string): name is CoreTable {
  return Object.hasOwn(requiredColumns, name)
}

/**
 * Read XER table records without assuming a column order or recalculating dates.
 * Unused tables are counted and checked for row widths, but are not retained.
 * Original lines and fields are retained for the three schedule tables.
 */
export function parseXer(text: string): XerParseResult {
  const result: XerParseResult = {
    status: 'invalid',
    encoding: null,
    header: null,
    projects: [],
    activities: [],
    relationships: [],
    tables: [],
    issues: [],
  }
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
  const headerIndex = lines.findIndex((line) => line.trim() !== '')
  const header = (lines[headerIndex] ?? '').split('\t')

  if (header[0] !== 'ERMHDR' || !header[1]?.trim() || !header[2]?.trim()) {
    result.issues.push({
      code: 'invalid-header',
      severity: 'error',
      message: 'Expected an ERMHDR header with an export version and date.',
      line: headerIndex < 0 ? null : headerIndex + 1,
      table: null,
      raw: lines[headerIndex] ?? null,
    })
    return result
  }
  result.header = { version: header[1], exportedAt: header[2] }

  const pending: Record<CoreTable, PendingRow[]> = { PROJECT: [], TASK: [], TASKPRED: [] }
  let table: XerTableSummary | null = null
  let fieldsReady = false
  let schemaValid = false
  let ended = false

  for (let index = headerIndex + 1; index < lines.length; index++) {
    const raw = lines[index]
    if (raw.trim() === '') continue
    const line = index + 1
    const cells = raw.split('\t')
    const marker = cells[0]
    const issue = (code: XerIssue['code'], message: string, field?: string) => {
      result.issues.push({
        code,
        severity: 'error',
        message,
        line,
        table: table?.name ?? null,
        raw,
        ...(field ? { field } : {}),
      })
    }

    if (ended) {
      issue('data-after-end', 'Unexpected content after the %E end marker.')
      continue
    }

    if (marker === '%T') {
      table = null
      fieldsReady = false
      schemaValid = false
      if (cells.length !== 2 || !cells[1].trim()) {
        issue('invalid-table', 'Expected %T followed by one table name.')
        continue
      }
      table = { name: cells[1], line, columns: [], rowCount: 0, rejectedRowCount: 0 }
      result.tables.push(table)
    } else if (marker === '%F') {
      fieldsReady = false
      schemaValid = false
      if (!table) {
        issue('row-without-table', 'Field names must belong to a %T table.')
        continue
      }
      const columns = cells.slice(1)
      if (columns.length === 0 || columns.some((column) => column.trim() === '')) {
        issue('invalid-fields', 'Column names cannot be empty.')
        continue
      }
      if (new Set(columns).size !== columns.length) {
        issue('invalid-fields', 'Duplicate column names would make row values ambiguous.')
        continue
      }
      table.columns = columns
      fieldsReady = true
      schemaValid = true
      if (isCoreTable(table.name)) {
        for (const column of requiredColumns[table.name]) {
          if (!columns.includes(column)) {
            issue('missing-column', 'Required column is missing: ' + column + '.', column)
            schemaValid = false
          }
        }
        if (table.name === 'TASK') {
          for (const column of ['total_float_hr_cnt', 'task_type', 'status_code']) {
            if (!columns.includes(column)) {
              result.issues.push({
                code: 'missing-column',
                severity: 'warning',
                message: 'Column is unavailable for schedule checks: ' + column + '.',
                line,
                table: table.name,
                field: column,
                raw,
              })
            }
          }
        }
      }
    } else if (marker === '%R') {
      if (!table) {
        issue('row-without-table', 'Record does not belong to a %T table.')
        continue
      }
      table.rowCount++
      if (!fieldsReady) {
        issue('row-without-fields', 'Record has no valid %F column header.')
        table.rejectedRowCount++
        continue
      }
      if (cells.length - 1 !== table.columns.length) {
        issue('column-count', 'Expected ' + table.columns.length + ' values; received ' + (cells.length - 1) + '.')
        table.rejectedRowCount++
        continue
      }
      if (!schemaValid) {
        table.rejectedRowCount++
        continue
      }
      if (isCoreTable(table.name)) {
        const fields = Object.fromEntries(table.columns.map((column, i) => [column, cells[i + 1]]))
        pending[table.name].push({ table, source: { line, raw, fields } })
      }
    } else if (marker === '%E' && cells.slice(1).every((cell) => cell === '')) {
      ended = true
    } else {
      issue('unexpected-line', 'Expected a %T, %F, %R, or %E record marker.')
    }
  }

  const addIssue = (
    row: PendingRow,
    code: XerIssue['code'],
    message: string,
    field?: string,
    severity: XerIssue['severity'] = 'error',
  ) => {
    result.issues.push({
      code,
      severity,
      message,
      line: row.source.line,
      table: row.table.name,
      raw: row.source.raw,
      ...(field ? { field } : {}),
    })
  }
  const numberOrNull = (row: PendingRow, field: string): number | null => {
    const value = row.source.fields[field]?.trim()
    if (!value) return null
    const number = Number(value)
    if (!decimal.test(value) || !Number.isFinite(number)) {
      addIssue(row, 'invalid-number', 'Expected a finite decimal number in ' + field + '.', field)
      return null
    }
    return number
  }
  const uniqueRows = (name: CoreTable, idField: string): PendingRow[] => {
    const seen = new Set<string>()
    return pending[name].filter((row) => {
      const missing = requiredColumns[name].filter((field) => !row.source.fields[field]?.trim())
      for (const field of missing) {
        addIssue(row, 'missing-value', 'Required value is empty: ' + field + '.', field)
      }
      if (missing.length > 0) {
        row.table.rejectedRowCount++
        return false
      }
      const id = row.source.fields[idField]
      if (seen.has(id)) {
        addIssue(row, 'duplicate-id', 'Duplicate ' + idField + ': ' + id + '. First record retained.', idField)
        row.table.rejectedRowCount++
        return false
      }
      seen.add(id)
      return true
    })
  }

  result.projects = uniqueRows('PROJECT', 'proj_id').map(({ source }): XerProject => ({
    id: source.fields.proj_id,
    code: source.fields.proj_short_name,
    source,
  }))
  const projectIds = new Set(result.projects.map((project) => project.id))
  const activityById = new Map<string, XerActivity>()
  for (const row of uniqueRows('TASK', 'task_id')) {
    const { fields } = row.source
    if (!projectIds.has(fields.proj_id)) {
      addIssue(row, 'missing-reference', 'Activity references a project absent from PROJECT.', 'proj_id')
      row.table.rejectedRowCount++
      continue
    }
    const activity: XerActivity = {
      id: fields.task_id,
      projectId: fields.proj_id,
      code: fields.task_code,
      name: fields.task_name ?? '',
      type: fields.task_type || null,
      status: fields.status_code || null,
      totalFloatHours: numberOrNull(row, 'total_float_hr_cnt'),
      source: row.source,
    }
    result.activities.push(activity)
    activityById.set(activity.id, activity)
  }

  for (const row of uniqueRows('TASKPRED', 'task_pred_id')) {
    const { fields } = row.source
    let broken = false
    let external = false
    for (const [projectField, activityField] of [
      ['proj_id', 'task_id'],
      ['pred_proj_id', 'pred_task_id'],
    ]) {
      if (!projectIds.has(fields[projectField])) {
        external = true
        addIssue(
          row,
          'external-reference',
          'Relationship endpoint belongs to a project outside this export.',
          projectField,
          'warning',
        )
      } else if (activityById.get(fields[activityField])?.projectId !== fields[projectField]) {
        broken = true
        addIssue(
          row,
          'missing-reference',
          'Relationship references an unavailable activity in an exported project.',
          activityField,
        )
      }
    }
    if (broken) {
      row.table.rejectedRowCount++
      continue
    }
    const relationship: XerRelationship = {
      id: fields.task_pred_id,
      successorId: fields.task_id,
      successorProjectId: fields.proj_id,
      predecessorId: fields.pred_task_id,
      predecessorProjectId: fields.pred_proj_id,
      type: fields.pred_type || null,
      lagHours: numberOrNull(row, 'lag_hr_cnt'),
      external,
      source: row.source,
    }
    result.relationships.push(relationship)
  }

  const fileIssue = (
    code: XerIssue['code'],
    message: string,
    tableName: string | null,
    severity: XerIssue['severity'],
  ) => {
    result.issues.push({ code, message, severity, line: null, table: tableName, raw: null })
  }
  if (!ended) {
    fileIssue('missing-end-marker', 'Missing %E end marker; the export may be truncated.', null, 'warning')
  }
  for (const name of ['PROJECT', 'TASK', 'TASKPRED']) {
    if (!result.tables.some((entry) => entry.name === name)) {
      fileIssue(
        'missing-table',
        name === 'TASKPRED'
          ? 'TASKPRED is absent; dependency coverage is unknown.'
          : 'Required table is missing: ' + name + '.',
        name,
        name === 'TASKPRED' ? 'warning' : 'error',
      )
    }
  }
  if (result.projects.length === 0) {
    fileIssue('no-projects', 'No usable projects were found.', 'PROJECT', 'error')
  }
  if (result.activities.length === 0) {
    fileIssue('no-activities', 'No usable activities were found.', 'TASK', 'error')
  }
  result.issues.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity))
  result.status =
    result.projects.length === 0 || result.activities.length === 0
      ? 'invalid'
      : result.issues.length > 0
        ? 'partial'
        : 'success'
  return result
}
