import { useMemo, useState } from "react";
import { barX, defineChart, dot, rect, text } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scaleUtc } from "@tanstack/charts/scales/time";
import { tooltip } from "@tanstack/charts/tooltip";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { XerActivity, XerProject } from "@/lib/xer";

const number = new Intl.NumberFormat("en-US");
const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
const timelinePageSize = 25;

interface CountChartRow {
  id: string;
  label: string;
  count: number;
  color: string;
}

function CountChart({
  title,
  description,
  rows,
  ariaLabel,
  emptyMessage,
}: {
  title: string;
  description: string;
  rows: CountChartRow[];
  ariaLabel: string;
  emptyMessage: string;
}) {
  const definition = useMemo(
    function defineActivityCountChart() {
      const max = Math.max(0, ...rows.map((row) => row.count));
      const step = Math.max(1, Math.ceil(max / 4));
      return defineChart({
        marks: [
          barX(rows, {
            x: "count",
            y: "label",
            key: "id",
            fill: (row) => row.color,
            radius: 4,
            maxThickness: 34,
          }),
          text(rows, {
            x: "count",
            y: "label",
            text: (row) => number.format(row.count),
            dx: 8,
            anchor: "start",
            fontSize: 12,
            fill: "var(--foreground)",
          }),
        ],
        scales: {
          x: {
            scale: () => scaleLinear().domain([0, step * 5]),
            grid: true,
            axis: {
              label: "Usable activities",
              ticks: {
                values: Array.from({ length: 6 }, (_, index) => index * step),
                format: (value) => number.format(value),
              },
            },
          },
          y: { scale: () => scaleBand().padding(0.3) },
        },
        tooltip,
      });
    },
    [rows],
  );

  return (
    <section aria-label={title} className="rounded-2xl border bg-card p-4 sm:p-6">
      <h4 className="font-semibold tracking-tight">{title}</h4>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      {rows.some((row) => row.count > 0) ? (
        <Chart definition={definition} height={240} ariaLabel={ariaLabel} />
      ) : (
        <p className="flex min-h-48 items-center justify-center text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      )}
    </section>
  );
}

function createFloatRows(activities: XerActivity[], threshold: number): CountChartRow[] {
  const counts = [
    { id: "negative", label: "Negative · < 0 h", count: 0, color: "#dc2626" },
    { id: "zero", label: "Zero · 0 h", count: 0, color: "#b45309" },
    {
      id: "positive",
      label: "Positive · > 0 to ≤ " + number.format(threshold) + " h",
      count: 0,
      color: "#0f766e",
    },
    {
      id: "high",
      label: "High · > " + number.format(threshold) + " h",
      count: 0,
      color: "#2563eb",
    },
    { id: "missing", label: "Float unavailable", count: 0, color: "#737373" },
  ];

  for (const activity of activities) {
    const hours = activity.totalFloatHours;
    if (hours === null || !Number.isFinite(hours)) counts[4].count++;
    else if (hours < 0) counts[0].count++;
    else if (hours === 0) counts[1].count++;
    else if (hours <= threshold) counts[2].count++;
    else counts[3].count++;
  }
  return counts;
}

function createStatusRows(activities: XerActivity[]): CountChartRow[] {
  const counts = [
    { id: "not-started", label: "Not started", count: 0, color: "#64748b" },
    { id: "in-progress", label: "In progress", count: 0, color: "#2563eb" },
    { id: "completed", label: "Completed", count: 0, color: "#15803d" },
    { id: "other", label: "Other or missing status", count: 0, color: "#a16207" },
  ];

  for (const activity of activities) {
    if (activity.status === "TK_NotStart") counts[0].count++;
    else if (activity.status === "TK_Active") counts[1].count++;
    else if (activity.status === "TK_Complete") counts[2].count++;
    else counts[3].count++;
  }
  return counts;
}

export function FloatDistributionChart({
  activities,
  threshold,
}: {
  activities: XerActivity[];
  threshold: number;
}) {
  const rows = useMemo(() => createFloatRows(activities, threshold), [activities, threshold]);
  return (
    <CountChart
      title="Total float distribution"
      description="Imported total float grouped into ranges. This includes every usable activity, including completed and summary rows."
      rows={rows}
      ariaLabel="Usable activities grouped by imported total float"
      emptyMessage="No usable activities were imported."
    />
  );
}

export function ActivityStatusChart({ activities }: { activities: XerActivity[] }) {
  const rows = useMemo(() => createStatusRows(activities), [activities]);
  return (
    <CountChart
      title="Activity status"
      description="Imported P6 status codes grouped into familiar schedule states. Unknown and blank codes are counted separately."
      rows={rows}
      ariaLabel="Usable activities grouped by Primavera P6 status"
      emptyMessage="No usable activities were imported."
    />
  );
}

function parseXerDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const [y, m, d, h, min, sec] = parts;
  const timestamp = Date.UTC(y, m - 1, d, h, min, sec);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d ||
    date.getUTCHours() !== h ||
    date.getUTCMinutes() !== min ||
    date.getUTCSeconds() !== sec
  ) {
    return null;
  }
  return date;
}

interface TimelineRow {
  id: string;
  code: string;
  name: string;
  project: string;
  start: Date;
  finish: Date;
  milestone: boolean;
}

function createTimelineRows(activities: XerActivity[], projects: XerProject[]): TimelineRow[] {
  const projectCodes = new Map(projects.map((project) => [project.id, project.code]));
  const multipleProjects = projects.length > 1;
  return activities.flatMap((activity) => {
    const start = parseXerDate(activity.source.fields.early_start_date);
    const finish = parseXerDate(activity.source.fields.early_end_date);
    if (!start || !finish || finish < start) return [];
    const project = projectCodes.get(activity.projectId) ?? activity.projectId;
    return [
      {
        id: JSON.stringify([activity.projectId, activity.id]),
        code: multipleProjects ? project + " · " + activity.code : activity.code,
        name: activity.name,
        project,
        start,
        finish,
        milestone: activity.type === "TT_Mile" || activity.type === "TT_FinMile",
      },
    ];
  });
}

export function ActivityTimelineChart({
  activities,
  projects,
}: {
  activities: XerActivity[];
  projects: XerProject[];
}) {
  const [projectFilter, setProjectFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const allRows = useMemo(() => createTimelineRows(activities, projects), [activities, projects]);
  const query = search.trim().toLocaleLowerCase("en-US");
  const filteredRows = useMemo(
    () =>
      allRows.filter((row) => {
        if (projectFilter !== "all" && row.project !== projectFilter) return false;
        if (!query) return true;
        return [row.code, row.name, row.project]
          .join(" ")
          .toLocaleLowerCase("en-US")
          .includes(query);
      }),
    [allRows, projectFilter, query],
  );
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / timelinePageSize));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const visibleRows = useMemo(
    () => filteredRows.slice(currentPage * timelinePageSize, (currentPage + 1) * timelinePageSize),
    [filteredRows, currentPage],
  );
  const definition = useMemo(
    function defineActivityTimeline() {
      const tasks = visibleRows.filter((row) => !row.milestone);
      const milestones = visibleRows.filter((row) => row.milestone);
      return defineChart({
        marks: [
          rect(tasks, {
            x1: "start",
            x2: "finish",
            y: "code",
            key: "id",
            fill: "#2563eb",
            radius: 3,
          }),
          dot(milestones, {
            x: "start",
            y: "code",
            key: "id",
            r: 5,
            fill: "#b45309",
          }),
        ],
        scales: {
          x: {
            scale: () => scaleUtc(),
            grid: true,
            axis: {
              label: "Early schedule dates",
              ticks: {
                format: (value) =>
                  shortDate.format(value instanceof Date ? value : new Date(value)),
              },
            },
          },
          y: {
            scale: () => scaleBand().padding(0.22),
            axis: {
              label: "Activity",
              ticks: {
                format: (value) => (value.length > 24 ? value.slice(0, 23) + "…" : value),
              },
            },
          },
        },
        tooltip,
      });
    },
    [visibleRows],
  );
  const projectOptions = useMemo(
    () =>
      [...new Set(allRows.map((row) => row.project))].sort((left, right) =>
        left.localeCompare(right),
      ),
    [allRows],
  );
  const first = filteredRows.length === 0 ? 0 : currentPage * timelinePageSize + 1;
  const last = Math.min(filteredRows.length, first + visibleRows.length - 1);
  const withoutDates = activities.length - allRows.length;
  const controlClass =
    "h-10 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

  function changeProject(value: string) {
    setProjectFilter(value);
    setPageIndex(0);
  }

  function changeSearch(value: string) {
    setSearch(value);
    setPageIndex(0);
  }

  return (
    <section aria-label="Activity timeline" className="rounded-2xl border bg-card p-4 sm:p-6">
      <div>
        <h4 className="font-semibold tracking-tight">Activity timeline</h4>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Early start and finish dates from the XER export. Each bar is one activity; milestones
          appear as points. Dates are displayed in UTC to preserve the exported date and time.
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        {projectOptions.length > 1 && (
          <div className="sm:w-64">
            <label className="mb-1.5 block text-xs font-medium" htmlFor="timeline-project">
              Project
            </label>
            <select
              id="timeline-project"
              className={controlClass + " w-full"}
              value={projectFilter}
              onChange={(event) => changeProject(event.currentTarget.value)}
            >
              <option value="all">All projects</option>
              {projectOptions.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <label className="mb-1.5 block text-xs font-medium" htmlFor="timeline-search">
            Find activities
          </label>
          <input
            id="timeline-search"
            type="search"
            className={controlClass + " w-full"}
            placeholder="Activity code, name, or project…"
            value={search}
            onChange={(event) => changeSearch(event.currentTarget.value)}
          />
        </div>
      </div>
      {visibleRows.length > 0 ? (
        <div className="mt-3 min-w-0 overflow-x-auto">
          <Chart
            definition={definition}
            height={Math.max(300, visibleRows.length * 18 + 100)}
            ariaLabel="Activity early start and finish timeline"
            ariaDescription="Early schedule dates from the XER. Use the search and project controls to find activities; the chart pages through 25 at a time."
          />
        </div>
      ) : (
        <p className="mt-4 flex min-h-48 items-center justify-center text-center text-sm text-muted-foreground">
          {allRows.length === 0
            ? "The imported activities do not include usable early start and finish dates."
            : "No activities match this project and search."}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-xs leading-5 text-muted-foreground">
          Showing {number.format(first)}–{number.format(Math.max(first, last))} of{" "}
          {number.format(filteredRows.length)} activities with dates
          {withoutDates > 0
            ? " · " + number.format(withoutDates) + " activities in the file have no usable dates"
            : ""}
        </p>
        <div className="flex items-center gap-3 self-end">
          <span className="text-xs text-muted-foreground">
            Page {number.format(currentPage + 1)} of {number.format(pageCount)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous timeline page"
            disabled={currentPage === 0}
            onClick={() => setPageIndex((previous) => Math.max(0, previous - 1))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next timeline page"
            disabled={currentPage + 1 >= pageCount}
            onClick={() => setPageIndex((previous) => Math.min(pageCount - 1, previous + 1))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}
