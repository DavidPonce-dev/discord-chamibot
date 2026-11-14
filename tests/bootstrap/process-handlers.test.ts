import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { setupProcessHandlers } from "@/bootstrap/process-handlers"
import type { LoggerPort } from "@/domain/ports"
import type { GuildSession } from "@/domain/types"
import type { CookieScheduler } from "@/infra/cookie/scheduler"

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }

describe("bootstrap/process-handlers shutdown", () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>
  let exit: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    handlers = new Map()
    vi.spyOn(process, "on").mockImplementation(((event: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(event, fn)
      return process
    }) as never)
    exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never)
  })
  afterEach(() => { vi.restoreAllMocks() })

  const setup = (browserClose: () => Promise<void> = async () => {}) => {
    const deps = {
      adminServer: { stop: vi.fn(async () => {}) },
      cookieScheduler: { stop: vi.fn() } as unknown as CookieScheduler,
      logger,
      music: {
        getSessions: () => new Map([["g1", {} as GuildSession], ["g2", {} as GuildSession]]),
        destroySession: vi.fn(),
      },
      browser: { close: vi.fn(browserClose) },
      getClient: vi.fn(() => client),
    }
    const client = { destroy: vi.fn(async () => {}) }
    setupProcessHandlers(deps)
    return { deps, client }
  }

  it("al recibir SIGTERM corta las sesiones, cierra el navegador y desconecta el bot", async () => {
    const { deps, client } = setup()

    await handlers.get("SIGTERM")!()

    expect(deps.music.destroySession).toHaveBeenCalledWith("g1")
    expect(deps.music.destroySession).toHaveBeenCalledWith("g2")
    // An unclean Chromium exit can leave the persistent profile locked or lose the session
    expect(deps.browser.close).toHaveBeenCalled()
    expect(client.destroy).toHaveBeenCalled()
    expect(deps.cookieScheduler.stop).toHaveBeenCalled()
    expect(deps.adminServer.stop).toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(0)
  })

  it("termina el proceso aunque falle el cierre del navegador", async () => {
    const { deps } = setup(async () => { throw new Error("browser gone") })

    await handlers.get("SIGINT")!()

    expect(deps.adminServer.stop).toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(0)
  })
})
