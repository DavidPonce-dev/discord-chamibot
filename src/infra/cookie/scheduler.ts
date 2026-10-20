import type { BrowserPort, LoggerPort } from "../../domain/ports"

export const createCookieScheduler = (
  browser: BrowserPort,
  intervalMs: number,
  logger: LoggerPort,
) => {
  let timer: NodeJS.Timeout | null = null
  let isRunning = false
  let isRefreshing = false

  const runRefresh = async (): Promise<void> => {
    if (isRefreshing) return
    isRefreshing = true
    try {
      const result = await browser.refresh()
      if (result.success) {
        logger.info("cookies", "Scheduled refresh completed", { cookieCount: result.cookieCount })
        return
      }
      logger.error("cookies", "Scheduled refresh failed", { error: result.error })
    } catch (e: unknown) {
      logger.error("cookies", "Error during scheduled refresh", { error: String(e) })
    } finally {
      isRefreshing = false
    }
  }

  // The browser is launched on demand by each refresh and closed afterwards,
  // so there is no need to keep it alive between refreshes
  const schedule = (): void => {
    if (timer) return
    timer = setInterval(() => { runRefresh() }, intervalMs)
    timer.unref()
  }

  const start = (): void => {
    if (isRunning) return
    isRunning = true
    schedule()
  }

  const pause = (): void => {
    if (timer) { clearInterval(timer); timer = null }
  }

  // Resume only a started scheduler (pause during the VNC login keeps isRunning true)
  const resume = (): void => {
    if (isRunning) schedule()
  }

  const stop = (): void => {
    if (!isRunning) return
    isRunning = false
    pause()
  }

  return { start, pause, resume, stop } as const
}

export type CookieScheduler = ReturnType<typeof createCookieScheduler>
