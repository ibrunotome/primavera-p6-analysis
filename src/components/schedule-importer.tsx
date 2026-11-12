import { useRef } from "react";
import { ArrowUpRight, FileText, FolderOpen, LoaderCircle, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scheduleExamples } from "@/lib/schedule-import";
import type { ScheduleInput } from "@/lib/schedule-import";

interface ScheduleImporterProps {
  loadingFilename: string | null;
  selectedFilename: string | null;
  onImport: (input: ScheduleInput) => void;
  onCancel: () => void;
}

export function ScheduleImporter({
  loadingFilename,
  selectedFilename,
  onImport,
  onCancel,
}: ScheduleImporterProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = loadingFilename !== null;

  return (
    <section aria-labelledby="import-heading" className="rounded-2xl border bg-card">
      <div className="border-b px-6 py-5">
        <h2 id="import-heading" className="text-lg font-semibold tracking-tight">
          Import a schedule
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a local XER file or explore one of the examples.
        </p>
      </div>
      <div className="grid gap-6 p-6 md:grid-cols-2">
        <div className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-8 text-center">
          <div className="mb-4 rounded-xl border bg-background p-3">
            <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="font-medium">Open your P6 export</h3>
          <p className="mt-1 max-w-64 text-sm leading-6 text-muted-foreground">
            Files are read in your browser and stay on your device.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xer"
            aria-label="Choose a Primavera P6 XER file"
            className="sr-only"
            tabIndex={-1}
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onImport({ kind: "local", file });
            }}
          />
          <Button
            type="button"
            className="mt-5"
            size="lg"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <FolderOpen aria-hidden="true" />
            Choose .xer file
          </Button>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-medium">Try an example</h3>
          <div className="flex flex-col gap-2">
            {scheduleExamples.map((example) => (
              <button
                key={example.filename}
                type="button"
                disabled={busy}
                aria-pressed={selectedFilename === example.filename}
                onClick={() => onImport({ kind: "example", example })}
                className="group flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-50 aria-pressed:border-foreground/40 aria-pressed:bg-muted/40"
              >
                <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{example.name}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {example.description}
                  </span>
                </span>
                <ArrowUpRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
      {busy && (
        <div className="flex items-center justify-between gap-4 border-t px-6 py-4">
          <p
            role="status"
            className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
          >
            <LoaderCircle
              className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="truncate">Reading and checking {loadingFilename}…</span>
          </p>
          <Button type="button" variant="ghost" onClick={onCancel}>
            <X aria-hidden="true" />
            Cancel
          </Button>
        </div>
      )}
    </section>
  );
}
