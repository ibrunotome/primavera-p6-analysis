import { CircleX, FileText } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { ImportedSchedule, ScheduleInput } from '@/lib/schedule-import'

import { ImportResults } from '@/components/import-results'
import { ScheduleImporter } from '@/components/schedule-importer'
import { Button } from '@/components/ui/button'
import { importSchedule, inputFilename } from '@/lib/schedule-import'

type ImportState =
  | { phase: 'idle' }
  | { phase: 'loading'; filename: string }
  | { phase: 'loaded'; result: ImportedSchedule }
  | { phase: 'failed'; input: ScheduleInput; message: string }

function App() {
  const [state, setState] = useState<ImportState>({ phase: 'idle' })
  const requestId = useRef(0)
  const controller = useRef<AbortController | null>(null)

  useEffect(function cancelImportOnUnmount() {
    function cancelPendingImport() {
      requestId.current++
      controller.current?.abort()
    }

    return cancelPendingImport
  }, [])

  function reset() {
    requestId.current++
    controller.current?.abort()
    setState({ phase: 'idle' })
  }

  async function handleImport(input: ScheduleInput) {
    controller.current?.abort()
    const currentController = new AbortController()
    controller.current = currentController
    const currentRequest = ++requestId.current
    setState({ phase: 'loading', filename: inputFilename(input) })
    try {
      const result = await importSchedule(input, currentController.signal)
      if (currentRequest === requestId.current) setState({ phase: 'loaded', result })
    } catch (error) {
      if (currentRequest !== requestId.current || currentController.signal.aborted) return
      setState({
        phase: 'failed',
        input,
        message:
          error instanceof Error ? error.message : 'The file could not be read. Try again or choose another export.',
      })
    }
  }

  return (
    <div className="min-h-svh bg-muted/25">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary p-2 text-primary-foreground">
              <FileText className="size-5" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold tracking-tight">P6 Schedule Checker</span>
          </div>
          <span className="text-xs text-muted-foreground">Runs in your browser</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-7 px-5 py-10 sm:px-8 sm:py-12">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Primavera P6</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A quick check of your schedule.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Read an XER export, review broken rows, and check for missing links, negative float, and high float.
          </p>
        </div>
        <ScheduleImporter
          loadingFilename={state.phase === 'loading' ? state.filename : null}
          selectedFilename={
            state.phase === 'loaded' && state.result.origin === 'example' ? state.result.filename : null
          }
          onImport={(input) => {
            void handleImport(input)
          }}
          onCancel={reset}
        />
        {state.phase === 'failed' && (
          <section role="alert" className="rounded-xl border border-destructive/30 bg-card p-5">
            <h2 className="flex items-center gap-2 font-medium">
              <CircleX className="size-4 text-destructive" aria-hidden="true" />
              Could not open {inputFilename(state.input)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{state.message}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => {
                void handleImport(state.input)
              }}
            >
              Try again
            </Button>
          </section>
        )}
        {state.phase === 'loaded' && (
          <>
            <ImportResults key={state.result.filename} result={state.result} />
            <div className="flex justify-end">
              <Button type="button" variant="ghost" onClick={reset}>
                Clear results
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default App
