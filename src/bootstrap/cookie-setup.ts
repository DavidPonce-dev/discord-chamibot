import type { CookieStorePort, BrowserPort, LoggerPort } from "../domain/ports"
import { createCookieScheduler, type CookieScheduler } from "../infra/cookie/scheduler"

type CookieSetupDeps = Readonly<{
  cookieStore: CookieStorePort
  browser: BrowserPort
  cookieRefreshIntervalMs: number
  logger: LoggerPort
}>

export const initCookieSystem = async (deps: CookieSetupDeps): Promise<CookieScheduler | null> => {
  const { cookieStore, browser, cookieRefreshIntervalMs, logger } = deps
  const cookiePath = cookieStore.filePath()

  if (!cookiePath) return null

  const validation = cookieStore.validate()
  if (validation.isValid) {
    logger.info("bot", "YouTube cookies configuradas", { path: cookiePath, count: validation.cookieCount })
    const scheduler = createCookieScheduler(browser, cookieRefreshIntervalMs, logger)
    scheduler.start()
    return scheduler
  }

  logger.warn("bot", "Cookies invalidas, intentando refrescar...")
  const result = await browser.refresh()
  if (result.success) {
    logger.info("bot", "Cookies refrescadas", { count: result.cookieCount })
    const scheduler = createCookieScheduler(browser, cookieRefreshIntervalMs, logger)
    scheduler.start()
    return scheduler
  }

  logger.warn("bot", "No se pudieron refrescar cookies. Usa el admin panel.")
  return null
}
