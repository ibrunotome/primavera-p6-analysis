/// <reference types="node" />
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'

import { parseXerBuffer, runScheduleChecks } from './index'

function readSample(filename: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(readFileSync(new URL('../../../public/samples/' + filename, import.meta.url)))
}

describe('deliberately modified airport fixture', () => {
  it('preserves both public originals byte-for-byte', () => {
    const originals = [
      ['airport.xer', 'a2f3b2469e26f19985ac801786c90edfb965a7bc194a6e57704aa845c5f8611f'],
      ['rehab-2.xer', '2c1dce175b9f078111a48dc13fd1777f5fbd4cd7ab6623e647e7437330c60b7f'],
    ]
    for (const [filename, checksum] of originals) {
      expect(createHash('sha256').update(readSample(filename)).digest('hex')).toBe(checksum)
    }
  })

  it('imports usable records and reports exactly the three documented row issues', () => {
    const result = parseXerBuffer(readSample('airport-errors.xer').buffer)

    expect(result.status).toBe('partial')
    expect(result.encoding).toBe('windows-1252')
    expect(result.projects[0].code).toBe('TERMINAL-2-DEMO-ERRORS')
    expect(result.activities).toHaveLength(66)
    expect(result.relationships).toHaveLength(83)
    expect(result.issues).toHaveLength(3)
    expect(result.issues).toMatchObject([
      { code: 'invalid-number', table: 'TASK', field: 'total_float_hr_cnt', line: 101 },
      { code: 'duplicate-id', table: 'TASK', field: 'task_id', line: 165 },
      { code: 'column-count', table: 'TASK', line: 166 },
    ])
    const lines = new TextDecoder('windows-1252').decode(readSample('airport-errors.xer')).split('\n')
    for (const issue of result.issues) {
      expect(issue.raw).toBe(lines[issue.line! - 1])
    }
    expect(result.tables.find((table) => table.name === 'TASK')).toMatchObject({
      rowCount: 68,
      rejectedRowCount: 2,
    })
    expect(result.tables.find((table) => table.name === 'TASKPRED')).toMatchObject({
      rowCount: 83,
      rejectedRowCount: 0,
    })
    expect(result.activities.find((activity) => activity.code === 'BA-P1-30')?.totalFloatHours).toBeNull()
    expect(result.activities.find((activity) => activity.id === '120010')).toMatchObject({
      code: 'BA-P1-10',
      source: { line: 100 },
    })
    expect(result.activities.some((activity) => activity.code === 'DEMO-BROKEN')).toBe(false)
  })

  it('keeps the original dependency data except for the one deliberate removal', () => {
    const original = parseXerBuffer(readSample('airport.xer').buffer)
    const modified = parseXerBuffer(readSample('airport-errors.xer').buffer)
    const expected = original.relationships
      .filter((relationship) => relationship.id !== '152737')
      .map((relationship) => relationship.source.raw)
    expect(modified.relationships.map((relationship) => relationship.source.raw)).toEqual(expected)
    expect(modified.relationships.some((relationship) => relationship.id === '152737')).toBe(false)
  })

  it('demonstrates all three schedule checks with explicit partial coverage', () => {
    const schedule = parseXerBuffer(readSample('airport-errors.xer').buffer)
    const report = runScheduleChecks(schedule)
    const missingLinks = report.checks['missing-links']
    const negativeFloat = report.checks['negative-float']
    const highFloat = report.checks['high-float']

    expect(missingLinks.findings).toHaveLength(1)
    expect(missingLinks.findings[0]).toMatchObject({
      check: 'missing-links',
      activity: { code: 'BA-P1-20' },
      line: 107,
      missing: ['predecessor'],
      certainty: 'confirmed',
    })
    expect(negativeFloat.findings).toHaveLength(1)
    expect(negativeFloat.findings[0]).toMatchObject({
      check: 'negative-float',
      activity: { code: 'BA-P1-40' },
      line: 102,
      totalFloatHours: -8,
      certainty: 'confirmed',
    })
    expect(highFloat.findings).toHaveLength(10)
    expect(report.findings).toHaveLength(12)
    expect(missingLinks).toMatchObject({
      status: 'partial',
      assessedCount: 66,
      unavailableCount: 0,
    })
    for (const check of [negativeFloat, highFloat]) {
      expect(check).toMatchObject({ status: 'partial', assessedCount: 65, unavailableCount: 1 })
    }
    for (const check of Object.values(report.checks)) {
      expect(check.excludedCount).toBe(0)
      expect(check.assessedCount + check.excludedCount + check.unavailableCount).toBe(66)
    }

    const original = runScheduleChecks(parseXerBuffer(readSample('airport.xer').buffer))
    expect(highFloat.findings.map((finding) => finding.activity.id)).toEqual(
      original.checks['high-float'].findings.map((finding) => finding.activity.id),
    )
  })
})
