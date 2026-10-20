import type { CookieStorePort, BrowserPort, LoggerPort } from "../domain/ports"
import { createCookieScheduler, type CookieScheduler } from "../infra/cookie/scheduler"

type CookieSetupDeps = Readonly<{
  cookieStore: CookieStorePort
  browser: BrowserPort
  cookieRefreshIntervalMs: number
  logger: LoggerPort
}>

// Always runs the scheduler, even without a cookie file or with invalid cookies: its session
// watchdog keeps trying to renew them (with backoff) instead of giving up until a restart
export const initCookieSystem = async (deps: CookieSetupDeps): Promise<CookieScheduler> => {
  const { cookieStore, browser, cookieRefreshIntervalMs, logger } = deps

  const scheduler = createCookieScheduler(browser, cookieRefreshIntervalMs, logger, {
    validate: () => cookieStore.validate(),
  })

  const validation = cookieStore.validate()
  if (validation.isValid) {
    logger.info("bot", "YouTube cookies configuradas", { path: cookieStore.filePath(), count: validation.cookieCount })
  } else {
    // Renew before the bot starts taking commands, so the first /p already has a session
    await scheduler.checkNow()
  }

  scheduler.start()
  return scheduler
}
