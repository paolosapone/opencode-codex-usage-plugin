import { fetchUsage, readCredentials, UsageError, type Credentials, type UsageSnapshot } from "./usage"

export interface UsageState {
  snapshot?: UsageSnapshot
  error?: UsageError
  loading: boolean
}

export function createMonitor(input: {
  signal: AbortSignal
  onChange: (state: UsageState) => void
  credentials?: () => Promise<Credentials>
  load?: typeof fetchUsage
  timeoutMs?: number
}) {
  let state: UsageState = { loading: false }
  let pending: Promise<void> | undefined
  let identity: string | undefined
  const publish = (next: UsageState) => {
    state = next
    if (!input.signal.aborted) input.onChange(state)
  }
  const refresh = (): Promise<void> => {
    if (input.signal.aborted) return Promise.resolve()
    if (pending) return pending
    pending = (async () => {
      publish({ ...state, loading: true })
      const signal = AbortSignal.any([input.signal, AbortSignal.timeout(input.timeoutMs ?? 10000)])
      try {
        const auth = await (input.credentials ?? readCredentials)()
        // Never retain one account's quota when the user changes accounts.
        const nextIdentity = auth.accountId ?? auth.access
        if (identity !== nextIdentity) {
          identity = nextIdentity
          publish({ loading: true })
        }
        const snapshot = await (input.load ?? fetchUsage)(auth, signal)
        publish({ snapshot, loading: false })
      } catch (error) {
        const safe = error instanceof UsageError ? error : new UsageError("network", "Quota Codex non disponibile.")
        publish({
          snapshot: safe.code === "auth" || safe.code === "expired" ? undefined : state.snapshot,
          error: safe,
          loading: false,
        })
      }
    })().finally(() => { pending = undefined })
    return pending
  }
  return { refresh }
}
