import { CheckCircle2, CircleX, FileText, TriangleAlert } from "lucide-react";
import { FindingsExplorer } from "@/components/findings-explorer";
import { checkPresentation } from "@/lib/findings";
import type { ImportedSchedule } from "@/lib/schedule-import";
import type { XerIssue } from "@/lib/xer";

const number = new Intl.NumberFormat("en-US");

function ImportIssues({ issues }: { issues: XerIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <details className="rounded-xl border bg-card" open>
      <summary className="cursor-pointer px-5 py-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
        Import issues ({number.format(issues.length)})
      </summary>
      <div className="max-h-96 divide-y overflow-auto border-t">
        {issues.map((issue, index) => (
          <div key={index} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-md border px-2 py-0.5 font-medium text-foreground">
                {issue.severity}
              </span>
              <span>{issue.table ?? "File"}</span>
              {issue.line !== null && <span>Line {issue.line}</span>}
              {issue.field && <code>{issue.field}</code>}
            </div>
            <p className="mt-2 text-sm leading-6">{issue.message}</p>
            {issue.raw !== null && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  View source row
                </summary>
                <pre className="mt-2 max-w-full overflow-x-auto rounded-md bg-muted p-3 text-xs">
                  {issue.raw}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

export function ImportResults({ result }: { result: ImportedSchedule }) {
  const { schedule, checks } = result;
  const invalid = schedule.status === "invalid";
  const partial = schedule.status === "partial";
  const title = invalid
    ? "Unable to analyze this file"
    : partial
      ? "Imported with issues"
      : "Import complete";
  const Icon = invalid ? CircleX : partial ? TriangleAlert : CheckCircle2;
  const rejected = schedule.tables.reduce((total, table) => total + table.rejectedRowCount, 0);
  const projectCodes = schedule.projects.map((project) => project.code).join(", ");
  const bytes =
    result.byteLength >= 1_000_000
      ? (result.byteLength / 1_000_000).toFixed(1) + " MB"
      : Math.max(1, Math.round(result.byteLength / 1_000)) + " KB";

  return (
    <section aria-labelledby="result-heading" className="space-y-5">
      <div className="rounded-2xl border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-5">
          <div className="min-w-0">
            <h2
              id="result-heading"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight"
            >
              <Icon
                className={
                  "size-5 shrink-0 " +
                  (invalid ? "text-destructive" : partial ? "text-amber-600" : "text-emerald-600")
                }
                aria-hidden="true"
              />
              {title}
            </h2>
            <p className="mt-2 break-all text-sm text-muted-foreground">
              {result.filename} · {bytes}
            </p>
          </div>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            {result.origin === "local"
              ? "Local file"
              : result.modifiedExample
                ? "Deliberately modified example"
                : "Public original example"}
          </span>
        </div>
        <div className="px-6 py-5">
          <p className="break-words text-sm font-medium">
            {projectCodes || "No usable project data"}
          </p>
          {schedule.header && (
            <p className="mt-1 text-xs text-muted-foreground">
              P6 export {schedule.header.version} · Exported {schedule.header.exportedAt} ·{" "}
              {schedule.encoding}
            </p>
          )}
          <p
            role={invalid ? "alert" : "status"}
            className="mt-3 text-sm leading-6 text-muted-foreground"
          >
            {invalid
              ? "The required project and activity data could not be read. Review the import issues or choose another export."
              : partial
                ? "Usable records were retained. Review the import issues before interpreting the schedule checks."
                : "The file was read successfully. Schedule warnings are shown separately below."}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {[
              ["Projects", schedule.projects.length],
              ["Usable activities", schedule.activities.length],
              ["Relationships", schedule.relationships.length],
              ["Rejected rows", rejected],
            ].map(([label, count]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {number.format(Number(count))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <ImportIssues issues={schedule.issues} />
      {checks && (
        <section aria-labelledby="checks-heading">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="checks-heading" className="text-sm font-medium">
              Schedule checks
            </h3>
            <p className="text-xs text-muted-foreground">
              High float: more than {number.format(checks.highFloatThresholdHours)} hours
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.values(checks.checks).map((check) => (
              <div key={check.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-medium">{checkPresentation[check.id].label}</h4>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {check.status}
                  </span>
                </div>
                <p className="mt-3 text-3xl font-semibold tabular-nums">
                  {check.status === "unavailable" ? "—" : number.format(check.findings.length)}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {number.format(check.assessedCount)} assessed ·{" "}
                  {number.format(check.excludedCount)} excluded ·{" "}
                  {number.format(check.unavailableCount)} unavailable
                </p>
                {check.notes.length > 0 && (
                  <details className="mt-3 text-xs leading-5 text-muted-foreground">
                    <summary className="cursor-pointer">About this result</summary>
                    {check.notes.map((note) => (
                      <p key={note} className="mt-2">
                        {note}
                      </p>
                    ))}
                  </details>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Counts refer to usable activities. An activity can appear in more than one check.
          </p>
        </section>
      )}
      {checks && (
        <FindingsExplorer
          report={checks}
          projects={schedule.projects}
          activities={schedule.activities}
          relationships={schedule.relationships}
        />
      )}
    </section>
  );
}
