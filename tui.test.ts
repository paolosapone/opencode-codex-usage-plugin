import { expect, test } from "bun:test"
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure"
import { RGBA } from "@opentui/core"
import { testRender, type JSX } from "@opentui/solid"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

ensureRuntimePluginSupport()

test("caricamento TSX, indicatore reattivo nei due slot e resize della TUI", async () => {
  const originalFetch = globalThis.fetch
  const originalAuth = process.env.OPENCODE_AUTH_CONTENT
  const controller = new AbortController()
  const cleanup: (() => void)[] = []
  let remaining = 72
  let failure = false
  const slots: Record<string, () => JSX.Element> = {}
  const commands: { slashName: string; run: () => void | Promise<void> }[] = []
  let dialogOpened = false
  let dialogClosed: (() => void) | undefined
  let dialogOpens = 0
  process.env.OPENCODE_AUTH_CONTENT = JSON.stringify({ openai: {
    type: "oauth", access: "test-token", accountId: "test-account", expires: Date.now() + 3600000,
  } })
  globalThis.fetch = (async () => {
    if (failure) return new Response("private error", { status: 500 })
    return Response.json({ rate_limit: {
      primary_window: { used_percent: 100 - remaining, limit_window_seconds: 18000 },
      secondary_window: { used_percent: 59, limit_window_seconds: 604800 },
    } })
  }) as unknown as typeof fetch
  const api = {
    theme: { current: {
      textMuted: RGBA.fromHex("#888888"), warning: RGBA.fromHex("#ffcc00"),
      error: RGBA.fromHex("#ff0000"), success: RGBA.fromHex("#00ff00"),
    } },
    lifecycle: { signal: controller.signal, onDispose: (fn: () => void) => { cleanup.push(fn) } },
    slots: { register: (plugin: { slots: typeof slots }) => { Object.assign(slots, plugin.slots) } },
    keymap: { registerLayer: (layer: { commands: typeof commands }) => { commands.push(...layer.commands) } },
    event: { on: () => () => {} },
    ui: { DialogAlert: () => null, dialog: {
      get open() { return dialogOpened },
      replace: (_render: () => JSX.Element, onClose?: () => void) => {
        dialogClosed?.()
        dialogClosed = onClose
        dialogOpened = true
        dialogOpens++
      },
      clear: () => { dialogOpened = false; dialogClosed?.(); dialogClosed = undefined },
    } },
  } as unknown as TuiPluginApi
  let view: Awaited<ReturnType<typeof testRender>> | undefined
  try {
    const { default: plugin } = await import("./index")
    await plugin.tui(api, undefined, {} as never)
    expect(Object.keys(slots)).toEqual(["home_prompt_right", "session_prompt_right"])
    await commands.find((command) => command.slashName === "codex-usage-refresh")!.run()
    view = await testRender(() => slots.session_prompt_right(), { width: 120, height: 3 })
    await view.waitForFrame((frame) => frame.includes("5h: 72%"))
    expect(view.captureCharFrame()).not.toContain("7g:")
    await view.mockMouse.click(2, 0, 2)
    await view.flush()
    expect(view.captureCharFrame()).toContain("7g: 41%")
    api.ui.dialog.clear()
    const opensBeforeClicks = dialogOpens
    await view.mockMouse.click(2, 0, 2)
    await view.flush()
    expect(view.captureCharFrame()).toContain("5h: 72%")
    expect(view.captureCharFrame()).not.toContain("7g:")
    expect(dialogOpens).toBe(opensBeforeClicks)
    view.resize(80, 3)
    await view.flush()
    expect(view.captureCharFrame()).toContain("Codex 72% rim.")
    await view.mockMouse.click(2, 0, 2)
    await view.flush()
    expect(view.captureCharFrame()).toContain("Codex 41% rim.")
    view.resize(120, 3)
    await view.flush()
    await view.mockMouse.pressDown(2, 0)
    expect(dialogOpened).toBe(false)
    await view.mockMouse.release(2, 0)
    expect(dialogOpened).toBe(true)
    await view.mockMouse.moveTo(100, 2)
    expect(dialogOpened).toBe(true)
    await view.mockMouse.click(2, 0)
    expect(dialogOpened).toBe(false)
    await view.mockMouse.click(2, 0)
    expect(dialogOpened).toBe(true)
    api.ui.dialog.clear()
    await view.mockMouse.click(2, 0)
    expect(dialogOpened).toBe(true)
    remaining = 8
    await commands.find((command) => command.slashName === "codex-usage-refresh")!.run()
    await view.flush()
    expect(view.captureCharFrame()).toContain("5h: 8%")
    expect(dialogOpened).toBe(true)
    view.resize(80, 3)
    await view.flush()
    expect(view.captureCharFrame()).toContain("Codex 8% rim.")
    failure = true
    await commands.find((command) => command.slashName === "codex-usage-refresh")!.run()
    await view.flush()
    expect(view.captureCharFrame()).toContain("Codex 8% rim. *")
    expect(view.captureCharFrame()).not.toContain("private error")
  } finally {
    controller.abort()
    for (const fn of cleanup) fn()
    view?.renderer.destroy()
    globalThis.fetch = originalFetch
    if (originalAuth === undefined) delete process.env.OPENCODE_AUTH_CONTENT
    else process.env.OPENCODE_AUTH_CONTENT = originalAuth
  }
})
