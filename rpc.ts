import { Rpc } from "@opencode/plugin/rpc"
import type { UsageSnapshot, UsageError } from "./usage"

// This is the complete wire format. Credentials must never cross this boundary.
export interface UsageResponse {
  snapshot?: UsageSnapshot
  error?: { code: UsageError["code"]; message: string }
}

export const CodexUsage = Rpc.define({
  id: "codex-usage",
  methods: {
    refresh: {
      input: { type: "object", additionalProperties: false },
      output: {
        type: "object",
        additionalProperties: false,
        properties: {
          snapshot: {
            type: "object",
            additionalProperties: false,
            required: ["windows", "fetchedAt"],
            properties: {
              plan: { type: "string" },
              fetchedAt: { type: "number" },
              windows: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "remaining"],
                  properties: {
                    label: { type: "string" },
                    remaining: { type: "number", minimum: 0, maximum: 100 },
                    resetAt: { type: "number" },
                  },
                },
              },
            },
          },
          error: {
            type: "object",
            additionalProperties: false,
            required: ["code", "message"],
            properties: {
              code: { enum: ["auth", "expired", "network", "http", "format"] },
              message: { type: "string" },
            },
          },
        },
      },
    },
  },
  events: {},
})
