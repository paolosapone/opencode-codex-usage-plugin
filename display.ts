import type { UsageState } from "./monitor"

export function visibleWindows(state: UsageState, fiveHoursOnly = false) {
  const windows = state.snapshot?.windows ?? []
  return fiveHoursOnly ? windows.filter((window) => window.label === "5h") : windows
}

export function compactLabel(state: UsageState, width: number, fiveHoursOnly = false): string {
  const data = state.snapshot
  if (!data) {
    if (state.error?.code === "auth" || state.error?.code === "expired") return "Codex · login"
    if (state.error) return "Codex · offline"
    return "Codex · …"
  }
  const suffix = state.error ? " *" : state.loading ? " …" : ""
  const windows = visibleWindows(state, fiveHoursOnly)
  if (!windows.length) return `Codex · 5h: n/d${suffix}`
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
