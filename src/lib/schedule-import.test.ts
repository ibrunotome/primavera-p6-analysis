/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { importSchedule, scheduleExamples } from "./schedule-import";

function sample(filename: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(readFileSync(new URL("../../public/samples/" + filename, import.meta.url)));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("schedule imports", () => {
  it("reads a local fixture and runs the checks without a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([sample("airport-errors.xer")], "local-schedule.xer");
    const result = await importSchedule({ kind: "local", file });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      filename: "local-schedule.xer",
      byteLength: file.size,
      origin: "local",
      modifiedExample: false,
      schedule: { status: "partial" },
    });
    expect(result.schedule.issues).toHaveLength(3);
    expect(result.checks?.findings).toHaveLength(12);
  });

  it("loads the selected public example and passes its cancellation signal to fetch", async () => {
    const bytes = sample("airport.xer");
    const fetchMock = vi.fn().mockResolvedValue(new Response(bytes));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const result = await importSchedule(
      { kind: "example", example: scheduleExamples[0] },
      controller.signal,
    );

    expect(fetchMock).toHaveBeenCalledWith(import.meta.env.BASE_URL + "samples/airport.xer", {
      signal: controller.signal,
    });
    expect(result).toMatchObject({
      filename: "airport.xer",
      byteLength: bytes.length,
      origin: "example",
      modifiedExample: false,
      schedule: { status: "success" },
    });
    expect(result.checks?.checks["high-float"].findings).toHaveLength(10);
  });

  it("uses the Rehab sample's Arabic Windows-1256 encoding", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(sample("rehab-2.xer"))));
    const result = await importSchedule({ kind: "example", example: scheduleExamples[1] });

    expect(result.schedule.encoding).toBe("windows-1256");
    expect(result.schedule.activities.find((activity) => activity.code === "V3101200")?.name).toBe(
      "عزل أرضيات الحمامات",
    );
  });

  it("labels the modified example separately from the public originals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(sample("airport-errors.xer"))));
    const result = await importSchedule({ kind: "example", example: scheduleExamples[2] });
    expect(result.modifiedExample).toBe(true);
    expect(result.schedule.projects[0].code).toBe("TERMINAL-2-DEMO-ERRORS");
  });

  it("accepts uppercase file extensions", async () => {
    const result = await importSchedule({
      kind: "local",
      file: new File([sample("airport.xer")], "SCHEDULE.XER"),
    });
    expect(result.schedule.status).toBe("success");
  });

  it("rejects other file types before reading their contents", async () => {
    const file = new File(["not an export"], "schedule.csv");
    const read = vi.spyOn(file, "arrayBuffer");
    await expect(importSchedule({ kind: "local", file })).rejects.toThrow(".xer extension");
    expect(read).not.toHaveBeenCalled();
  });

  it("explains an empty file", async () => {
    await expect(
      importSchedule({
        kind: "local",
        file: new File([], "empty.xer"),
      }),
    ).rejects.toThrow("This file is empty");
  });

  it("returns invalid-file diagnostics without generating schedule results", async () => {
    const result = await importSchedule({
      kind: "local",
      file: new File(["This is not a P6 export"], "invalid.xer"),
    });
    expect(result.schedule.status).toBe("invalid");
    expect(result.schedule.issues[0].code).toBe("invalid-header");
    expect(result.checks).toBeNull();
  });

  it("handles an HTML fallback instead of treating it as a valid example", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Fallback page</html>")));
    const result = await importSchedule({ kind: "example", example: scheduleExamples[0] });
    expect(result.schedule.status).toBe("invalid");
    expect(result.checks).toBeNull();
  });

  it("reports a missing sample response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(
      importSchedule({
        kind: "example",
        example: scheduleExamples[0],
      }),
    ).rejects.toThrow("HTTP 404");
  });

  it("propagates a file read failure to the UI error handler", async () => {
    const file = new File(["content"], "schedule.xer");
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("The file could not be read"));
    await expect(importSchedule({ kind: "local", file })).rejects.toThrow("could not be read");
  });

  it("does not read an already cancelled import", async () => {
    const controller = new AbortController();
    controller.abort();
    const file = new File(["content"], "schedule.xer");
    const read = vi.spyOn(file, "arrayBuffer");
    await expect(importSchedule({ kind: "local", file }, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(read).not.toHaveBeenCalled();
  });

  it("does not parse a response that was cancelled during download", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        controller.abort();
        return new Response(sample("airport.xer"));
      }),
    );
    await expect(
      importSchedule({ kind: "example", example: scheduleExamples[0] }, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
