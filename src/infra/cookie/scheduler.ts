import type { BrowserPort, LoggerPort } from "../../domain/ports"

const BROWSER_HEALTH_CHECK_MS = 5 * 60 * 1000

export const createCookieScheduler = (
  browser: BrowserPort,
  intervalMs: number,
  logger: LoggerPort,
) => {
  let timer: NodeJS.Timeout | null = null
  let healthTimer: NodeJS.Timeout | null = null
  let isRunning = false
  let isRefreshing = false

  const runRefresh = async (): Promise<boolean> => {
    if (isRefreshing) return false
    isRefreshing = true
    try {
      const result = await browser.refresh()
      if (result.success) {
        logger.info("cookies", "Scheduled refresh completed", { cookieCount: result.cookieCount })
        return true
      }
      logger.error("cookies", "Scheduled refresh failed", { error: result.error })
      return false
    } catch (e: unknown) {
      logger.error("cookies", "Error during scheduled refresh", { error: String(e) })
      return false
    } finally {
      isRefreshing = false
    }
  }

  const runHealthCheck = async (): Promise<void> => {
    if (!browser.isActive()) {
      logger.info("cookies", "Health check: browser not running, re-initializing")
      await browser.init()
      return
    }
  }

  const start = (): void => {
    if (isRunning) return
    isRunning = true

    timer = setInterval(() => { runRefresh() }, intervalMs)
    timer.unref()

    healthTimer = setInterval(() => { runHealthCheck() }, BROWSER_HEALTH_CHECK_MS)
    healthTimer.unref()
  }

  const pause = (): void => {
    if (timer) { clearInterval(timer); timer = null }
    if (healthTimer) { clearInterval(healthTimer); healthTimer = null }
  }

  const resume = (): void => {
    if (!isRunning) return
    start()
  }

  const stop = (): void => {
    if (!isRunning) return
    isRunning = false
    pause()
  }

  const refreshNow = (): Promise<boolean> => runRefresh()

  return { start, pause, resume, stop, refreshNow, get running() { return isRunning } } as const
}

export type CookieScheduler = ReturnType<typeof createCookieScheduler>
