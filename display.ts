import type { UsageState } from "./monitor"

export type DisplayMode = "5h" | "5h-reset" | "all"

export function resetCountdown(resetAt: number | undefined, now = Date.now()): string {
  if (resetAt === undefined || !Number.isFinite(resetAt)) return "reset n/d"
  if (resetAt <= now) return "reset in attesa"
  const minutes = Math.ceil((resetAt - now) / 60000)
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

export function visibleWindows(state: UsageState, fiveHoursOnly = false) {
  const windows = state.snapshot?.windows ?? []
  return fiveHoursOnly ? windows.filter((window) => window.label === "5h") : windows
}

export function compactLabel(state: UsageState, width: number, mode: DisplayMode = "all", now = Date.now()): string {
  const data = state.snapshot
  if (!data) {
    if (state.error?.code === "auth" || state.error?.code === "expired") return "Codex · login"
    if (state.error) return "Codex · offline"
    return "Codex · …"
  }
  const suffix = state.error ? " *" : state.loading ? " …" : ""
  const windows = visibleWindows(state, mode !== "all")
  if (!windows.length) return `Codex · 5h: n/d${suffix}`
  if (mode === "5h-reset") {
    const window = windows[0]
    const quota = `${Math.floor(window.remaining)}% (${resetCountdown(window.resetAt, now)})`
    return `${width < 90 ? "" : "Codex · 5h: "}${quota}${suffix}`
  }
  if (width < 90) {
    return `Codex ${Math.floor(Math.min(...windows.map((w) => w.remaining)))}% rim.${suffix}`
  }
  return `Codex · ${windows.map((w) => `${w.label}: ${Math.floor(w.remaining)}%`).join(" · ")} rim.${suffix}`
}

export function details(state: UsageState): string {
  const lines = ["Percentuali di quota rimanente dell'account Codex (tutti i client)."]
  if (state.snapshot) {
    if (state.snapshot.plan) lines.push(`Piano: ${state.snapshot.plan}`)
    for (const window of state.snapshot.windows) {
      lines.push(`\n${window.label}: ${window.remaining.toLocaleString("it-IT", { maximumFractionDigits: 1 })}% rimanente`)
      lines.push(`Reset: ${window.resetAt ? new Date(window.resetAt).toLocaleString("it-IT") : "non disponibile"}`)
    }
    lines.push(`\nUltimo aggiornamento: ${new Date(state.snapshot.fetchedAt).toLocaleString("it-IT")}`)
  }
  if (state.loading) lines.push("\nAggiornamento in corso…")
  if (state.error) lines.push(`\n${state.snapshot ? "Dati precedenti, non aggiornati. " : ""}${state.error.message}`)
  lines.push("\nAggiornamento automatico ogni 60s. /codex-usage-refresh per aggiornare ora.")
  return lines.join("\n")
}
