import { setupCookies, setCookieFile, validateCookies, getRefresherInstance, setScheduler, initBrowser, refreshCookies } from "@/cookies/CookieManager"
import { CookieScheduler } from "@/cookies/CookieScheduler"
import { startAdminServer, stopAdminServer, setSchedulerInstance } from "@/admin/AdminServer"
import { createBot } from "@/bot"
import { logger } from "@/utils/logger"
import { config } from "@/config"

let cookieScheduler: CookieScheduler | null = null

function startCookieScheduler(cookiePath: string | null) {
  if (!cookiePath) {
    logger.warn("cookies", "No cookies available, scheduler not started")
    return
  }

  const validation = validateCookies()
  if (!validation.isValid) {
    logger.warn("cookies", "Invalid cookies, scheduler not started")
    return
  }

  const refresher = getRefresherInstance()
  cookieScheduler = new CookieScheduler(refresher, config.youtube.cookieRefreshIntervalMs)
  cookieScheduler.start()
  setScheduler(cookieScheduler)
  setSchedulerInstance(cookieScheduler)

  logger.info("cookies", "Cookie scheduler initialized", {
    intervalHours: config.youtube.cookieRefreshIntervalMs / (1000 * 60 * 60),
  })
}

async function stopCookieScheduler() {
  if (cookieScheduler) {
    cookieScheduler.stop()
    cookieScheduler = null
  }
}

function setupProcessHandlers() {
  process.on("SIGINT", async () => {
    logger.info("process", "Shutting down (browser left running for persistence)...")
    await stopCookieScheduler()
    await stopAdminServer()
    process.exit(0)
  })

  process.on("SIGTERM", async () => {
    logger.info("process", "Shutting down (browser left running for persistence)...")
    await stopCookieScheduler()
    await stopAdminServer()
    process.exit(0)
  })

  process.on("unhandledRejection", (reason) => {
    const msg = String(reason)
    if (msg.includes("IP discovery") || msg.includes("socket closed")) {
      logger.debug("process", "Error de voz conocido (ignorado)", { reason: msg })
      return
    }
    logger.error("process", "Unhandled rejection", { reason: msg })
  })

  process.on("uncaughtException", (err) => {
    logger.error("process", "Uncaught exception", { error: err.message, stack: err.stack })
    process.exit(1)
  })
}

export async function bootstrap() {
  setupProcessHandlers()

  const cookiePath = setupCookies()
  setCookieFile(cookiePath)
  if (cookiePath) {
    const validation = validateCookies()
    if (validation.isValid) {
      logger.info("bot", "YouTube cookies configuradas", { path: cookiePath, count: validation.cookieCount })
      startCookieScheduler(cookiePath)
    } else {
      logger.warn("bot", "Cookies inválidas o expiradas, intentando refrescar automáticamente...", { path: cookiePath })
      const refreshResult = await refreshCookies()
      if (refreshResult.success) {
        logger.info("bot", "Cookies refrescadas exitosamente al inicio", { count: refreshResult.cookieCount })
        startCookieScheduler(cookiePath)
      } else {
        logger.warn("bot", "No se pudieron refrescar las cookies automáticamente. Usá el admin panel para hacer login.", { path: cookiePath })
      }
    }
  }

  initBrowser().catch((err) => {
    logger.error("cookies", "Failed to initialize browser", { error: err.message })
  })

  const adminPort = parseInt(process.env.ADMIN_PORT || "3002", 10)
  startAdminServer(adminPort)

  const client = createBot()

  logger.info("bot", "Iniciando conexión a Discord...")
  await client.login(config.discord.token)
}
