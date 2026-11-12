import type { PaginationState, SortingState, Updater } from '@tanstack/react-table'

import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Suspense, lazy, useId, useMemo, useState } from 'react'

import type { FindingFilters, FindingRow } from '@/lib/findings'
import type { ScheduleCheckId, ScheduleCheckReport, XerActivity, XerProject, XerRelationship } from '@/lib/xer'

import { ScheduleCharts } from '@/components/schedule-charts'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { checkPresentation, createCheckChartRows, createFindingRows, filterFindingRows } from '@/lib/findings'

const ActivitiesTable = lazy(() =>
  import('@/components/schedule-data-tables').then((module) => ({
    default: module.ActivitiesTable,
  })),
)
const RelationshipsTable = lazy(() =>
  import('@/components/schedule-data-tables').then((module) => ({
    default: module.RelationshipsTable,
  })),
)
const number = new Intl.NumberFormat('en-US')
const floatNumber = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 12 })
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})
const helper = createColumnHelper<typeof features, FindingRow>()
const columns = helper.columns([
  helper.accessor('activityCode', {
    header: 'Activity',
    sortFn: sortFn_alphanumeric,
    cell: ({ row }) => (
      <div className="max-w-64 min-w-40">
        <p className="font-medium">{row.original.activityCode}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.original.activityName}</p>
      </div>
    ),
  }),
  helper.accessor('project', { header: 'Project', sortFn: sortFn_text }),
  helper.accessor('checkLabel', {
    header: 'Check / reason',
    sortFn: sortFn_text,
    cell: ({ row }) => (
      <div className="max-w-72 min-w-44">
        <p className="font-medium">{row.original.checkLabel}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.original.message}</p>
      </div>
    ),
  }),
  helper.accessor('floatHours', {
    header: 'Float (h)',
    sortFn: sortFn_basic,
    sortUndefined: 'last',
    sortDescFirst: false,
    cell: ({ getValue }) => (getValue() === undefined ? '—' : floatNumber.format(getValue()!)),
  }),
  helper.accessor('certainty', {
    header: 'Certainty',
    sortFn: sortFn_text,
    cell: ({ getValue }) => (
      <span
        className={
          'inline-flex rounded-md border px-2 py-1 text-xs ' +
          (getValue() === 'uncertain' ? 'border-amber-300 text-amber-700' : 'text-muted-foreground')
        }
      >
        {getValue() === 'uncertain' ? 'Uncertain' : 'Confirmed'}
      </span>
    ),
  }),
  helper.accessor('line', {
    header: 'Source',
    sortFn: sortFn_basic,
    cell: ({ row, getValue }) => (
      <details className="min-w-24">
        <summary className="cursor-pointer text-xs whitespace-nowrap underline-offset-4 hover:underline">
          Line {getValue()}
        </summary>
        <pre className="mt-2 max-h-40 max-w-64 overflow-auto rounded-md bg-muted p-3 text-xs">{row.original.raw}</pre>
      </details>
    ),
  }),
])
const initialFilters: FindingFilters = { search: '', check: 'all', certainty: 'all' }
const controlClass =
  'h-10 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50'

export function FindingsExplorer({
  report,
  projects,
  activities,
  relationships,
}: {
  report: ScheduleCheckReport
  projects: XerProject[]
  activities: XerActivity[]
  relationships: XerRelationship[]
}) {
  const [filters, setFilters] = useState<FindingFilters>(initialFilters)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'activityCode', desc: false }])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 })
  const controlId = useId()
  const rows = useMemo(() => createFindingRows(report.findings, projects), [report.findings, projects])
  const filtered = useMemo(() => filterFindingRows(rows, filters), [rows, filters])
  const chartRows = useMemo(() => createCheckChartRows(report), [report])

  function updateFilters(update: Partial<FindingFilters>) {
    setFilters((previous) => ({ ...previous, ...update }))
    setPagination((previous) => ({ ...previous, pageIndex: 0 }))
  }
  function selectChartCheck(check: ScheduleCheckId) {
    updateFilters({ check: filters.check === check ? 'all' : check })
  }
  function updateSorting(update: Updater<SortingState>) {
    setSorting(update)
    setPagination((previous) => ({ ...previous, pageIndex: 0 }))
  }
  function clearFilters() {
    setFilters(initialFilters)
    setPagination((previous) => ({ ...previous, pageIndex: 0 }))
  }

  const table = useTable({
    features,
    columns,
    data: filtered,
    getRowId: (row) => row.id,
    state: { sorting, pagination },
    onSortingChange: updateSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    enableMultiSort: false,
    enableSortingRemoval: false,
  })
  const pageRows = table.getRowModel().rows
  const totalPages = Math.max(1, table.getPageCount())
  const first = filtered.length === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
  const last = Math.min(filtered.length, first + pageRows.length - 1)
  const hasFilters = filters.search !== '' || filters.check !== 'all' || filters.certainty !== 'all'
  const incomplete = Object.values(report.checks).some((check) => check.status !== 'complete')

  return (
    <div className="space-y-5">
      <ScheduleCharts
        activities={activities}
        projects={projects}
        checks={report}
        checkRows={chartRows}
        selectedCheck={filters.check}
        onSelectCheck={selectChartCheck}
      />
      <Tabs defaultValue="activities">
        <TabsList aria-label="Schedule table views" className="grid grid-cols-3">
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="findings">Findings</TabsTrigger>
        </TabsList>
        <TabsContent value="activities" className="pt-3">
          <Suspense fallback={<TableLoading />}>
            <ActivitiesTable activities={activities} projects={projects} report={report} />
          </Suspense>
        </TabsContent>
        <TabsContent value="relationships" className="pt-3">
          <Suspense fallback={<TableLoading />}>
            <RelationshipsTable relationships={relationships} activities={activities} projects={projects} />
          </Suspense>
        </TabsContent>
        <TabsContent value="findings" className="pt-3">
          <section aria-labelledby="findings-heading" className="min-w-0 rounded-2xl border bg-card">
            <div className="space-y-4 border-b p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h3 id="findings-heading" className="font-semibold tracking-tight">
                    Schedule findings
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {number.format(filtered.length)} of {number.format(rows.length)} findings
                  </p>
                </div>
                {hasFilters && (
                  <Button type="button" variant="ghost" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor={controlId + '-search'} className="mb-1.5 block text-xs font-medium">
                    Search findings
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <input
                      id={controlId + '-search'}
                      type="search"
                      placeholder="Activity, project, or reason…"
                      className={controlClass + ' w-full pl-9'}
                      value={filters.search}
                      onChange={(event) => updateFilters({ search: event.currentTarget.value })}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor={controlId + '-check'} className="mb-1.5 block text-xs font-medium">
                    Check type
                  </label>
                  <select
                    id={controlId + '-check'}
                    className={controlClass + ' w-full'}
                    value={filters.check}
                    onChange={(event) => updateFilters({ check: event.currentTarget.value as FindingFilters['check'] })}
                  >
                    <option value="all">All checks</option>
                    {Object.entries(checkPresentation).map(([id, presentation]) => (
                      <option key={id} value={id}>
                        {presentation.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={controlId + '-certainty'} className="mb-1.5 block text-xs font-medium">
                    Certainty
                  </label>
                  <select
                    id={controlId + '-certainty'}
                    className={controlClass + ' w-full'}
                    value={filters.certainty}
                    onChange={(event) =>
                      updateFilters({
                        certainty: event.currentTarget.value as FindingFilters['certainty'],
                      })
                    }
                  >
                    <option value="all">All findings</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="uncertain">Uncertain</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Schedule findings, with activity, project, reason, float in hours, certainty, and source row.
                </caption>
                <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                  {table.getHeaderGroups().map((group) => (
                    <tr key={group.id}>
                      {group.headers.map((header) => {
                        const direction = header.column.getIsSorted()
                        const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown
                        return (
                          <th
                            key={header.id}
                            scope="col"
                            aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
                            className="px-4 py-3 font-medium"
                          >
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="flex min-h-8 items-center gap-2 rounded-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              <table.FlexRender header={header} />
                              <Icon className="size-3.5" aria-hidden="true" />
                            </button>
                          </th>
                        )
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y">
                  {pageRows.map((row) => (
                    <tr key={row.id} className="align-top hover:bg-muted/20">
                      {row.getAllCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={
                            'px-4 py-4 ' + (cell.column.id === 'floatHours' ? 'whitespace-nowrap tabular-nums' : '')
                          }
                        >
                          <table.FlexRender cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-muted-foreground">
                        {hasFilters
                          ? 'No findings match these filters.'
                          : incomplete
                            ? 'No findings in the assessed data. Some checks are partial or unavailable.'
                            : 'No schedule findings in the assessed activities.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t px-5 py-4">
              <p role="status" className="text-xs text-muted-foreground">
                Showing {number.format(first)}–{number.format(Math.max(0, last))} of {number.format(filtered.length)}{' '}
                findings
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Rows per page
                  <select
                    className={controlClass + ' h-8'}
                    value={pagination.pageSize}
                    onChange={(event) => setPagination({ pageIndex: 0, pageSize: Number(event.currentTarget.value) })}
                  >
                    {[10, 25, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-xs text-muted-foreground">
                  Page {number.format(pagination.pageIndex + 1)} of {number.format(totalPages)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Previous page"
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.previousPage()}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Next page"
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.nextPage()}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TableLoading() {
  return (
    <div
      aria-label="Loading table"
      className="flex min-h-60 items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground"
    >
      Loading schedule rows…
    </div>
  )
}
