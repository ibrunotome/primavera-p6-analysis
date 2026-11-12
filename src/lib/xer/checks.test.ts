/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { parseXer, parseXerBuffer, runScheduleChecks } from "./index";
import type { ScheduleCheckReport } from "./types";

interface ActivityFixture {
  id: string;
  project?: string;
  type?: string;
  status?: string;
  float?: string;
  actualStart?: string;
  actualFinish?: string;
}

const defaultActivities: ActivityFixture[] = [
  { id: "1", type: "TT_Mile" },
  { id: "2" },
  { id: "3", type: "TT_FinMile" },
];
const relationshipHeader = [
  "task_pred_id",
  "task_id",
  "pred_task_id",
  "proj_id",
  "pred_proj_id",
  "pred_type",
  "lag_hr_cnt",
];

function fixture(
  options: {
    activities?: ActivityFixture[];
    links?: [string, string][];
    extraRelationshipRows?: string[][];
    includeRelationships?: boolean;
  } = {},
): string {
  const activities = options.activities ?? defaultActivities;
  const projects = [...new Set(activities.map((activity) => activity.project ?? "100"))];
  return [
    "ERMHDR\t23.12\t2026-01-01",
    "%T\tPROJECT",
    "%F\tproj_id\tproj_short_name",
    ...projects.map((id) => "%R\t" + id + "\tPROJECT-" + id),
    "%T\tTASK",
    "%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttotal_float_hr_cnt\tact_start_date\tact_end_date",
    ...activities.map((activity) =>
      [
        "%R",
        activity.id,
        activity.project ?? "100",
        "A" + activity.id,
        "Activity " + activity.id,
        activity.type ?? "TT_Task",
        activity.status ?? "TK_NotStart",
        activity.float ?? "0",
        activity.actualStart ?? "",
        activity.actualFinish ?? "",
      ].join("\t"),
    ),
    ...(options.includeRelationships === false
      ? []
      : [
          "%T\tTASKPRED",
          "%F\t" + relationshipHeader.join("\t"),
          ...(
            options.links ?? [
              ["1", "2"],
              ["2", "3"],
            ]
          ).map(([predecessor, successor], index) =>
            [
              "%R",
              String(index + 1),
              successor,
              predecessor,
              activities.find((activity) => activity.id === successor)?.project ?? "100",
              activities.find((activity) => activity.id === predecessor)?.project ?? "100",
              "PR_FS",
              "0",
            ].join("\t"),
          ),
          ...(options.extraRelationshipRows ?? []).map((row) => "%R\t" + row.join("\t")),
        ]),
    "%E",
  ].join("\n");
}

function counts(report: ScheduleCheckReport): number[] {
  return Object.values(report.checks).map((check) => check.findings.length);
}

function expectCoverage(report: ScheduleCheckReport, activityCount: number) {
  for (const check of Object.values(report.checks)) {
    expect(check.assessedCount + check.excludedCount + check.unavailableCount).toBe(activityCount);
  }
}

describe("missing links", () => {
  it("passes a linked schedule with start and finish milestone exemptions", () => {
    const schedule = parseXer(fixture());
    const report = runScheduleChecks(schedule);
    expect(counts(report)).toEqual([0, 0, 0]);
    expect(report.checks["missing-links"]).toMatchObject({
      status: "complete",
      assessedCount: 3,
      excludedCount: 0,
      unavailableCount: 0,
    });
    expectCoverage(report, 3);
  });

  it("reports each activity once, including activities missing both directions", () => {
    const schedule = parseXer(fixture({ links: [] }));
    const report = runScheduleChecks(schedule);
    expect(report.checks["missing-links"].findings).toMatchObject([
      { activity: { id: "1" }, missing: ["successor"], certainty: "confirmed" },
      { activity: { id: "2" }, missing: ["predecessor", "successor"], certainty: "confirmed" },
      { activity: { id: "3" }, missing: ["predecessor"], certainty: "confirmed" },
    ]);
    expect(new Set(report.findings.map((finding) => finding.id)).size).toBe(3);
    expectCoverage(report, 3);
  });

  it.each([
    { id: "2", status: "TK_Active" },
    { id: "2", actualStart: "2026-01-02 08:00" },
  ])("exempts started activities from the predecessor requirement: %j", (started) => {
    const schedule = parseXer(
      fixture({
        activities: [started, defaultActivities[2]],
        links: [["2", "3"]],
      }),
    );
    expect(runScheduleChecks(schedule).checks["missing-links"].findings).toEqual([]);
    const isolated = parseXer(fixture({ activities: [started], links: [] }));
    expect(runScheduleChecks(isolated).checks["missing-links"].findings).toMatchObject([
      { missing: ["successor"] },
    ]);
  });

  it("retains links to completed and summary activities when assessing other activities", () => {
    const schedule = parseXer(
      fixture({
        activities: [
          { id: "1", status: "TK_Complete", float: "-8" },
          { id: "2" },
          { id: "3", type: "TT_WBS", float: "400" },
        ],
      }),
    );
    const report = runScheduleChecks(schedule);
    expect(counts(report)).toEqual([0, 0, 0]);
    expect(report.checks["missing-links"]).toMatchObject({ assessedCount: 1, excludedCount: 2 });
  });

  it("counts cross-project and external relationships for their local endpoints", () => {
    const schedule = parseXer(
      fixture({
        activities: [
          { id: "1", type: "TT_Mile" },
          { id: "2", project: "200", type: "TT_FinMile" },
        ],
        links: [["1", "2"]],
      }),
    );
    expect(runScheduleChecks(schedule).checks["missing-links"].findings).toEqual([]);

    const external = parseXer(
      fixture({
        activities: [{ id: "1" }],
        links: [],
        extraRelationshipRows: [
          ["10", "1", "900", "100", "999", "PR_FS", "0"],
          ["11", "901", "1", "999", "100", "PR_FS", "0"],
        ],
      }),
    );
    expect(external.status).toBe("partial");
    expect(runScheduleChecks(external).checks["missing-links"]).toMatchObject({
      status: "complete",
      findings: [],
    });
  });

  it("does not treat a self relationship as a real predecessor or successor", () => {
    const schedule = parseXer(fixture({ activities: [{ id: "1" }], links: [["1", "1"]] }));
    const check = runScheduleChecks(schedule).checks["missing-links"];
    expect(check.status).toBe("partial");
    expect(check.findings).toMatchObject([
      { missing: ["predecessor", "successor"], certainty: "uncertain" },
    ]);
    expect(check.notes.some((note) => note.includes("Self relationships"))).toBe(true);
  });
});

describe("float checks", () => {
  it("uses strict hour boundaries and keeps missing float unassessed", () => {
    const values = ["-0.01", "-0", "0", "352", "352.01", "", "not-a-number"];
    const schedule = parseXer(
      fixture({
        activities: values.map((float, index) => ({ id: String(index + 1), float })),
        links: [],
      }),
    );
    const report = runScheduleChecks(schedule);
    expect(report.checks["negative-float"].findings).toMatchObject([
      { activity: { id: "1" }, totalFloatHours: -0.01, thresholdHours: 0, certainty: "confirmed" },
    ]);
    expect(report.checks["high-float"].findings).toMatchObject([
      { activity: { id: "5" }, totalFloatHours: 352.01, thresholdHours: 352 },
    ]);
    for (const id of ["negative-float", "high-float"] as const) {
      expect(report.checks[id]).toMatchObject({
        status: "partial",
        assessedCount: 5,
        unavailableCount: 2,
      });
    }
    // An invalid float does not make the relationship data incomplete.
    expect(report.checks["missing-links"].status).toBe("complete");
    expectCoverage(report, 7);
  });

  it("allows changing the high-float threshold, including zero", () => {
    const schedule = parseXer(
      fixture({
        activities: [
          { id: "1", float: "24" },
          { id: "2", float: "24.5" },
        ],
        links: [],
      }),
    );
    expect(runScheduleChecks(schedule).checks["high-float"].findings).toEqual([]);
    const custom = runScheduleChecks(schedule, { highFloatThresholdHours: 24 });
    expect(custom.highFloatThresholdHours).toBe(24);
    expect(custom.checks["high-float"].findings).toMatchObject([
      { activity: { id: "2" }, thresholdHours: 24 },
    ]);
    expect(
      runScheduleChecks(schedule, { highFloatThresholdHours: 0 }).checks["high-float"].findings,
    ).toHaveLength(2);
  });

  it.each([-1, NaN, Infinity, -Infinity])(
    "rejects invalid high-float threshold %s",
    (threshold) => {
      expect(() =>
        runScheduleChecks(parseXer(fixture()), { highFloatThresholdHours: threshold }),
      ).toThrow(RangeError);
    },
  );

  it("excludes completed, actual-finished, WBS summary, and level-of-effort activities", () => {
    const schedule = parseXer(
      fixture({
        activities: [
          { id: "1", status: "TK_Complete", float: "-8" },
          { id: "2", actualFinish: "2026-01-02 16:00", float: "400" },
          { id: "3", type: "TT_WBS", float: "-8" },
          { id: "4", type: "TT_LOE", float: "400" },
          { id: "5", type: "TT_Rsrc", float: "-16" },
        ],
        links: [],
      }),
    );
    const report = runScheduleChecks(schedule);
    expect(report.checks["negative-float"]).toMatchObject({ excludedCount: 4, assessedCount: 1 });
    expect(report.checks["negative-float"].findings).toMatchObject([{ activity: { id: "5" } }]);
    expect(report.checks["high-float"].findings).toEqual([]);
    // Level of effort remains in scope for missing logic, following Oracle's definition.
    expect(report.checks["missing-links"].findings).toHaveLength(2);
    expectCoverage(report, 5);
  });

  it("does not report a clean float check when all float values are unavailable", () => {
    const schedule = parseXer(
      fixture({
        activities: [{ id: "1", float: "" }],
        links: [],
      }),
    );
    const report = runScheduleChecks(schedule);
    for (const id of ["negative-float", "high-float"] as const) {
      expect(report.checks[id]).toMatchObject({
        status: "unavailable",
        assessedCount: 0,
        unavailableCount: 1,
        findings: [],
      });
    }
  });
});

describe("coverage and import reliability", () => {
  it("does not equate an absent relationship table with zero relationships", () => {
    const report = runScheduleChecks(parseXer(fixture({ includeRelationships: false })));
    expect(report.checks["missing-links"]).toMatchObject({
      status: "unavailable",
      assessedCount: 0,
      unavailableCount: 3,
      findings: [],
    });
    expect(report.checks["high-float"].status).toBe("complete");
    expectCoverage(report, 3);
  });

  it("does not run missing-link checks with an unusable relationship schema", () => {
    const content = fixture({ links: [] }).replace(
      "%F\t" + relationshipHeader.join("\t"),
      "%F\ttask_id\tpred_task_id",
    );
    expect(runScheduleChecks(parseXer(content)).checks["missing-links"]).toMatchObject({
      status: "unavailable",
      findings: [],
    });
  });

  it("labels missing links as uncertain after rejecting a malformed relationship row", () => {
    const schedule = parseXer(
      fixture({
        links: [],
        extraRelationshipRows: [["99", "2"]],
      }),
    );
    const report = runScheduleChecks(schedule);
    expect(report.checks["missing-links"].status).toBe("partial");
    expect(report.checks["missing-links"].findings).toHaveLength(3);
    expect(
      report.checks["missing-links"].findings.every((finding) => finding.certainty === "uncertain"),
    ).toBe(true);
    expect(report.checks["negative-float"].status).toBe("complete");
  });

  it("keeps the relationship check partial even if the remaining links cover all activities", () => {
    const report = runScheduleChecks(
      parseXer(
        fixture({
          extraRelationshipRows: [["99", "2"]],
        }),
      ),
    );
    expect(report.checks["missing-links"]).toMatchObject({ status: "partial", findings: [] });
  });

  it("does not confuse invalid relationship lag with missing connections", () => {
    const schedule = parseXer(fixture().replace("PR_FS\t0", "PR_FS\tinvalid"));
    expect(schedule.status).toBe("partial");
    const report = runScheduleChecks(schedule);
    expect(report.checks["missing-links"]).toMatchObject({ status: "complete", findings: [] });
    expect(report.checks["high-float"].status).toBe("complete");
  });

  it("marks rejected activity populations as partial while preserving usable float evidence", () => {
    const content = fixture({
      activities: [{ id: "1", float: "-8" }],
      links: [],
    }).replace("%T\tTASKPRED", "%R\tbroken row\n%T\tTASKPRED");
    const report = runScheduleChecks(parseXer(content));
    expect(report.checks["negative-float"]).toMatchObject({ status: "partial", assessedCount: 1 });
    expect(report.checks["negative-float"].findings[0].certainty).toBe("confirmed");
    expectCoverage(report, 1);
  });

  it("leaves unknown activity types or statuses unassessed", () => {
    const report = runScheduleChecks(
      parseXer(
        fixture({
          activities: [
            { id: "1", type: "", float: "-8" },
            { id: "2", status: "UNKNOWN", float: "400" },
            { id: "3", type: "TT_FinMile" },
          ],
          links: [],
        }),
      ),
    );
    for (const check of Object.values(report.checks)) {
      expect(check).toMatchObject({ status: "partial", assessedCount: 1, unavailableCount: 2 });
    }
    expect(report.checks["negative-float"].findings).toEqual([]);
    expect(report.checks["high-float"].findings).toEqual([]);
    expectCoverage(report, 3);
  });

  it("keeps counts explicit when all activities are excluded", () => {
    const report = runScheduleChecks(
      parseXer(
        fixture({
          activities: [{ id: "1", status: "TK_Complete", float: "-8" }],
          links: [],
        }),
      ),
    );
    for (const check of Object.values(report.checks)) {
      expect(check).toMatchObject({
        status: "complete",
        assessedCount: 0,
        excludedCount: 1,
        unavailableCount: 0,
        findings: [],
      });
    }
  });

  it("marks truncated data as partial and missing links as uncertain", () => {
    const schedule = parseXer(fixture({ links: [] }).replace(/\n%E$/, ""));
    const report = runScheduleChecks(schedule);
    expect(Object.values(report.checks).every((check) => check.status === "partial")).toBe(true);
    expect(
      report.checks["missing-links"].findings.every((finding) => finding.certainty === "uncertain"),
    ).toBe(true);
  });

  it("does not let a broken unrelated table reduce check coverage", () => {
    const content = fixture().replace("%E", "%T\tCUSTOM\n%F\tid\n%R\t1\textra\n%E");
    const schedule = parseXer(content);
    expect(schedule.status).toBe("partial");
    expect(
      Object.values(runScheduleChecks(schedule).checks).every(
        (check) => check.status === "complete",
      ),
    ).toBe(true);
  });

  it("does not run checks on invalid imports", () => {
    const report = runScheduleChecks(parseXer("not an XER"));
    expect(report.findings).toEqual([]);
    expect(Object.values(report.checks).every((check) => check.status === "unavailable")).toBe(
      true,
    );
  });

  it("includes the original activity and line in findings without mutating the import", () => {
    const schedule = parseXer(
      fixture({
        activities: [{ id: "1", float: "-8" }],
        links: [],
      }),
    );
    const original = structuredClone(schedule);
    const report = runScheduleChecks(schedule);
    expect(report.findings).toHaveLength(2);
    expect(report.findings[0].activity).toBe(schedule.activities[0]);
    expect(report.findings[0].line).toBe(schedule.activities[0].source.line);
    expect(report.findings.every((finding) => finding.message.length > 0)).toBe(true);
    expect(schedule).toEqual(original);
  });
});

describe("public schedule baselines", () => {
  it.each([
    { filename: "airport.xer", assessed: 66, excluded: 0, missing: 0, high: 10 },
    { filename: "rehab-2.xer", assessed: 4940, excluded: 2037, missing: 10, high: 3718 },
  ])(
    "checks $filename against independently inspected results",
    ({ filename, assessed, excluded, missing, high }) => {
      const bytes = new Uint8Array(
        readFileSync(new URL("../../../public/samples/" + filename, import.meta.url)),
      );
      const schedule = parseXerBuffer(bytes.buffer);
      const report = runScheduleChecks(schedule);
      expect(counts(report)).toEqual([missing, 0, high]);
      expect(report.findings).toHaveLength(missing + high);
      for (const check of Object.values(report.checks)) {
        expect(check).toMatchObject({
          status: "complete",
          assessedCount: assessed,
          excludedCount: excluded,
          unavailableCount: 0,
        });
      }
      expectCoverage(report, assessed + excluded);
    },
  );
});
