import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"

export class UsageError extends Error {
  constructor(public readonly code: "auth" | "expired" | "network" | "http" | "format", message: string) {
    super(message)
  }
}

export interface Credentials {
  access: string
  accountId?: string
}

export interface UsageWindow {
  label: string
  remaining: number
  resetAt?: number
}

export interface UsageSnapshot {
  plan?: string
  windows: UsageWindow[]
  fetchedAt: number
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function claims(access: string): Record<string, unknown> | undefined {
  try {
    return record(JSON.parse(Buffer.from(access.split(".")[1], "base64url").toString()))
  } catch {
    return undefined
  }
}

export function parseCredentials(value: unknown, now = Date.now()): Credentials {
  const auth = record(record(value)?.openai)
  if (auth?.type !== "oauth" || typeof auth.access !== "string" || !auth.access) {
    throw new UsageError("auth", "Collega OpenAI con il login ChatGPT tramite /connect.")
  }
  const jwt = claims(auth.access)
  const expires = number(auth.expires) ?? (number(jwt?.exp) !== undefined ? Number(jwt?.exp) * 1000 : undefined)
  if (expires !== undefined && expires <= now) {
    throw new UsageError("expired", "Login scaduto: invia un messaggio con OpenAI per farlo rinnovare da OpenCode, oppure usa /connect.")
  }
  const nested = record(jwt?.["https://api.openai.com/auth"])
  const organizations = jwt?.organizations
  const firstOrg = Array.isArray(organizations) ? record(organizations[0]) : undefined
  const id = auth.accountId ?? jwt?.chatgpt_account_id ?? nested?.chatgpt_account_id ?? firstOrg?.id
  return { access: auth.access, accountId: typeof id === "string" && id ? id : undefined }
}

export function authPath(env = process.env, home = homedir()): string {
  const base = env.XDG_DATA_HOME && isAbsolute(env.XDG_DATA_HOME)
    ? env.XDG_DATA_HOME
    : join(home, ".local", "share")
  return join(base, "opencode", "auth.json")
}

export async function readCredentials(): Promise<Credentials> {
  try {
    const text = process.env.OPENCODE_AUTH_CONTENT ?? await readFile(authPath(), "utf8")
    return parseCredentials(JSON.parse(text))
  } catch (error) {
    if (error instanceof UsageError) throw error
    throw new UsageError("auth", "Credenziali OpenCode non disponibili. Collega OpenAI con ChatGPT tramite /connect.")
  }
}

export function windowLabel(seconds: number | undefined, fallback: string): string {
  if (!seconds || seconds <= 0) return fallback
  if (seconds % 86400 === 0) return `${seconds / 86400}g`
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

export function parseUsage(value: unknown, now = Date.now()): UsageSnapshot {
  const root = record(value)
  const limit = record(root?.rate_limit)
  const windows: UsageWindow[] = []
  for (const [key, fallback] of [["primary_window", "breve"], ["secondary_window", "lunga"]]) {
    const raw = record(limit?.[key])
    if (!raw) continue
    const used = number(raw.used_percent)
    if (used === undefined || used < 0 || used > 100) {
      throw new UsageError("format", "Percentuale quota Codex non valida.")
    }
    const resetAt = number(raw.reset_at)
    const resetAfter = number(raw.reset_after_seconds)
    windows.push({
      label: windowLabel(number(raw.limit_window_seconds), fallback),
      remaining: 100 - used,
      resetAt: resetAt !== undefined && resetAt > 0 ? resetAt * 1000
        : resetAfter !== undefined && resetAfter >= 0 ? now + resetAfter * 1000 : undefined,
    })
  }
  if (!windows.length) throw new UsageError("format", "La risposta Codex non contiene finestre di quota disponibili.")
  return {
    plan: typeof root?.plan_type === "string" ? root.plan_type.replace(/[^a-zA-Z0-9_-]/g, "") : undefined,
    windows,
    fetchedAt: now,
  }
}

export async function fetchUsage(credentials: Credentials, signal: AbortSignal, request = fetch): Promise<UsageSnapshot> {
  const headers = new Headers({
    Authorization: `Bearer ${credentials.access}`,
    Accept: "application/json",
    "User-Agent": "opencode-codex-usage/0.1.0",
  })
  if (credentials.accountId) headers.set("ChatGPT-Account-Id", credentials.accountId)
  try {
    const response = await request("https://chatgpt.com/backend-api/wham/usage", {
      headers,
      signal,
      redirect: "error",
    })
    if (response.status === 401) throw new UsageError("expired", "Login non valido o scaduto. Usa OpenAI in OpenCode per rinnovarlo, oppure /connect.")
    if (response.status === 403) throw new UsageError("http", "Accesso alla quota negato (HTTP 403). Verifica il login ChatGPT.")
    if (response.status === 429) throw new UsageError("http", "Troppe richieste (HTTP 429). Riprovo al prossimo aggiornamento.")
    if (!response.ok) throw new UsageError("http", `Quota Codex non disponibile (HTTP ${response.status}).`)
    let body: unknown
    try { body = await response.json() } catch { throw new UsageError("format", "Risposta Codex non JSON.") }
    return parseUsage(body)
  } catch (error) {
    if (error instanceof UsageError) throw error
    throw new UsageError("network", "Connessione Codex non riuscita o timeout. Riprovo al prossimo aggiornamento.")
  }
}
