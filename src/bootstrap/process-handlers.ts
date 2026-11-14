import type { BrowserPort, LoggerPort } from "../domain/ports"
import type { CookieScheduler } from "../infra/cookie/scheduler"
import type { MusicUseCases } from "../usecases/music"
import { getErrorMessage } from "../shared/error"

type ShutdownDeps = Readonly<{
  adminServer: { stop: () => Promise<void> }
  cookieScheduler: CookieScheduler
  logger: LoggerPort
  music: Pick<MusicUseCases, "getSessions" | "destroySession">
  browser: Pick<BrowserPort, "close">
  getClient: () => { destroy: () => Promise<void> | void } | null
}>

export const setupProcessHandlers = (deps: ShutdownDeps): void => {
  const { adminServer, cookieScheduler, logger, music, browser, getClient } = deps

  // A failing step must not keep the others (or the exit) from running
  const step = async (name: string, fn: () => Promise<void> | void): Promise<void> => {
    try {
      await fn()
    } catch (e: unknown) {
      logger.warn("process", `Shutdown: fallo ${name}`, { error: getErrorMessage(e) })
    }
  }

  const shutdown = async (): Promise<void> => {
    logger.info("process", "Shutting down...")
    cookieScheduler.stop()
    // Leaves the voice channels and removes the players instead of leaving dead buttons behind
    await step("sesiones", () => { for (const guildId of [...music.getSessions().keys()]) music.destroySession(guildId) })
    // Killing Chromium mid-write can lock the persistent profile or lose the Google session
    await step("navegador", () => browser.close())
    await step("cliente de Discord", () => getClient()?.destroy())
    await step("servidor admin", () => adminServer.stop())
    process.exit(0)
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  process.on("unhandledRejection", (reason: unknown) => {
    const msg = String(reason)
    if (msg.includes("IP discovery") || msg.includes("socket closed")) {
      logger.debug("process", "Known voice error (ignored)", { reason: msg })
      return
    }
    logger.error("process", "Unhandled rejection", { reason: msg })
  })

  process.on("uncaughtException", (err: Error) => {
    logger.error("process", "Uncaught exception", { error: err.message, stack: err.stack })
    process.exit(1)
  })
}
