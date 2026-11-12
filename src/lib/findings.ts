import type { ScheduleCheckId, ScheduleCheckReport, ScheduleFinding, XerProject } from './xer'

export const checkPresentation: Record<ScheduleCheckId, { label: string; color: string }> = {
  'missing-links': { label: 'Missing links', color: '#b45309' },
  'negative-float': { label: 'Negative float', color: '#dc2626' },
  'high-float': { label: 'High float', color: '#2563eb' },
}

export interface FindingRow {
  id: string
  activityCode: string
  activityName: string
  project: string
  check: ScheduleCheckId
  checkLabel: string
  certainty: ScheduleFinding['certainty']
  floatHours: number | undefined
  line: number
  message: string
  raw: string
}

export interface FindingFilters {
  search: string
  check: ScheduleCheckId | 'all'
  certainty: ScheduleFinding['certainty'] | 'all'
}

export interface CheckChartRow {
  id: ScheduleCheckId
  label: string
  color: string
  /** Null means unavailable, not a zero count. */
  count: number | null
  status: 'complete' | 'partial' | 'unavailable'
  uncertainCount: number
}

export function createFindingRows(findings: ScheduleFinding[], projects: XerProject[]): FindingRow[] {
  const projectCodes = new Map(projects.map((project) => [project.id, project.code]))
  return findings.map((finding) => ({
    id: finding.id,
    activityCode: finding.activity.code,
    activityName: finding.activity.name,
    project: projectCodes.get(finding.activity.projectId) ?? finding.activity.projectId,
    check: finding.check,
    checkLabel: checkPresentation[finding.check].label,
    certainty: finding.certainty,
    floatHours: finding.activity.totalFloatHours ?? undefined,
    line: finding.line,
    message: finding.message,
    raw: finding.activity.source.raw,
  }))
}

export function filterFindingRows(rows: FindingRow[], filters: FindingFilters): FindingRow[] {
  const query = filters.search.trim().toLocaleLowerCase('en-US')
  return rows.filter((row) => {
    if (filters.check !== 'all' && row.check !== filters.check) return false
    if (filters.certainty !== 'all' && row.certainty !== filters.certainty) return false
    if (!query) return true
    const text = [
      row.activityCode,
      row.activityName,
      row.project,
      row.checkLabel,
      row.certainty,
      row.message,
      String(row.line),
      row.floatHours === undefined ? '' : String(row.floatHours),
    ]
      .join(' ')
      .toLocaleLowerCase('en-US')
    return text.includes(query)
  })
}

export function createCheckChartRows(report: ScheduleCheckReport): CheckChartRow[] {
  return Object.values(report.checks).map((check) => ({
    id: check.id,
    ...checkPresentation[check.id],
    count: check.status === 'unavailable' ? null : check.findings.length,
    status: check.status,
    uncertainCount: check.findings.filter((finding) => finding.certainty === 'uncertain').length,
  }))
}
