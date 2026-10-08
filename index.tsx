/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { MouseButton, type MouseEvent } from "@opentui/core"
import { createEffect, createSignal } from "solid-js"
import { compactLabel, details, visibleWindows, type DisplayMode } from "./display"
import { createMonitor, type UsageState } from "./monitor"

const tui: TuiPlugin = async (api) => {
  const [state, setState] = createSignal<UsageState>({ loading: true })
  const [mode, setMode] = createSignal<DisplayMode>("5h-reset")
  const [now, setNow] = createSignal(Date.now())
  const preferenceKey = "codex-usage.display-mode"
  let preferenceLoaded = false
  createEffect(() => {
    if (preferenceLoaded || !api.kv.ready) return
    preferenceLoaded = true
    const saved = api.kv.get(preferenceKey)
    if (saved === "5h" || saved === "5h-reset" || saved === "all") setMode(saved)
  })
  let detailsOpen = false
  const monitor = createMonitor({ signal: api.lifecycle.signal, onChange: (next) => {
    setNow(Date.now())
    setState(next)
  } })

  function openDetails() {
    const Alert = api.ui.DialogAlert
    api.ui.dialog.replace(() => <Alert title="Utilizzo Codex" message={details(state())} />, () => {
      detailsOpen = false
    })
    detailsOpen = true
  }

  function openViewMenu() {
    const Select = api.ui.DialogSelect
    api.ui.dialog.replace(() => (
      <Select<DisplayMode>
        title="Visualizzazione Codex"
        current={mode()}
        skipFilter
        options={[
          { title: "Solo quota 5h", value: "5h", description: "5h: 87% rim." },
          { title: "Quota 5h + tempo al reset", value: "5h-reset", description: "5h: 87% (4h 30m)" },
          { title: "Tutte le finestre", value: "all", description: "5h: 87% · 7g: 41% rim." },
        ]}
        onSelect={(option) => {
          preferenceLoaded = true
          setMode(option.value)
          api.kv.set(preferenceKey, option.value)
          api.ui.dialog.clear()
        }}
      />
    ))
  }

  function handleMouseUp(event: MouseEvent) {
    if (event.button !== MouseButton.LEFT && event.button !== MouseButton.RIGHT) return
    event.preventDefault()
    event.stopPropagation()
    if (event.button === MouseButton.RIGHT) {
      openViewMenu()
    } else if (detailsOpen && api.ui.dialog.open) {
      api.ui.dialog.clear()
      detailsOpen = false
    } else {
      openDetails()
    }
  }

  function Indicator() {
    const dimensions = useTerminalDimensions()
    const color = () => {
      const current = state()
      const theme = api.theme.current
      if (current.error) return theme.warning
      if (!current.snapshot) return theme.textMuted
      const windows = visibleWindows(current, mode() !== "all")
      if (!windows.length) return theme.textMuted
      const remaining = Math.min(...windows.map((w) => w.remaining))
      return remaining <= 10 ? theme.error : remaining <= 25 ? theme.warning : theme.success
    }
    return (
      <box flexShrink={1} minWidth={0} onMouseUp={handleMouseUp}>
        <text selectable={false} fg={color()} wrapMode="none">{compactLabel(state(), dimensions().width, mode(), now())}</text>
      </box>
    )
  }

  api.slots.register({
    slots: {
      home_prompt_right: () => <Indicator />,
      session_prompt_right: () => <Indicator />,
    },
  })
  api.keymap.registerLayer({
    commands: [
      {
        name: "codex-usage.view",
        title: "Codex: scegli visualizzazione",
        category: "Codex",
        namespace: "palette",
        slashName: "codex-usage-view",
        run: openViewMenu,
      },
      {
        name: "codex-usage.details",
        title: "Codex: quota e reset",
        category: "Codex",
        namespace: "palette",
        slashName: "codex-usage",
        run: openDetails,
      },
      {
        name: "codex-usage.refresh",
        title: "Codex: aggiorna quota",
        category: "Codex",
        namespace: "palette",
        slashName: "codex-usage-refresh",
        async run() {
          await monitor.refresh()
          if (!api.lifecycle.signal.aborted) openDetails()
        },
      },
    ],
  })
  const timer = setInterval(() => {
    setNow(Date.now())
    void monitor.refresh()
  }, 60000)
  api.lifecycle.onDispose(() => clearInterval(timer))
  // The monitor deduplicates requests; wait at least 15s between idle-triggered updates.
  let lastIdleRefresh = Date.now()
  api.event.on("session.idle", () => {
    if (Date.now() - lastIdleRefresh < 15000) return
    lastIdleRefresh = Date.now()
    void monitor.refresh()
  })
  void monitor.refresh()
}

export default { id: "local:codex-usage", tui } satisfies TuiPluginModule
