import { Plugin } from "@opencode/plugin"
import { createMonitor, type UsageState } from "./monitor"
import { CodexUsage, type UsageResponse } from "./rpc"
import { parseCredentials, UsageError } from "./usage"

export default Plugin.define({
  id: "codex-usage",
  async setup(ctx) {
    const controller = new AbortController()
    let state: UsageState = { loading: false }
    const monitor = createMonitor({
      signal: controller.signal,
      onChange: (next) => { state = next },
      async credentials() {
        try {
          const connection = await ctx.integration.connection.active("openai")
          if (!connection) throw new UsageError("auth", "Collega OpenAI con il login ChatGPT tramite /connect.")
          const credential = await ctx.integration.connection.resolve(connection)
          if (credential?.type !== "oauth") throw new UsageError("auth", "Per la quota Codex serve il login ChatGPT, non una chiave API.")
          return parseCredentials({ openai: {
            type: credential.type,
            access: credential.access,
            expires: credential.expires,
            accountId: credential.metadata?.accountId,
          } })
        } catch (error) {
          if (error instanceof UsageError) throw error
          throw new UsageError("auth", "Credenziali OpenAI non disponibili. Verifica il login ChatGPT tramite /connect.")
        }
      },
    })
    await ctx.rpc.register(CodexUsage, {
      async refresh() {
        await monitor.refresh()
        const result: UsageResponse = {}
        if (state.snapshot) result.snapshot = state.snapshot
        if (state.error) result.error = { code: state.error.code, message: state.error.message }
        return result
      },
    })
    return () => controller.abort()
  },
})
