import { useMemo } from "react";
import { barX, defineChart, text } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Button } from "@/components/ui/button";
import type { CheckChartRow, FindingFilters } from "@/lib/findings";
import type { ScheduleCheckId } from "@/lib/xer";

const number = new Intl.NumberFormat("en-US");

interface FindingsChartProps {
  rows: CheckChartRow[];
  selected: FindingFilters["check"];
  onSelect: (check: ScheduleCheckId) => void;
}

export function FindingsChart({ rows, selected, onSelect }: FindingsChartProps) {
  const available = useMemo(
    () => rows.flatMap((row) => (row.count === null ? [] : [{ ...row, count: row.count }])),
    [rows],
  );
  const definition = useMemo(
    function defineFindingsChart() {
      const max = Math.max(0, ...available.map((row) => row.count));
      const step = Math.max(1, Math.ceil(max / 4));
      return defineChart({
        marks: [
          barX(available, {
            x: "count",
            y: "label",
            key: "id",
            fill: (row) => (selected === "all" || selected === row.id ? row.color : "var(--muted)"),
            radius: 4,
            maxThickness: 34,
          }),
          text(available, {
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
              label: "Activity findings",
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
    [available, selected],
  );
  const incomplete = rows.some((row) => row.status !== "complete");
  const uncertain = rows.some((row) => row.uncertainCount > 0);

  return (
    <section
      aria-labelledby="findings-chart-heading"
      className="rounded-2xl border bg-card p-5 sm:p-6"
    >
      <h3 id="findings-chart-heading" className="font-semibold tracking-tight">
        Findings by check
      </h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Select a bar or a check below to filter the findings table.
      </p>
      {available.length > 0 ? (
        <Chart
          definition={definition}
          height={240}
          ariaLabel="Schedule findings by check"
          ariaDescription="Full check totals. Use arrow keys to navigate, then Enter to filter the table. Exact counts are also available in the buttons below."
          onSelect={(point) => {
            if (point) onSelect(point.datum.id);
          }}
        />
      ) : (
        <p className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
          No checks could be assessed from the available data.
        </p>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter findings by check">
        {rows.map((row) => (
          <Button
            key={row.id}
            type="button"
            variant="outline"
            className="h-auto min-h-10 whitespace-normal py-2 text-left"
            disabled={row.count === null}
            aria-pressed={selected === row.id}
            onClick={() => onSelect(row.id)}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: row.color }}
              aria-hidden="true"
            />
            {row.label} · {row.count === null ? "Unavailable" : number.format(row.count)}
            {row.status === "partial" && (
              <span className="text-xs text-muted-foreground">(partial)</span>
            )}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Totals stay the same when the table is filtered. Activities can appear in multiple checks.
        {incomplete &&
          " Some check totals cover partial data; unavailable checks are omitted from the chart."}
        {uncertain && " Counts include uncertain findings."}
      </p>
    </section>
  );
}
