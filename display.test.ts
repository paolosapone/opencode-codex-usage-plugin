import { expect, test } from "bun:test"
import { compactLabel, resetCountdown } from "./display"
import type { UsageState } from "./monitor"
import { UsageError } from "./usage"

test("conto alla rovescia con ore, minuti, reset assente e scaduto", () => {
  const now = 1000000
  expect(resetCountdown(now + 16200000, now)).toBe("4h 30m")
  expect(resetCountdown(now + 2520000, now)).toBe("42m")
  expect(resetCountdown(now + 1, now)).toBe("1m")
  expect(resetCountdown(now + 3600000, now)).toBe("1h 0m")
  expect(resetCountdown(undefined, now)).toBe("reset n/d")
  expect(resetCountdown(now, now)).toBe("reset in attesa")
  expect(resetCountdown(now - 1, now)).toBe("reset in attesa")
})

test("vista con reset conserva quota e countdown durante errori e su terminali stretti", () => {
  const now = 1000000
  const state: UsageState = {
    loading: false,
    snapshot: { fetchedAt: now, windows: [{ label: "5h", remaining: 87.9, resetAt: now + 16200000 }] },
  }
  expect(compactLabel(state, 120, "5h-reset", now)).toBe("Codex · 5h: 87% (4h 30m)")
  expect(compactLabel(state, 80, "5h-reset", now + 60000)).toBe("87% (4h 29m)")
  state.error = new UsageError("network", "offline")
  expect(compactLabel(state, 80, "5h-reset", now + 16200000)).toBe("87% (reset in attesa) *")
  state.snapshot!.windows[0].resetAt = undefined
  expect(compactLabel(state, 80, "5h-reset", now)).toBe("87% (reset n/d) *")
  state.snapshot!.windows = [{ label: "7g", remaining: 41 }]
  expect(compactLabel(state, 120, "5h-reset", now)).toBe("Codex · 5h: n/d *")
})
