import type { BrowserPort, LoggerPort } from "../../domain/ports"

export const createCookieScheduler = (
  browser: BrowserPort,
  intervalMs: number,
  logger: LoggerPort,
) => {
  let timer: NodeJS.Timeout | null = null
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

  // The browser is launched on demand by each refresh and closed afterwards,
  // so there is no need to keep it alive between refreshes
  const start = (): void => {
    if (isRunning) return
    isRunning = true

    timer = setInterval(() => { runRefresh() }, intervalMs)
    timer.unref()
  }

  const pause = (): void => {
    if (timer) { clearInterval(timer); timer = null }
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
