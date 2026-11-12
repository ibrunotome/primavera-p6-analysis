import { parseXerBuffer, runScheduleChecks } from "./xer";
import type { ScheduleCheckReport, XerEncoding, XerParseResult } from "./xer";

export const scheduleExamples = [
  {
    filename: "airport.xer",
    name: "Airport",
    description: "Public original · 66 activities · 71 KB",
    modified: false,
    encoding: "windows-1252",
  },
  {
    filename: "rehab-2.xer",
    name: "Rehab",
    description: "Public original · 6,977 activities · 18.6 MB",
    modified: false,
    encoding: "windows-1256",
  },
  {
    filename: "airport-errors.xer",
    name: "Airport with errors",
    description: "Modified demo · deliberate import issues",
    modified: true,
    encoding: "windows-1252",
  },
] as const;

export type ScheduleExample = (typeof scheduleExamples)[number];
export type ScheduleInput =
  | { kind: "local"; file: File; encoding?: XerEncoding }
  | { kind: "example"; example: ScheduleExample };

export interface ImportedSchedule {
  filename: string;
  byteLength: number;
  origin: "local" | "example";
  modifiedExample: boolean;
  schedule: XerParseResult;
  checks: ScheduleCheckReport | null;
}

export function inputFilename(input: ScheduleInput): string {
  return input.kind === "local" ? input.file.name : input.example.filename;
}

/** Local files are read in memory. Only bundled examples make a network request. */
export async function importSchedule(
  input: ScheduleInput,
  signal?: AbortSignal,
): Promise<ImportedSchedule> {
  signal?.throwIfAborted();
  const filename = inputFilename(input);
  if (!/\.xer$/i.test(filename)) {
    throw new Error("Choose a Primavera P6 export with the .xer extension.");
  }

  let buffer: ArrayBuffer;
  if (input.kind === "local") {
    buffer = await input.file.arrayBuffer();
  } else {
    const url = import.meta.env.BASE_URL + "samples/" + input.example.filename;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(
        "The example could not be loaded (HTTP " +
          response.status +
          "). Try again or choose a local file.",
      );
    }
    buffer = await response.arrayBuffer();
  }
  signal?.throwIfAborted();
  if (buffer.byteLength === 0) {
    throw new Error("This file is empty. Choose a Primavera P6 .xer export.");
  }
  const encoding = input.kind === "local" ? input.encoding : input.example.encoding;
  const schedule = parseXerBuffer(buffer, encoding);
  return {
    filename,
    byteLength: buffer.byteLength,
    origin: input.kind,
    modifiedExample: input.kind === "example" && input.example.modified,
    schedule,
    checks: schedule.status === "invalid" ? null : runScheduleChecks(schedule),
  };
}
