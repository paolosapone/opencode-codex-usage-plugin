/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { MouseButton, type MouseEvent } from "@opentui/core"
import { Show, createSignal } from "solid-js"
import { compactLabel, details, visibleWindows, type DisplayMode } from "./display"
import type { UsageState } from "./monitor"
import { CodexUsage, type UsageResponse } from "./rpc"
import { UsageError } from "./usage"

export default Plugin.define({
  id: "codex-usage",
  setup(api) {
    const controller = new AbortController()
    const [state, setState] = createSignal<UsageState>({ loading: true })
    const [preferences, updatePreferences] = api.storage.store<{ mode: DisplayMode }>("display", {
      initial: { mode: "5h-reset" },
    })
    const mode = (): DisplayMode => preferences.mode === "5h" || preferences.mode === "all" ? preferences.mode : "5h-reset"
    const [now, setNow] = createSignal(Date.now())
    let detailsGeneration = 0
    let detailsOpen = false
    const rpc = api.client.rpc(CodexUsage)
    let pending: Promise<void> | undefined

    function refresh(): Promise<void> {
      if (controller.signal.aborted) return Promise.resolve()
      if (pending) return pending
      setNow(Date.now())
      setState((previous) => ({ ...previous, loading: true }))
      pending = (async () => {
        try {
          const result = await rpc.refresh({}, {
            location: api.location ?? api.data.location.default(),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          }) as UsageResponse
          if (controller.signal.aborted) return
          setState({
            snapshot: result.snapshot,
            error: result.error ? new UsageError(result.error.code, result.error.message) : undefined,
            loading: false,
          })
        } catch {
          if (controller.signal.aborted) return
          // A disconnected server may have changed accounts: do not retain its quota.
          setState({
            loading: false,
            error: new UsageError("network", "Quota Codex non disponibile. Verifica che il plugin server sia attivo."),
          })
        }
      })().finally(() => { pending = undefined })
      return pending
    }

    async function openDetails() {
      const generation = ++detailsGeneration
      detailsOpen = true
      try {
        await api.ui.dialog.alert({ title: "Utilizzo Codex", message: details(state()) })
      } finally {
        if (generation === detailsGeneration) detailsOpen = false
      }
    }

    async function openViewMenu() {
      detailsGeneration++
      detailsOpen = false
      const selected = await api.ui.dialog.select<DisplayMode>({
        title: "Visualizzazione Codex",
        current: mode(),
        options: [
          { title: "Solo quota 5h", value: "5h", description: "5h: 87% rim." },
          { title: "Quota 5h + tempo al reset", value: "5h-reset", description: "5h: 87% (4h 30m)" },
          { title: "Tutte le finestre", value: "all", description: "5h: 87% · 7g: 41% rim." },
        ],
      })
      if (selected === undefined || controller.signal.aborted) return
      try {
        await updatePreferences((draft) => { draft.mode = selected })
      } catch {
        if (!controller.signal.aborted) {
          api.ui.toast.show({ message: "Impossibile salvare la visualizzazione Codex.", variant: "error" })
        }
      }
    }

    function handleMouseUp(event: MouseEvent) {
      if (event.button !== MouseButton.LEFT && event.button !== MouseButton.RIGHT) return
      event.preventDefault()
      event.stopPropagation()
      if (event.button === MouseButton.RIGHT) {
        void openViewMenu()
      } else if (detailsOpen) {
        api.ui.dialog.clear()
        detailsOpen = false
      } else {
        void openDetails()
      }
    }

    function Indicator() {
      const dimensions = useTerminalDimensions()
      const color = () => {
        const current = state()
        const theme = api.theme
        if (current.error) return theme.text.feedback.warning.base
        if (!current.snapshot) return theme.text.muted
        const windows = visibleWindows(current, mode() !== "all")
        if (!windows.length) return theme.text.muted
        const remaining = Math.min(...windows.map((w) => w.remaining))
        const feedback = remaining <= 10 ? "error" : remaining <= 25 ? "warning" : "success"
        return theme.text.feedback[feedback].base
      }
      return (
        <box flexShrink={1} minWidth={0} onMouseUp={handleMouseUp}>
          <text selectable={false} fg={color()} wrapMode="none">
            {compactLabel(state(), dimensions().width, mode(), now())}
          </text>
        </box>
      )
    }

    const removeHome = api.ui.slot({ append: "home.footer.status", render: () => <Indicator /> })
    const removePrompt = api.ui.slot({
      append: "prompt.footer.status",
      render: (input) => <Show when={input.sessionID}><Indicator /></Show>,
    })
    api.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "codex-usage.view",
          title: "Codex: scegli visualizzazione",
          group: "Codex",
          palette: true,
          slash: { name: "codex-usage-view" },
          run: openViewMenu,
        },
        {
          id: "codex-usage.details",
          title: "Codex: quota e reset",
          group: "Codex",
          palette: true,
          slash: { name: "codex-usage" },
          run: openDetails,
        },
        {
          id: "codex-usage.refresh",
          title: "Codex: aggiorna quota",
          group: "Codex",
          palette: true,
          slash: { name: "codex-usage-refresh" },
          async run() {
            await refresh()
            if (!controller.signal.aborted) await openDetails()
          },
        },
      ],
    }))
    const timer = setInterval(() => {
      setNow(Date.now())
      void refresh()
    }, 60000)
    // Concurrent requests share a refresh; execution events are throttled to 15s.
    let lastExecutionRefresh = Date.now()
    const onExecutionFinished = () => {
      if (Date.now() - lastExecutionRefresh < 15000) return
      lastExecutionRefresh = Date.now()
      void refresh()
    }
    const stops = [
      api.data.on("session.execution.succeeded", onExecutionFinished),
      api.data.on("session.execution.failed", onExecutionFinished),
      api.data.on("session.execution.interrupted", onExecutionFinished),
    ]
    void refresh()
    return () => {
      controller.abort()
      clearInterval(timer)
      stops.forEach((stop) => stop())
      removeHome()
      removePrompt()
    }
  },
})
