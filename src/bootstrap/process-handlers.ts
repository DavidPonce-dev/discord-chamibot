import type { LoggerPort } from "../domain/ports"
import type { CookieScheduler } from "../infra/cookie/scheduler"

type ShutdownDeps = Readonly<{
  adminServer: { stop: () => Promise<void> }
  cookieScheduler: CookieScheduler | null
  logger: LoggerPort
}>

export const setupProcessHandlers = (deps: ShutdownDeps): void => {
  const { adminServer, cookieScheduler, logger } = deps

  const shutdown = async (): Promise<void> => {
    logger.info("process", "Shutting down...")
    cookieScheduler?.stop()
    await adminServer.stop()
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
