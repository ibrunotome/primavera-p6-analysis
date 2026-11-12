export type XerEncoding = "utf-8" | "windows-1252";

export type XerIssueCode =
  | "invalid-header"
  | "invalid-table"
  | "invalid-fields"
  | "missing-column"
  | "row-without-table"
  | "row-without-fields"
  | "column-count"
  | "missing-value"
  | "invalid-number"
  | "duplicate-id"
  | "missing-reference"
  | "external-reference"
  | "unexpected-line"
  | "data-after-end"
  | "missing-end-marker"
  | "missing-table"
  | "no-projects"
  | "no-activities";

export interface XerIssue {
  code: XerIssueCode;
  severity: "warning" | "error";
  message: string;
  line: number | null;
  table: string | null;
  field?: string;
  raw: string | null;
}

export interface XerSource {
  line: number;
  raw: string;
  fields: Record<string, string>;
}

export interface XerProject {
  id: string;
  code: string;
  source: XerSource;
}

export interface XerActivity {
  id: string;
  projectId: string;
  code: string;
  name: string;
  type: string | null;
  status: string | null;
  totalFloatHours: number | null;
  source: XerSource;
}

export interface XerRelationship {
  id: string;
  successorId: string;
  successorProjectId: string;
  predecessorId: string;
  predecessorProjectId: string;
  type: string | null;
  lagHours: number | null;
  /** At least one endpoint belongs to a project outside this export. */
  external: boolean;
  source: XerSource;
}

export interface XerTableSummary {
  name: string;
  line: number;
  columns: string[];
  rowCount: number;
  rejectedRowCount: number;
}

export interface XerParseResult {
  status: "success" | "partial" | "invalid";
  /** Null when parsing text that has already been decoded. */
  encoding: XerEncoding | null;
  header: { version: string; exportedAt: string } | null;
  projects: XerProject[];
  activities: XerActivity[];
  relationships: XerRelationship[];
  tables: XerTableSummary[];
  issues: XerIssue[];
}
