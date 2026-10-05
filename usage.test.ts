import { describe, expect, test } from "bun:test"
import { authPath, fetchUsage, parseCredentials, parseUsage, UsageError } from "./usage"
import { compactLabel, details } from "./display"
import { createMonitor, type UsageState } from "./monitor"
import { join } from "node:path"

const payload = {
  plan_type: "plus",
  rate_limit: {
    primary_window: { used_percent: 28, limit_window_seconds: 18000, reset_at: 2000000000 },
    secondary_window: { used_percent: 59, limit_window_seconds: 604800, reset_after_seconds: 3600 },
  },
}

describe("quota e credenziali", () => {
  test("quota rimanente, durata delle finestre e reset assoluto/relativo", () => {
    expect(parseUsage(payload, 1000)).toEqual({
      plan: "plus", fetchedAt: 1000,
      windows: [
        { label: "5h", remaining: 72, resetAt: 2000000000000 },
        { label: "7g", remaining: 41, resetAt: 3601000 },
      ],
    })
  })
  test("finestre mancanti e valori errati non diventano falsi 100%", () => {
    for (const body of [{}, { rate_limit: {} }, { rate_limit: { primary_window: { used_percent: "0" } } },
      { rate_limit: { primary_window: { used_percent: 101 } } }]) {
      expect(() => parseUsage(body)).toThrow(UsageError)
    }
    expect(parseUsage({ rate_limit: { secondary_window: { used_percent: 100 } } }).windows)
      .toEqual([{ label: "lunga", remaining: 0, resetAt: undefined }])
  })
  test("login API respinto, scadenza in millisecondi e account dal JWT", () => {
    expect(() => parseCredentials({ openai: { type: "api", key: "secret" } })).toThrow(UsageError)
    expect(() => parseCredentials({ openai: { type: "oauth", access: "secret", expires: 1000 } }, 1000)).toThrow(UsageError)
    const access = `e30.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "account" } })).toString("base64url")}.sig`
    expect(parseCredentials({ openai: { type: "oauth", access, expires: 2000 } }, 1000)).toEqual({ access, accountId: "account" })
  })
  test("percorso XDG assoluto e fallback Windows", () => {
    expect(authPath({}, "C:\\Users\\test")).toBe(join("C:\\Users\\test", ".local", "share", "opencode", "auth.json"))
    expect(authPath({ XDG_DATA_HOME: "relative" }, "C:\\Users\\test")).toBe(authPath({}, "C:\\Users\\test"))
    expect(authPath({ XDG_DATA_HOME: "C:\\data" })).toBe(join("C:\\data", "opencode", "auth.json"))
  })
  test("indicatore stretto mostra il limite più basso e segnala dati vecchi", () => {
    const state = { loading: false, snapshot: parseUsage(payload), error: new UsageError("network", "Timeout") }
    expect(compactLabel(state, 80)).toBe("Codex 41% rim. *")
    expect(compactLabel(state, 120)).toBe("Codex · 5h: 72% · 7g: 41% rim. *")
    expect(details(state)).toContain("Dati precedenti, non aggiornati")
  })
})

describe("richieste e aggiornamenti", () => {
  test("endpoint e header account corretti, redirect vietati", async () => {
    const request = (async (url: string | URL | Request, init?: RequestInit) => {
      expect(url).toBe("https://chatgpt.com/backend-api/wham/usage")
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret")
      expect(new Headers(init?.headers).get("chatgpt-account-id")).toBe("account")
      expect(init?.redirect).toBe("error")
      return Response.json(payload)
    }) as typeof fetch
    expect((await fetchUsage({ access: "secret", accountId: "account" }, new AbortController().signal, request)).windows[0].remaining).toBe(72)
  })
  test("errori HTTP e rete non espongono token o corpo della risposta", async () => {
    for (const status of [401, 403, 429, 500]) {
      const request = (async () => new Response("secret-token", { status })) as unknown as typeof fetch
      try {
        await fetchUsage({ access: "secret-token" }, new AbortController().signal, request)
        throw new Error("expected failure")
      } catch (error) {
        expect(error).toBeInstanceOf(UsageError)
        expect((error as Error).message).not.toContain("secret-token")
      }
    }
    const request = (async () => { throw new Error("secret-token") }) as unknown as typeof fetch
    expect(fetchUsage({ access: "secret-token" }, new AbortController().signal, request)).rejects.toThrow("Connessione Codex")
  })
  test("richieste concorrenti deduplicate, dato vecchio solo per lo stesso account", async () => {
    let resolve!: (snapshot: ReturnType<typeof parseUsage>) => void
    let calls = 0
    let accountId = "first"
    let fail = false
    let state: UsageState = { loading: false }
    const monitor = createMonitor({
      signal: new AbortController().signal,
      onChange: (next) => { state = next },
      credentials: async () => ({ access: "token", accountId }),
      load: async () => {
        calls++
        if (fail) throw new UsageError("network", "offline")
        return new Promise((done) => { resolve = done })
      },
    })
    const first = monitor.refresh()
    expect(monitor.refresh()).toBe(first)
    await Promise.resolve()
    resolve(parseUsage(payload))
    await first
    expect(calls).toBe(1)
    fail = true
    await monitor.refresh()
    expect(state.snapshot).toBeDefined()
    accountId = "second"
    await monitor.refresh()
    expect(state.snapshot).toBeUndefined()
  })
  test("scadenza elimina vecchie quote; stop impedisce nuove richieste", async () => {
    const controller = new AbortController()
    let expired = false
    let calls = 0
    let state: UsageState = { loading: false }
    const monitor = createMonitor({
      signal: controller.signal,
      onChange: (next) => { state = next },
      credentials: async () => {
        calls++
        if (expired) throw new UsageError("expired", "scaduto")
        return { access: "token" }
      },
      load: async () => parseUsage(payload),
    })
    await monitor.refresh()
    expired = true
    await monitor.refresh()
    expect(state.snapshot).toBeUndefined()
    expect(state.error?.code).toBe("expired")
    controller.abort()
    await monitor.refresh()
    expect(calls).toBe(2)
  })
})
