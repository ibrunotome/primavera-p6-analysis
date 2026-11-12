/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'

import { createCheckChartRows, createFindingRows, filterFindingRows } from './findings'
import { parseXer, parseXerBuffer, runScheduleChecks } from './xer'

const bytes = new Uint8Array(readFileSync(new URL('../../public/samples/airport-errors.xer', import.meta.url)))
const schedule = parseXerBuffer(bytes.buffer)
const report = runScheduleChecks(schedule)

describe('findings presentation', () => {
  it('retains all 12 findings and their activity, project and source details', () => {
    const rows = createFindingRows(report.findings, schedule.projects)
    expect(rows).toHaveLength(12)
    expect(rows[0]).toMatchObject({
      activityCode: 'BA-P1-20',
      project: 'TERMINAL-2-DEMO-ERRORS',
      checkLabel: 'Missing links',
      certainty: 'confirmed',
      line: 107,
      floatHours: 16,
    })
    expect(rows[0].raw.startsWith('%R\t')).toBe(true)
    expect(new Set(rows.map((row) => row.id)).size).toBe(12)
  })

  it('combines case-insensitive text, check and certainty filters', () => {
    const rows = createFindingRows(report.findings, schedule.projects)
    expect(filterFindingRows(rows, { search: '  ba-p1-40  ', check: 'all', certainty: 'all' })).toMatchObject([
      { check: 'negative-float', activityCode: 'BA-P1-40' },
    ])
    expect(filterFindingRows(rows, { search: 'terminal', check: 'high-float', certainty: 'confirmed' })).toHaveLength(
      10,
    )
    expect(filterFindingRows(rows, { search: '', check: 'negative-float', certainty: 'uncertain' })).toEqual([])
  })

  it('keeps chart totals independent of table filtering', () => {
    const rows = createFindingRows(report.findings, schedule.projects)
    filterFindingRows(rows, { search: 'no matching activity', check: 'all', certainty: 'all' })
    expect(createCheckChartRows(report)).toMatchObject([
      { id: 'missing-links', count: 1, status: 'partial', uncertainCount: 0 },
      { id: 'negative-float', count: 1, status: 'partial', uncertainCount: 0 },
      { id: 'high-float', count: 10, status: 'partial', uncertainCount: 0 },
    ])
  })

  it('distinguishes unavailable checks from zero findings', () => {
    const absent = parseXer('ERMHDR\t23.12\t2026-01-01\n%E')
    expect(createCheckChartRows(runScheduleChecks(absent)).every((row) => row.count === null)).toBe(true)
    const original = parseXerBuffer(
      new Uint8Array(readFileSync(new URL('../../public/samples/airport.xer', import.meta.url))).buffer,
    )
    expect(createCheckChartRows(runScheduleChecks(original))[0]).toMatchObject({
      count: 0,
      status: 'complete',
    })
  })

  it('preserves missing float and counts uncertain findings', () => {
    const partial = parseXer(new TextDecoder('windows-1252').decode(bytes).replace(/\n%E\s*$/, ''))
    partial.activities.find((activity) => activity.code === 'BA-P1-20')!.totalFloatHours = null
    const result = runScheduleChecks(partial)
    const rows = createFindingRows(result.findings, partial.projects)
    expect(rows[0]).toMatchObject({ certainty: 'uncertain', floatHours: undefined })
    expect(createCheckChartRows(result)[0].uncertainCount).toBe(1)
  })
})
