import { ArrowUpRight, FileText, FolderOpen, LoaderCircle, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'

import type { ScheduleInput } from '@/lib/schedule-import'
import type { XerEncoding } from '@/lib/xer'

import { Button } from '@/components/ui/button'
import { scheduleExamples } from '@/lib/schedule-import'

interface ScheduleImporterProps {
  loadingFilename: string | null
  selectedFilename: string | null
  onImport: (input: ScheduleInput) => void
  onCancel: () => void
}

export function ScheduleImporter({ loadingFilename, selectedFilename, onImport, onCancel }: ScheduleImporterProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [encoding, setEncoding] = useState<XerEncoding | 'auto'>('auto')
  const busy = loadingFilename !== null

  function importLocalFile(file: File) {
    if (encoding === 'auto') onImport({ kind: 'local', file })
    else onImport({ kind: 'local', file, encoding })
  }

  return (
    <section aria-labelledby="import-heading" className="rounded-2xl border bg-card">
      <div className="border-b px-6 py-5">
        <h2 id="import-heading" className="text-lg font-semibold tracking-tight">
          Import a schedule
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose a local XER file or explore one of the examples.</p>
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
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) importLocalFile(file)
            }}
          />
          <Button type="button" className="mt-5" size="lg" disabled={busy} onClick={() => inputRef.current?.click()}>
            <FolderOpen aria-hidden="true" />
            Choose .xer file
          </Button>
          <details className="mt-4 max-w-64 text-left">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Text encoding (optional)
            </summary>
            <div className="mt-3">
              <label htmlFor="xer-encoding" className="mb-1.5 block text-xs font-medium">
                File encoding
              </label>
              <select
                id="xer-encoding"
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                value={encoding}
                disabled={busy}
                onChange={(event) => setEncoding(event.currentTarget.value as XerEncoding | 'auto')}
              >
                <option value="auto">Automatic (UTF-8 / Windows-1252)</option>
                <option value="windows-1252">Western (Windows-1252)</option>
                <option value="windows-1256">Arabic (Windows-1256)</option>
                <option value="utf-8">UTF-8</option>
              </select>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                If activity names look incorrect, choose the code page used when the XER was exported.
              </p>
            </div>
          </details>
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
                onClick={() => onImport({ kind: 'example', example })}
                className="group flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-50 aria-pressed:border-foreground/40 aria-pressed:bg-muted/40"
              >
                <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{example.name}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{example.description}</span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </div>
      {busy && (
        <div className="flex items-center justify-between gap-4 border-t px-6 py-4">
          <p role="status" className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span className="truncate">Reading and checking {loadingFilename}…</span>
          </p>
          <Button type="button" variant="ghost" onClick={onCancel}>
            <X aria-hidden="true" />
            Cancel
          </Button>
        </div>
      )}
    </section>
  )
}
