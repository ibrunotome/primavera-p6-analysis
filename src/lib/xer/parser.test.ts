/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { parseXer, parseXerBuffer, readXerFile } from "./index";

const taskColumns = [
  "task_id",
  "proj_id",
  "task_code",
  "task_name",
  "task_type",
  "status_code",
  "total_float_hr_cnt",
];
const tasks = [
  ["1", "100", "A1000", "Start", "TT_Mile", "TK_NotStart", "0"],
  ["2", "100", "A1010", "Pour concrete", "TT_Task", "TK_NotStart", "-8"],
  ["3", "100", "A1020", "Finish", "TT_FinMile", "TK_NotStart", "400"],
];
const relationshipColumns = [
  "task_pred_id",
  "task_id",
  "pred_task_id",
  "proj_id",
  "pred_proj_id",
  "pred_type",
  "lag_hr_cnt",
];
const relationships = [
  ["10", "2", "1", "100", "100", "PR_FS", "0"],
  ["11", "3", "2", "100", "100", "PR_FS", "8"],
];

function section(name: string, columns: string[], rows: string[][]): string {
  return [
    "%T\t" + name,
    "%F\t" + columns.join("\t"),
    ...rows.map((row) => "%R\t" + row.join("\t")),
  ].join("\n");
}

function fixture(
  options: {
    taskRows?: string[][];
    columns?: string[];
    relationshipRows?: string[][];
    includeRelationships?: boolean;
    extraSection?: string;
  } = {},
): string {
  return [
    "ERMHDR\t23.12\t2026-01-01\tProject",
    section("PROJECT", ["proj_id", "proj_short_name"], [["100", "DEMO"]]),
    section("TASK", options.columns ?? taskColumns, options.taskRows ?? tasks),
    ...(options.includeRelationships === false
      ? []
      : [section("TASKPRED", relationshipColumns, options.relationshipRows ?? relationships)]),
    ...(options.extraSection ? [options.extraSection] : []),
    "%E",
  ].join("\n");
}

describe("parseXer", () => {
  it("normalizes projects, activities and relationships with source locations", () => {
    const result = parseXer(fixture());

    expect(result.status).toBe("success");
    expect(result.issues).toEqual([]);
    expect(result.header).toEqual({ version: "23.12", exportedAt: "2026-01-01" });
    expect(result.projects[0]).toMatchObject({ id: "100", code: "DEMO" });
    expect(result.activities[1]).toMatchObject({
      id: "2",
      code: "A1010",
      totalFloatHours: -8,
      source: { line: 8, fields: { task_name: "Pour concrete" } },
    });
    expect(result.activities[1].source.raw).toBe("%R\t" + tasks[1].join("\t"));
    expect(result.relationships[0]).toMatchObject({
      predecessorId: "1",
      successorId: "2",
      external: false,
      lagHours: 0,
    });
    expect(result.relationships[1].lagHours).toBe(8);
  });

  it("maps reordered headers and preserves names, unknown fields and trailing empty cells", () => {
    const columns = ["note", ...taskColumns.toReversed()];
    const rows = tasks.map((task) => ["", ...task.toReversed()]);
    rows[1][1] = "";
    rows[1][4] = "  Pour concrete  ";
    const result = parseXer(fixture({ columns, taskRows: rows }));

    expect(result.status).toBe("success");
    expect(result.activities[0].totalFloatHours).toBe(0);
    expect(result.activities[1]).toMatchObject({
      name: "  Pour concrete  ",
      totalFloatHours: null,
      source: { fields: { note: "" } },
    });

    const trailingEmpty = tasks.map((task) => [...task.slice(0, -1), ""]);
    expect(parseXer(fixture({ taskRows: trailingEmpty })).activities[2].totalFloatHours).toBeNull();
  });

  it.each(["\n", "\r\n", "\r"])("supports line endings %j and an optional BOM", (newline) => {
    const result = parseXer("\uFEFF" + fixture().replaceAll("\n", newline));
    expect(result.status).toBe("success");
    expect(result.activities[1].source.line).toBe(8);
  });

  it("counts unrelated tables without retaining their data", () => {
    const result = parseXer(
      fixture({
        extraSection: section("CUSTOM", ["id", "description"], [["1", "A custom record"]]),
      }),
    );
    expect(result.status).toBe("success");
    expect(result.tables.at(-1)).toMatchObject({
      name: "CUSTOM",
      rowCount: 1,
      rejectedRowCount: 0,
    });
  });

  it("quarantines short and long rows, including in unrelated tables, and continues", () => {
    const result = parseXer(
      fixture({
        taskRows: [...tasks, ["4", "100"], [...tasks[1], "extra"]],
        extraSection: section("CUSTOM", ["id"], [["1", "extra"]]),
      }),
    );
    expect(result.status).toBe("partial");
    expect(result.activities).toHaveLength(3);
    expect(result.issues.filter((issue) => issue.code === "column-count")).toHaveLength(3);
    expect(result.issues[0]).toMatchObject({ table: "TASK", line: 10, raw: "%R\t4\t100" });
    expect(result.tables.find((table) => table.name === "TASK")).toMatchObject({
      rowCount: 5,
      rejectedRowCount: 2,
    });
  });

  it.each(["NaN", "Infinity", "-Infinity", "0x10", "8 hours", "12abc", "1e999"])(
    "flags invalid float %s without losing the activity",
    (value) => {
      const rows = tasks.map((task) => [...task]);
      rows[1][6] = value;
      const result = parseXer(fixture({ taskRows: rows }));
      expect(result.activities).toHaveLength(3);
      expect(result.activities[1].totalFloatHours).toBeNull();
      expect(result.issues).toEqual([
        expect.objectContaining({ code: "invalid-number", field: "total_float_hr_cnt", line: 8 }),
      ]);
    },
  );

  it("validates numeric relationship lag independently", () => {
    const rows = relationships.map((relationship) => [...relationship]);
    rows[0][6] = "invalid";
    const result = parseXer(fixture({ relationshipRows: rows }));
    expect(result.relationships[0].lagHours).toBeNull();
    expect(result.issues[0]).toMatchObject({
      code: "invalid-number",
      table: "TASKPRED",
      field: "lag_hr_cnt",
    });
  });

  it("rejects blank required values and duplicate IDs, retaining the first record", () => {
    const duplicate = [...tasks[1]];
    duplicate[3] = "Duplicate name";
    const result = parseXer(
      fixture({
        taskRows: [
          ...tasks,
          ["", "100", "A1040", "No ID", "TT_Task", "TK_NotStart", "0"],
          duplicate,
        ],
      }),
    );
    expect(result.activities).toHaveLength(3);
    expect(result.activities[1].name).toBe("Pour concrete");
    expect(result.issues.map((issue) => issue.code)).toEqual(["missing-value", "duplicate-id"]);
    expect(result.tables.find((table) => table.name === "TASK")?.rejectedRowCount).toBe(2);
  });

  it("rejects invalid internal project and activity references", () => {
    const result = parseXer(
      fixture({
        taskRows: [...tasks, ["4", "404", "A1040", "Orphan", "TT_Task", "TK_NotStart", "0"]],
        relationshipRows: [...relationships, ["12", "3", "404", "100", "100", "PR_FS", "0"]],
      }),
    );
    expect(result.activities).toHaveLength(3);
    expect(result.relationships).toHaveLength(2);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "missing-reference",
      "missing-reference",
    ]);
  });

  it("retains external relationships and distinguishes them from broken internal references", () => {
    const result = parseXer(
      fixture({
        relationshipRows: [...relationships, ["12", "1", "900", "100", "999", "PR_FS", "0"]],
      }),
    );
    expect(result.relationships.at(-1)).toMatchObject({
      external: true,
      predecessorProjectId: "999",
    });
    expect(result.issues[0]).toMatchObject({ code: "external-reference", severity: "warning" });
  });

  it("resolves cross-project relationships after all tables have been read", () => {
    const content = [
      "ERMHDR\t23.12\t2026-01-01",
      section("TASKPRED", relationshipColumns, [["10", "2", "1", "200", "100", "PR_FS", "0"]]),
      section("TASK", taskColumns, [
        tasks[0],
        ["2", "200", "B1", "Other project", "TT_Task", "TK_NotStart", "0"],
      ]),
      section(
        "PROJECT",
        ["proj_id", "proj_short_name"],
        [
          ["100", "ONE"],
          ["200", "TWO"],
        ],
      ),
      "%E",
    ].join("\n");
    const result = parseXer(content);
    expect(result.status).toBe("success");
    expect(result.projects).toHaveLength(2);
    expect(result.relationships[0].external).toBe(false);
  });

  it("does not reuse headers after a new table or an invalid column header", () => {
    const result = parseXer(
      fixture({
        extraSection: [
          "%T\tCUSTOM",
          "%R\t1",
          "%F\tid\tid",
          "%R\t1\t2",
          "%F\tid\t",
          "%R\t1\t2",
        ].join("\n"),
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "row-without-fields",
      "invalid-fields",
      "row-without-fields",
      "invalid-fields",
      "row-without-fields",
    ]);
  });

  it("rejects records outside a table and clears context after malformed table markers", () => {
    const content = fixture().replace(
      "%T\tTASK",
      "%R\torphan\n%T\tBROKEN\textra\n%R\talso orphan\n%T\tTASK",
    );
    const result = parseXer(content);
    expect(result.status).toBe("partial");
    expect(result.activities).toHaveLength(3);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "column-count",
      "invalid-table",
      "row-without-table",
    ]);
  });

  it("marks missing check columns as unavailable instead of assuming zero float", () => {
    const result = parseXer(
      fixture({
        columns: taskColumns.slice(0, -1),
        taskRows: tasks.map((task) => task.slice(0, -1)),
      }),
    );
    expect(result.status).toBe("partial");
    expect(result.activities.every((activity) => activity.totalFloatHours === null)).toBe(true);
    expect(result.issues[0]).toMatchObject({ code: "missing-column", field: "total_float_hr_cnt" });
  });

  it("rejects activity schemas missing identifying columns", () => {
    const result = parseXer(
      fixture({
        columns: taskColumns.slice(1),
        taskRows: tasks.map((task) => task.slice(1)),
      }),
    );
    expect(result.status).toBe("invalid");
    expect(result.activities).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "missing-column", field: "task_id" }),
    );
  });

  it("distinguishes an absent relationship table from a present, empty one", () => {
    const absent = parseXer(fixture({ includeRelationships: false }));
    const empty = parseXer(fixture({ relationshipRows: [] }));
    expect(absent.status).toBe("partial");
    expect(absent.issues).toContainEqual(
      expect.objectContaining({ code: "missing-table", table: "TASKPRED" }),
    );
    expect(empty.status).toBe("success");
    expect(empty.relationships).toEqual([]);
  });

  it("recovers truncated exports and flags content after the end marker", () => {
    const truncated = parseXer(fixture().replace(/\n%E$/, ""));
    expect(truncated.status).toBe("partial");
    expect(truncated.activities).toHaveLength(3);
    expect(truncated.issues.at(-1)?.code).toBe("missing-end-marker");

    const trailing = parseXer(fixture() + "\n%R\tunexpected");
    expect(trailing.activities).toHaveLength(3);
    expect(trailing.issues[0].code).toBe("data-after-end");
  });

  it.each(["", "   \n", "<html>Not an XER</html>", "ERMHDR\t\t2026-01-01"])(
    "rejects unrecognizable input %j",
    (text) => {
      const result = parseXer(text);
      expect(result.status).toBe("invalid");
      expect(result.issues[0].code).toBe("invalid-header");
    },
  );

  it("requires usable project and activity records", () => {
    const result = parseXer("ERMHDR\t23.12\t2026-01-01\n%E");
    expect(result.status).toBe("invalid");
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "missing-table",
      "missing-table",
      "missing-table",
      "no-projects",
      "no-activities",
    ]);
  });
});

describe("browser file reading and decoding", () => {
  it("reads a native File and decodes UTF-8 without losing Unicode", async () => {
    const file = new File(
      [fixture().replace("Pour concrete", "Concretagem — São Paulo 🏗")],
      "demo.xer",
    );
    const result = await readXerFile(file);
    expect(result.encoding).toBe("utf-8");
    expect(result.activities[1].name).toBe("Concretagem — São Paulo 🏗");
  });

  it("falls back to Windows-1252 for legacy exports", () => {
    const utf8 = new TextEncoder().encode(fixture());
    const bytes = new Uint8Array(utf8);
    const offset = fixture().indexOf("Pour concrete");
    bytes[offset] = 0xe9;
    const result = parseXerBuffer(bytes.buffer);
    expect(result.encoding).toBe("windows-1252");
    expect(result.activities[1].name).toBe("éour concrete");
  });

  it("allows explicitly selecting an encoding for ambiguous byte sequences", () => {
    const bytes = new TextEncoder().encode(fixture().replace("Pour concrete", "é"));
    expect(parseXerBuffer(bytes.buffer).activities[1].name).toBe("é");
    expect(parseXerBuffer(bytes.buffer, "windows-1252").activities[1].name).toBe("Ã©");
  });

  it("decodes Arabic XER text with Windows-1256", () => {
    const path = new URL("../../../public/samples/rehab-2.xer", import.meta.url);
    const bytes = new Uint8Array(readFileSync(path));
    const result = parseXerBuffer(bytes.buffer, "windows-1256");

    expect(result.encoding).toBe("windows-1256");
    expect(result.activities.find((activity) => activity.code === "V3101200")?.name).toBe(
      "عزل أرضيات الحمامات",
    );
  });
});

describe("unmodified public samples", () => {
  it.each([
    {
      filename: "airport.xer",
      encoding: "windows-1252" as const,
      activities: 66,
      relationships: 84,
      blankFloat: 0,
    },
    {
      filename: "rehab-2.xer",
      encoding: "windows-1256" as const,
      activities: 6977,
      relationships: 10730,
      blankFloat: 1,
    },
  ])(
    "imports $filename with its expected record counts",
    ({ filename, encoding, activities, relationships, blankFloat }) => {
      const path = new URL("../../../public/samples/" + filename, import.meta.url);
      const bytes = new Uint8Array(readFileSync(path));
      const result = parseXerBuffer(bytes.buffer, encoding);
      expect(result.status).toBe("success");
      expect(result.encoding).toBe(encoding);
      expect(result.issues).toEqual([]);
      expect(result.projects).toHaveLength(1);
      expect(result.activities).toHaveLength(activities);
      expect(result.relationships).toHaveLength(relationships);
      expect(
        result.activities.filter((activity) => activity.totalFloatHours === null),
      ).toHaveLength(blankFloat);
      expect(result.tables.every((table) => table.rejectedRowCount === 0)).toBe(true);
    },
  );
});
