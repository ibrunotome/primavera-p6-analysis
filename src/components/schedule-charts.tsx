import { Suspense, lazy } from 'react'

import type { CheckChartRow } from '@/lib/findings'
import type { ScheduleCheckReport, XerActivity, XerProject } from '@/lib/xer'

import { FindingsChart } from '@/components/findings-chart'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const FloatDistributionChart = lazy(() =>
  import('./activity-charts').then((module) => ({ default: module.FloatDistributionChart })),
)
const ActivityStatusChart = lazy(() =>
  import('./activity-charts').then((module) => ({ default: module.ActivityStatusChart })),
)
const ActivityTimelineChart = lazy(() =>
  import('./activity-charts').then((module) => ({ default: module.ActivityTimelineChart })),
)

function ChartLoading() {
  return (
    <div
      aria-label="Loading chart"
      className="flex min-h-72 items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground"
    >
      Loading chart…
    </div>
  )
}

export function ScheduleCharts({
  activities,
  projects,
  checks,
  checkRows,
  selectedCheck,
  onSelectCheck,
}: {
  activities: XerActivity[]
  projects: XerProject[]
  checks: ScheduleCheckReport
  checkRows: CheckChartRow[]
  selectedCheck: 'all' | CheckChartRow['id']
  onSelectCheck: (check: CheckChartRow['id']) => void
}) {
  return (
    <section aria-labelledby="schedule-charts-heading" className="space-y-3">
      <div>
        <h3 id="schedule-charts-heading" className="font-semibold tracking-tight">
          Schedule charts
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Explore findings and the imported schedule from different angles.
        </p>
      </div>
      <div className="min-w-0 rounded-2xl border bg-card p-2 sm:p-3">
        <Tabs defaultValue="checks">
          <TabsList aria-label="Schedule chart views" className="grid grid-cols-2 md:grid-cols-4">
            <TabsTrigger value="checks">Check totals</TabsTrigger>
            <TabsTrigger value="float">Float ranges</TabsTrigger>
            <TabsTrigger value="status">Activity status</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>
          <TabsContent value="checks" className="pt-3">
            <FindingsChart rows={checkRows} selected={selectedCheck} onSelect={onSelectCheck} />
          </TabsContent>
          <TabsContent value="float" className="pt-3">
            <Suspense fallback={<ChartLoading />}>
              <FloatDistributionChart activities={activities} threshold={checks.highFloatThresholdHours} />
            </Suspense>
          </TabsContent>
          <TabsContent value="status" className="pt-3">
            <Suspense fallback={<ChartLoading />}>
              <ActivityStatusChart activities={activities} />
            </Suspense>
          </TabsContent>
          <TabsContent value="timeline" className="pt-3">
            <Suspense fallback={<ChartLoading />}>
              <ActivityTimelineChart activities={activities} projects={projects} />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}
