import type {
  MissingLinksFinding,
  ScheduleCheckId,
  ScheduleCheckOptions,
  ScheduleCheckReport,
  ScheduleCheckResult,
  XerActivity,
  XerParseResult,
} from './types'

export const DEFAULT_HIGH_FLOAT_HOURS = 352

const knownStatuses = new Set(['TK_NotStart', 'TK_Active', 'TK_Complete'])
const knownTypes = new Set(['TT_Task', 'TT_Rsrc', 'TT_Mile', 'TT_FinMile', 'TT_LOE', 'TT_WBS'])
const relationshipColumns = ['task_pred_id', 'task_id', 'pred_task_id', 'proj_id', 'pred_proj_id']

function createCheck(id: ScheduleCheckId): ScheduleCheckResult {
  return {
    id,
    status: 'complete',
    assessedCount: 0,
    excludedCount: 0,
    unavailableCount: 0,
    findings: [],
    notes: [],
  }
}

function hasActualDate(activity: XerActivity, field: 'act_start_date' | 'act_end_date'): boolean {
  return Boolean(activity.source.fields[field]?.trim())
}

function eligibility(activity: XerActivity, check: ScheduleCheckId): 'eligible' | 'excluded' | 'unknown' {
  if (
    activity.status === 'TK_Complete' ||
    hasActualDate(activity, 'act_end_date') ||
    activity.type === 'TT_WBS' ||
    (check !== 'missing-links' && activity.type === 'TT_LOE')
  ) {
    return 'excluded'
  }
  if (!knownStatuses.has(activity.status ?? '') || !knownTypes.has(activity.type ?? '')) {
    return 'unknown'
  }
  return 'eligible'
}

function activityKey(projectId: string, activityId: string): string {
  return JSON.stringify([projectId, activityId])
}

function findingId(check: ScheduleCheckId, activity: XerActivity): string {
  return JSON.stringify([check, activity.projectId, activity.id])
}

/**
 * Inspect exported P6 values without recalculating the schedule.
 *
 * Scope follows Oracle's Check Schedule definitions:
 * https://docs.oracle.com/en/industries/construction-engineering/primavera-p6-project/26/p6-help/101232.html
 *
 * Started activities and start milestones need no predecessor; finish milestones
 * need no successor. Completed activities and WBS summaries are excluded.
 * Float checks also exclude level-of-effort activities.
 */
export function runScheduleChecks(schedule: XerParseResult, options: ScheduleCheckOptions = {}): ScheduleCheckReport {
  const threshold = options.highFloatThresholdHours ?? DEFAULT_HIGH_FLOAT_HOURS
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new RangeError('High float threshold must be a finite, non-negative number of hours.')
  }

  const missingLinks = createCheck('missing-links')
  const negativeFloat = createCheck('negative-float')
  const highFloat = createCheck('high-float')
  const checks: ScheduleCheckReport['checks'] = {
    'missing-links': missingLinks,
    'negative-float': negativeFloat,
    'high-float': highFloat,
  }
  if (schedule.status === 'invalid') {
    for (const check of Object.values(checks)) {
      check.status = 'unavailable'
      check.unavailableCount = schedule.activities.length
      check.notes.push('The import is invalid; schedule checks cannot run.')
    }
    return { highFloatThresholdHours: threshold, checks, findings: [] }
  }

  const fileIncomplete = schedule.issues.some(
    (issue) =>
      issue.code === 'missing-end-marker' ||
      issue.code === 'data-after-end' ||
      (issue.table === null && issue.severity === 'error'),
  )
  const populationIncomplete =
    fileIncomplete ||
    schedule.tables.some(
      (table) => (table.name === 'TASK' || table.name === 'PROJECT') && table.rejectedRowCount > 0,
    ) ||
    schedule.issues.some(
      (issue) =>
        (issue.table === 'TASK' || issue.table === 'PROJECT') &&
        issue.severity === 'error' &&
        issue.code !== 'invalid-number',
    )
  const relationshipTables = schedule.tables.filter((table) => table.name === 'TASKPRED')
  const linksAvailable = relationshipTables.some((table) =>
    relationshipColumns.every((column) => table.columns.includes(column)),
  )
  let linksIncomplete =
    fileIncomplete ||
    relationshipTables.some((table) => table.rejectedRowCount > 0) ||
    schedule.issues.some(
      (issue) => issue.table === 'TASKPRED' && issue.code !== 'external-reference' && issue.code !== 'invalid-number',
    )
  const incoming = new Set<string>()
  const outgoing = new Set<string>()
  let selfLinkCount = 0
  for (const relationship of schedule.relationships) {
    const predecessor = activityKey(relationship.predecessorProjectId, relationship.predecessorId)
    const successor = activityKey(relationship.successorProjectId, relationship.successorId)
    if (predecessor === successor) {
      selfLinkCount++
      linksIncomplete = true
      continue
    }
    // External links count as connections for their local endpoint.
    outgoing.add(predecessor)
    incoming.add(successor)
  }

  for (const activity of schedule.activities) {
    for (const check of Object.values(checks)) {
      const scope = eligibility(activity, check.id)
      if (scope === 'excluded') {
        check.excludedCount++
        continue
      }
      if (scope === 'unknown') {
        check.unavailableCount++
        continue
      }

      if (check.id === 'missing-links') {
        if (!linksAvailable) {
          check.unavailableCount++
          continue
        }
        check.assessedCount++
        const key = activityKey(activity.projectId, activity.id)
        const missing: MissingLinksFinding['missing'] = []
        if (
          activity.type !== 'TT_Mile' &&
          activity.status !== 'TK_Active' &&
          !hasActualDate(activity, 'act_start_date') &&
          !incoming.has(key)
        ) {
          missing.push('predecessor')
        }
        if (activity.type !== 'TT_FinMile' && !outgoing.has(key)) {
          missing.push('successor')
        }
        if (missing.length > 0) {
          check.findings.push({
            id: findingId(check.id, activity),
            check: 'missing-links',
            activity,
            line: activity.source.line,
            certainty: linksIncomplete ? 'uncertain' : 'confirmed',
            missing,
            message: 'Activity is missing a ' + missing.join(' and a ') + '.',
          })
        }
      } else {
        const hours = activity.totalFloatHours
        if (hours === null || !Number.isFinite(hours)) {
          check.unavailableCount++
          continue
        }
        check.assessedCount++
        const limit = check.id === 'negative-float' ? 0 : threshold
        const flagged = check.id === 'negative-float' ? hours < limit : hours > limit
        if (flagged) {
          check.findings.push({
            id: findingId(check.id, activity),
            check: check.id,
            activity,
            line: activity.source.line,
            certainty: 'confirmed',
            totalFloatHours: hours,
            thresholdHours: limit,
            message:
              'Total float is ' +
              hours +
              ' hours, ' +
              (check.id === 'negative-float' ? 'below zero.' : 'above ' + limit + ' hours.'),
          })
        }
      }
    }
  }

  for (const check of Object.values(checks)) {
    if (populationIncomplete) {
      check.status = 'partial'
      check.notes.push(
        'The export is incomplete or some project/activity records were rejected. Counts cover usable activities only.',
      )
    }
    if (check.unavailableCount > 0) {
      check.status = check.assessedCount === 0 ? 'unavailable' : 'partial'
      check.notes.push(
        check.id === 'missing-links'
          ? 'Some activities could not be assessed because dependency data, activity type, or status is unavailable.'
          : 'Some activities could not be assessed because float, activity type, or status is unavailable.',
      )
    }
  }
  if (!linksAvailable) {
    missingLinks.status = 'unavailable'
    missingLinks.notes.push('No usable TASKPRED column header is present. Missing links cannot be determined.')
  } else if (linksIncomplete) {
    if (missingLinks.status === 'complete') missingLinks.status = 'partial'
    missingLinks.notes.push(
      'Dependency data is incomplete. Missing-link findings are uncertain because connections may be absent from the imported data.',
    )
  }
  if (selfLinkCount > 0) {
    missingLinks.notes.push('Self relationships were ignored because they do not connect distinct activities.')
  }

  return {
    highFloatThresholdHours: threshold,
    checks,
    findings: [...missingLinks.findings, ...negativeFloat.findings, ...highFloat.findings],
  }
}
