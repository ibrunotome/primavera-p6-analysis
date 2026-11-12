import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// @vitest-environment jsdom
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { parseXer, parseXerBuffer, runScheduleChecks } from '@/lib/xer'

import { FindingsExplorer } from './findings-explorer'

const bytes = new Uint8Array(readFileSync(resolve('public/samples/airport-errors.xer')))

function showFixture(truncated = false, activeTable: 'Activities' | 'Relationships' | 'Findings' = 'Findings') {
  const schedule = truncated
    ? parseXer(new TextDecoder('windows-1252').decode(bytes).replace(/\n%E\s*$/, ''))
    : parseXerBuffer(bytes.buffer)
  const report = runScheduleChecks(schedule)
  const view = render(
    <FindingsExplorer
      report={report}
      projects={schedule.projects}
      activities={schedule.activities}
      relationships={schedule.relationships}
    />,
  )
  if (activeTable !== 'Activities') fireEvent.click(screen.getByRole('tab', { name: activeTable }))
  return { ...view, report }
}

function table() {
  return screen.getByRole('table')
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('findings table and chart', () => {
  it('renders the real SVG chart, exact counts and the 12 source-backed findings', () => {
    const { container } = showFixture()
    expect(container.querySelector("svg[aria-label='Schedule findings by check']")).not.toBeNull()
    expect(within(table()).getAllByRole('row')).toHaveLength(13)
    expect(screen.getByRole('button', { name: /High float · 10/ })).toBeDefined()
    expect(screen.getByText('12 of 12 findings')).toBeDefined()
  })

  it('browses all activities and searches by activity code', async () => {
    const user = userEvent.setup()
    showFixture(false, 'Activities')
    expect(await screen.findByText('66 activities')).toBeDefined()
    expect(screen.getByText('Showing 1–25 of 66 activities')).toBeDefined()
    expect(within(table()).getAllByRole('row')).toHaveLength(26)
    expect(within(table()).getByText('Negative float')).toBeDefined()

    await user.type(screen.getByRole('searchbox', { name: 'Search activities' }), 'BA-P1-40')
    expect(within(table()).getAllByRole('row')).toHaveLength(2)
    expect(within(table()).getByText('P.C For Footings')).toBeDefined()
  })

  it('browses and paginates imported predecessor-to-successor relationships', async () => {
    const user = userEvent.setup()
    showFixture(false, 'Relationships')
    expect(await screen.findByText('83 relationships')).toBeDefined()
    expect(screen.getByText('Showing 1–25 of 83 relationships')).toBeDefined()
    expect(screen.getByRole('columnheader', { name: 'Relationship' })).toBeDefined()
    expect(within(table()).getAllByRole('row')).toHaveLength(26)

    await user.click(screen.getByRole('button', { name: 'Next relationships page' }))
    expect(screen.getByText('Showing 26–50 of 83 relationships')).toBeDefined()
    expect(within(table()).getAllByRole('row')).toHaveLength(26)
  })

  it('searches findings and leaves chart totals unchanged', async () => {
    const user = userEvent.setup()
    showFixture()
    await user.type(screen.getByRole('searchbox', { name: 'Search findings' }), 'ba-p1-40')
    expect(within(table()).getAllByRole('row')).toHaveLength(2)
    expect(within(table()).getByText('BA-P1-40')).toBeDefined()
    expect(screen.getByText('1 of 12 findings')).toBeDefined()
    expect(screen.getByRole('button', { name: /High float · 10/ })).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(within(table()).getAllByRole('row')).toHaveLength(13)
  })

  it('shares the check filter between chart controls and the table dropdown', async () => {
    const user = userEvent.setup()
    showFixture()
    const negative = screen.getByRole('button', { name: /Negative float · 1/ })
    await user.click(negative)
    expect(negative.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Check type')).toHaveProperty('value', 'negative-float')
    expect(within(table()).getAllByRole('row')).toHaveLength(2)
    await user.click(negative)
    expect(within(table()).getAllByRole('row')).toHaveLength(13)
    await user.selectOptions(screen.getByLabelText('Check type'), 'high-float')
    expect(within(table()).getAllByRole('row')).toHaveLength(11)
    expect(screen.getByRole('button', { name: /High float · 10/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('lets the chart keyboard selection filter the actual table', () => {
    const { container } = showFixture()
    const svg = container.querySelector("svg[aria-label='Schedule findings by check']")!
    fireEvent.focus(svg)
    fireEvent.keyDown(svg, { key: 'End' })
    fireEvent.keyDown(svg, { key: 'Enter' })
    expect(screen.getByLabelText('Check type')).toHaveProperty('value', 'high-float')
    expect(within(table()).getAllByRole('row')).toHaveLength(11)
  })

  it('paginates and resets the page after changing filters or page size', async () => {
    const user = userEvent.setup()
    showFixture()
    await user.selectOptions(screen.getByLabelText('Rows per page'), '10')
    expect(within(table()).getAllByRole('row')).toHaveLength(11)
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Page 2 of 2')).toBeDefined()
    expect(within(table()).getAllByRole('row')).toHaveLength(3)
    await user.selectOptions(screen.getByLabelText('Check type'), 'negative-float')
    expect(screen.getByText('Page 1 of 1')).toBeDefined()
    expect(within(table()).getAllByRole('row')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true)
  })

  it('sorts float numerically and updates the accessible header state', async () => {
    const user = userEvent.setup()
    showFixture()
    const header = screen.getByRole('columnheader', { name: 'Float (h)' })
    await user.click(within(header).getByRole('button'))
    expect(header.getAttribute('aria-sort')).toBe('ascending')
    const ascendingRows = within(table()).getAllByRole('row').slice(1)
    expect(within(ascendingRows[0]).getByText('-8')).toBeDefined()
    await user.click(within(header).getByRole('button'))
    expect(header.getAttribute('aria-sort')).toBe('descending')
    const descendingRows = within(table()).getAllByRole('row').slice(1)
    expect(within(descendingRows.at(-1)!).getByText('-8')).toBeDefined()
  })

  it('filters uncertain findings and shows an actionable empty state', async () => {
    const user = userEvent.setup()
    showFixture(true)
    await user.selectOptions(screen.getByLabelText('Certainty'), 'uncertain')
    expect(within(table()).getAllByRole('row')).toHaveLength(2)
    expect(within(table()).getByText('Uncertain')).toBeDefined()
    await user.selectOptions(screen.getByLabelText('Check type'), 'negative-float')
    expect(screen.getByText('No findings match these filters.')).toBeDefined()
    expect(screen.getByText('Showing 0–0 of 0 findings')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(within(table()).getAllByRole('row')).toHaveLength(13)
  })

  it('keeps missing float last in both sort directions and displays small negative values', async () => {
    const user = userEvent.setup()
    const schedule = parseXerBuffer(bytes.buffer)
    schedule.activities.find((activity) => activity.code === 'BA-P1-20')!.totalFloatHours = null
    schedule.activities.find((activity) => activity.code === 'BA-P1-40')!.totalFloatHours = -0.001
    render(
      <FindingsExplorer
        report={runScheduleChecks(schedule)}
        projects={schedule.projects}
        activities={schedule.activities}
        relationships={schedule.relationships}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Findings' }))
    const header = screen.getByRole('columnheader', { name: 'Float (h)' })
    await user.click(within(header).getByRole('button'))
    const ascending = within(table()).getAllByRole('row').slice(1)
    expect(within(ascending[0]).getByText('-0.001')).toBeDefined()
    expect(within(ascending.at(-1)!).getByText('BA-P1-20')).toBeDefined()
    expect(within(ascending.at(-1)!).getByText('—')).toBeDefined()
    await user.click(within(header).getByRole('button'))
    const descending = within(table()).getAllByRole('row').slice(1)
    expect(within(descending.at(-1)!).getByText('BA-P1-20')).toBeDefined()
    expect(within(descending.at(-1)!).getByText('—')).toBeDefined()
  })

  it('exposes the original source row for a finding', async () => {
    const user = userEvent.setup()
    showFixture()
    const source = within(table()).getByText('Line 102')
    await user.click(source)
    const disclosure = source.closest('details')!
    expect(disclosure.open).toBe(true)
    expect(disclosure.querySelector('pre')?.textContent).toContain('\t-8\t')
  })

  it('renders unavailable checks without presenting their counts as zero', () => {
    const schedule = parseXer(
      [
        'ERMHDR\t23.12\t2026-01-01',
        '%T\tPROJECT',
        '%F\tproj_id\tproj_short_name',
        '%R\t100\tDEMO',
        '%T\tTASK',
        '%F\ttask_id\tproj_id\ttask_code\ttask_type\tstatus_code\ttotal_float_hr_cnt',
        '%R\t1\t100\tA1\tTT_Task\tTK_NotStart\t',
        '%E',
      ].join('\n'),
    )
    render(
      <FindingsExplorer
        report={runScheduleChecks(schedule)}
        projects={schedule.projects}
        activities={schedule.activities}
        relationships={schedule.relationships}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Findings' }))
    expect(screen.getByText('No checks could be assessed from the available data.')).toBeDefined()
    for (const label of ['Missing links', 'Negative float', 'High float']) {
      expect(screen.getByRole('button', { name: label + ' · Unavailable' })).toHaveProperty('disabled', true)
    }
    expect(screen.getByText('No findings in the assessed data. Some checks are partial or unavailable.')).toBeDefined()
  })
})
