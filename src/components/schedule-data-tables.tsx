import { useId, useMemo, useState } from "react";
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
} from "@tanstack/react-table";
import type {
  PaginationState,
  ReactTable,
  RowData,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkPresentation } from "@/lib/findings";
import type { ScheduleCheckReport, XerActivity, XerProject, XerRelationship } from "@/lib/xer";

const number = new Intl.NumberFormat("en-US");
const floatNumber = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 12 });
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});
const controlClass =
  "h-10 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

interface ActivityDataRow {
  id: string;
  activityCode: string;
  activityName: string;
  project: string;
  type: string;
  status: string;
  floatHours: number | undefined;
  earlyStart: string;
  earlyFinish: string;
  flagSummary: string;
  flags: string[];
  line: number;
  raw: string;
}

interface RelationshipDataRow {
  id: string;
  predecessorCode: string;
  predecessorName: string;
  predecessorProject: string;
  typeCode: string;
  relationshipType: string;
  lagHours: number | undefined;
  successorCode: string;
  successorName: string;
  successorProject: string;
  scope: string;
  line: number;
  raw: string;
}

function activityKey(projectId: string, activityId: string): string {
  return JSON.stringify([projectId, activityId]);
}

function formatActivityType(type: string | null): string {
  const labels: Record<string, string> = {
    TT_Task: "Task",
    TT_Rsrc: "Resource-dependent",
    TT_Mile: "Start milestone",
    TT_FinMile: "Finish milestone",
    TT_LOE: "Level of effort",
    TT_WBS: "WBS summary",
  };
  return type === null ? "Not provided" : (labels[type] ?? type);
}

function formatActivityStatus(status: string | null): string {
  const labels: Record<string, string> = {
    TK_NotStart: "Not started",
    TK_Active: "In progress",
    TK_Complete: "Completed",
  };
  return status === null ? "Not provided" : (labels[status] ?? status);
}

function createActivityRows(
  activities: XerActivity[],
  projects: XerProject[],
  report: ScheduleCheckReport,
): ActivityDataRow[] {
  const projectCodes = new Map(projects.map((project) => [project.id, project.code]));
  const flagsByActivity = new Map<string, Set<string>>();

  for (const finding of report.findings) {
    const key = activityKey(finding.activity.projectId, finding.activity.id);
    const flags = flagsByActivity.get(key) ?? new Set<string>();
    flags.add(checkPresentation[finding.check].label);
    flagsByActivity.set(key, flags);
  }

  return activities.map((activity) => {
    const flags = [...(flagsByActivity.get(activityKey(activity.projectId, activity.id)) ?? [])];
    return {
      id: activityKey(activity.projectId, activity.id),
      activityCode: activity.code,
      activityName: activity.name,
      project: projectCodes.get(activity.projectId) ?? activity.projectId,
      type: formatActivityType(activity.type),
      status: formatActivityStatus(activity.status),
      floatHours: activity.totalFloatHours ?? undefined,
      earlyStart: activity.source.fields.early_start_date?.trim() || "—",
      earlyFinish: activity.source.fields.early_end_date?.trim() || "—",
      flagSummary: flags.join(", "),
      flags,
      line: activity.source.line,
      raw: activity.source.raw,
    };
  });
}

function relationshipLabel(type: string | null): string {
  const labels: Record<string, string> = {
    PR_FS: "Finish → Start",
    PR_SS: "Start → Start",
    PR_FF: "Finish → Finish",
    PR_SF: "Start → Finish",
  };
  return type === null ? "Not provided" : (labels[type] ?? type);
}

function createRelationshipRows(
  relationships: XerRelationship[],
  activities: XerActivity[],
  projects: XerProject[],
): RelationshipDataRow[] {
  const projectCodes = new Map(projects.map((project) => [project.id, project.code]));
  const activitiesByKey = new Map(
    activities.map((activity) => [activityKey(activity.projectId, activity.id), activity]),
  );

  function endpoint(projectId: string, activityId: string) {
    const activity = activitiesByKey.get(activityKey(projectId, activityId));
    return {
      code: activity?.code ?? "Activity " + activityId,
      name: activity?.name ?? "",
      project: projectCodes.get(projectId) ?? projectId,
    };
  }

  return relationships.map((relationship) => {
    const predecessor = endpoint(relationship.predecessorProjectId, relationship.predecessorId);
    const successor = endpoint(relationship.successorProjectId, relationship.successorId);
    return {
      id: String(relationship.source.line),
      predecessorCode: predecessor.code,
      predecessorName: predecessor.name,
      predecessorProject: predecessor.project,
      typeCode: relationship.type ?? "",
      relationshipType: relationshipLabel(relationship.type),
      lagHours: relationship.lagHours ?? undefined,
      successorCode: successor.code,
      successorName: successor.name,
      successorProject: successor.project,
      scope: relationship.external ? "External" : "Internal",
      line: relationship.source.line,
      raw: relationship.source.raw,
    };
  });
}

const activityHelper = createColumnHelper<typeof features, ActivityDataRow>();
const activityColumns = activityHelper.columns([
  activityHelper.accessor("activityCode", {
    header: "Activity",
    sortFn: sortFn_alphanumeric,
    cell: ({ row }) => (
      <div className="min-w-40 max-w-72">
        <p className="font-medium">{row.original.activityCode}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.original.activityName}</p>
      </div>
    ),
  }),
  activityHelper.accessor("project", { header: "Project", sortFn: sortFn_text }),
  activityHelper.accessor("type", { header: "Type", sortFn: sortFn_text }),
  activityHelper.accessor("status", { header: "Status", sortFn: sortFn_text }),
  activityHelper.accessor("floatHours", {
    header: "Float (h)",
    sortFn: sortFn_basic,
    sortUndefined: "last",
    sortDescFirst: false,
    cell: ({ getValue }) => {
      const value = getValue();
      return value === undefined ? "—" : floatNumber.format(value);
    },
  }),
  activityHelper.accessor("earlyStart", {
    header: "Early start",
    sortFn: sortFn_text,
  }),
  activityHelper.accessor("earlyFinish", {
    header: "Early finish",
    sortFn: sortFn_text,
  }),
  activityHelper.accessor("flagSummary", {
    header: "Findings",
    sortFn: sortFn_text,
    cell: ({ row }) => (
      <div className="flex min-w-36 flex-wrap gap-1.5">
        {row.original.flags.length > 0 ? (
          row.original.flags.map((flag) => (
            <span key={flag} className="rounded-md border px-2 py-1 text-xs">
              {flag}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    ),
  }),
  activityHelper.accessor("line", {
    header: "Source",
    sortFn: sortFn_basic,
    cell: ({ row, getValue }) => (
      <details className="min-w-24">
        <summary className="cursor-pointer whitespace-nowrap text-xs underline-offset-4 hover:underline">
          Line {getValue()}
        </summary>
        <pre className="mt-2 max-h-40 max-w-72 overflow-auto rounded-md bg-muted p-3 text-xs">
          {row.original.raw}
        </pre>
      </details>
    ),
  }),
]);

const relationshipHelper = createColumnHelper<typeof features, RelationshipDataRow>();
const relationshipColumns = relationshipHelper.columns([
  relationshipHelper.accessor("predecessorCode", {
    header: "Predecessor",
    sortFn: sortFn_alphanumeric,
    cell: ({ row }) => (
      <EndpointCell
        code={row.original.predecessorCode}
        name={row.original.predecessorName}
        project={row.original.predecessorProject}
      />
    ),
  }),
  relationshipHelper.accessor("relationshipType", {
    header: "Relationship",
    sortFn: sortFn_text,
    cell: ({ row }) => (
      <div className="min-w-32">
        <p>{row.original.relationshipType}</p>
        {row.original.typeCode && (
          <p className="mt-1 text-xs text-muted-foreground">{row.original.typeCode}</p>
        )}
      </div>
    ),
  }),
  relationshipHelper.accessor("lagHours", {
    header: "Lag (h)",
    sortFn: sortFn_basic,
    sortUndefined: "last",
    sortDescFirst: false,
    cell: ({ getValue }) => {
      const value = getValue();
      return value === undefined ? "—" : floatNumber.format(value);
    },
  }),
  relationshipHelper.accessor("successorCode", {
    header: "Successor",
    sortFn: sortFn_alphanumeric,
    cell: ({ row }) => (
      <EndpointCell
        code={row.original.successorCode}
        name={row.original.successorName}
        project={row.original.successorProject}
      />
    ),
  }),
  relationshipHelper.accessor("scope", { header: "Scope", sortFn: sortFn_text }),
  relationshipHelper.accessor("line", {
    header: "Source",
    sortFn: sortFn_basic,
    cell: ({ row, getValue }) => (
      <details className="min-w-24">
        <summary className="cursor-pointer whitespace-nowrap text-xs underline-offset-4 hover:underline">
          Line {getValue()}
        </summary>
        <pre className="mt-2 max-h-40 max-w-72 overflow-auto rounded-md bg-muted p-3 text-xs">
          {row.original.raw}
        </pre>
      </details>
    ),
  }),
]);

function EndpointCell({ code, name, project }: { code: string; name: string; project: string }) {
  return (
    <div className="min-w-40 max-w-72">
      <p className="font-medium">{code}</p>
      {name && <p className="mt-1 text-xs leading-5 text-muted-foreground">{name}</p>}
      <p className="mt-1 text-xs text-muted-foreground">{project}</p>
    </div>
  );
}

function TableView<TData extends RowData & { id: string }>({
  title,
  description,
  table,
  pagination,
  pageSize,
  onPageSizeChange,
  search,
  onSearchChange,
  rowType,
  emptyMessage,
}: {
  title: string;
  description: string;
  table: ReactTable<typeof features, TData>;
  pagination: PaginationState;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  search: string;
  onSearchChange: (value: string) => void;
  rowType: string;
  emptyMessage: string;
}) {
  const searchId = useId();
  const rows = table.getRowModel().rows;
  const totalRows = table.getPrePaginatedRowModel().rows.length;
  const first = totalRows === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const last = Math.min(totalRows, first + rows.length - 1);
  const pageCount = Math.max(1, table.getPageCount());

  return (
    <section aria-labelledby={searchId + "-heading"} className="min-w-0 rounded-2xl border bg-card">
      <div className="space-y-4 border-b p-5 sm:p-6">
        <div>
          <h3 id={searchId + "-heading"} className="font-semibold tracking-tight">
            {title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {number.format(totalRows)} {rowType}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <div className="max-w-xl">
          <label htmlFor={searchId} className="mb-1.5 block text-xs font-medium">
            Search {rowType}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              placeholder="Search codes, names, and values…"
              className={controlClass + " w-full pl-9"}
              value={search}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
            />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{title}, including searchable schedule records.</caption>
          <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const direction = header.column.getIsSorted();
                  const Icon =
                    direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        direction === "asc"
                          ? "ascending"
                          : direction === "desc"
                            ? "descending"
                            : "none"
                      }
                      className="px-4 py-3 font-medium"
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex min-h-8 items-center gap-2 whitespace-nowrap rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <table.FlexRender header={header} />
                        <Icon className="size-3.5" aria-hidden="true" />
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-muted/20">
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-4">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={table.getAllLeafColumns().length}
                  className="px-5 py-12 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t px-5 py-4">
        <p role="status" className="text-xs text-muted-foreground">
          Showing {number.format(first)}–{number.format(Math.max(first, last))} of{" "}
          {number.format(totalRows)} {rowType}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Rows per page
            <select
              className={controlClass + " h-8"}
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.currentTarget.value))}
            >
              {[25, 50, 100, 250].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-muted-foreground">
            Page {number.format(pagination.pageIndex + 1)} of {number.format(pageCount)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={"Previous " + rowType + " page"}
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={"Next " + rowType + " page"}
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function filterActivityRows(rows: ActivityDataRow[], query: string): ActivityDataRow[] {
  if (!query) return rows;
  return rows.filter((row) =>
    [
      row.activityCode,
      row.activityName,
      row.project,
      row.type,
      row.status,
      String(row.floatHours ?? ""),
      row.earlyStart,
      row.earlyFinish,
      row.flagSummary,
      String(row.line),
    ]
      .join(" ")
      .toLocaleLowerCase("en-US")
      .includes(query),
  );
}

function filterRelationshipRows(rows: RelationshipDataRow[], query: string): RelationshipDataRow[] {
  if (!query) return rows;
  return rows.filter((row) =>
    [
      row.predecessorCode,
      row.predecessorName,
      row.predecessorProject,
      row.typeCode,
      row.relationshipType,
      String(row.lagHours ?? ""),
      row.successorCode,
      row.successorName,
      row.successorProject,
      row.scope,
      String(row.line),
    ]
      .join(" ")
      .toLocaleLowerCase("en-US")
      .includes(query),
  );
}

export function ActivitiesTable({
  activities,
  projects,
  report,
}: {
  activities: XerActivity[];
  projects: XerProject[];
  report: ScheduleCheckReport;
}) {
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "activityCode", desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const rows = useMemo(
    () => createActivityRows(activities, projects, report),
    [activities, projects, report],
  );
  const filtered = useMemo(
    () => filterActivityRows(rows, search.trim().toLocaleLowerCase("en-US")),
    [rows, search],
  );

  function updateSorting(update: Updater<SortingState>) {
    setSorting(update);
    setPagination((previous) => ({ ...previous, pageIndex: 0 }));
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPagination((previous) => ({ ...previous, pageIndex: 0 }));
  }

  function updatePageSize(size: number) {
    setPagination({ pageIndex: 0, pageSize: size });
  }

  const table = useTable({
    features,
    columns: activityColumns,
    data: filtered,
    getRowId: (row) => row.id,
    state: { sorting, pagination },
    onSortingChange: updateSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    enableMultiSort: false,
    enableSortingRemoval: false,
  });

  return (
    <TableView
      title="Activities"
      description="All usable activity rows. The Findings column lists check results recorded for each activity; a dash means no finding is listed."
      table={table}
      pagination={pagination}
      pageSize={pagination.pageSize}
      onPageSizeChange={updatePageSize}
      search={search}
      onSearchChange={updateSearch}
      rowType="activities"
      emptyMessage="No activities match this search."
    />
  );
}

export function RelationshipsTable({
  relationships,
  activities,
  projects,
}: {
  relationships: XerRelationship[];
  activities: XerActivity[];
  projects: XerProject[];
}) {
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "predecessorCode", desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const rows = useMemo(
    () => createRelationshipRows(relationships, activities, projects),
    [relationships, activities, projects],
  );
  const filtered = useMemo(
    () => filterRelationshipRows(rows, search.trim().toLocaleLowerCase("en-US")),
    [rows, search],
  );

  function updateSorting(update: Updater<SortingState>) {
    setSorting(update);
    setPagination((previous) => ({ ...previous, pageIndex: 0 }));
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPagination((previous) => ({ ...previous, pageIndex: 0 }));
  }

  function updatePageSize(size: number) {
    setPagination({ pageIndex: 0, pageSize: size });
  }

  const table = useTable({
    features,
    columns: relationshipColumns,
    data: filtered,
    getRowId: (row) => row.id,
    state: { sorting, pagination },
    onSortingChange: updateSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    enableMultiSort: false,
    enableSortingRemoval: false,
  });

  return (
    <TableView
      title="Relationships"
      description="Imported predecessor-to-successor links. External marks a relationship with an endpoint outside this export."
      table={table}
      pagination={pagination}
      pageSize={pagination.pageSize}
      onPageSizeChange={updatePageSize}
      search={search}
      onSearchChange={updateSearch}
      rowType="relationships"
      emptyMessage="No relationships match this search."
    />
  );
}
