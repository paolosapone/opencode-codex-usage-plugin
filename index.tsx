/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { MouseButton, type MouseEvent } from "@opentui/core"
import { createSignal } from "solid-js"
import { compactLabel, details, visibleWindows } from "./display"
import { createMonitor, type UsageState } from "./monitor"

const tui: TuiPlugin = async (api) => {
  const [state, setState] = createSignal<UsageState>({ loading: true })
  const [fiveHoursOnly, setFiveHoursOnly] = createSignal(true)
  let detailsOpen = false
  const monitor = createMonitor({ signal: api.lifecycle.signal, onChange: setState })

  function openDetails() {
    const Alert = api.ui.DialogAlert
    api.ui.dialog.replace(() => <Alert title="Utilizzo Codex" message={details(state())} />, () => {
      detailsOpen = false
    })
    detailsOpen = true
  }

  function handleMouseUp(event: MouseEvent) {
    if (event.button !== MouseButton.LEFT && event.button !== MouseButton.RIGHT) return
    event.preventDefault()
    event.stopPropagation()
    if (event.button === MouseButton.RIGHT) {
      setFiveHoursOnly((value) => !value)
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
      const windows = visibleWindows(current, fiveHoursOnly())
      if (!windows.length) return theme.textMuted
      const remaining = Math.min(...windows.map((w) => w.remaining))
      return remaining <= 10 ? theme.error : remaining <= 25 ? theme.warning : theme.success
    }
    return (
      <box flexShrink={1} minWidth={0} onMouseUp={handleMouseUp}>
        <text selectable={false} fg={color()} wrapMode="none">{compactLabel(state(), dimensions().width, fiveHoursOnly())}</text>
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
  const timer = setInterval(() => { void monitor.refresh() }, 60000)
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
