import { logger } from "@/utils/logger"
import { CookieRefresherService } from "./CookieRefresherService"

const BROWSER_HEALTH_CHECK_MS = 5 * 60 * 1000 // 5 minutes

export class CookieScheduler {
  private refresher: CookieRefresherService
  private intervalMs: number
  private timer: NodeJS.Timeout | null = null
  private healthTimer: NodeJS.Timeout | null = null
  private isRunning = false
  private isRefreshing = false

  constructor(refresher: CookieRefresherService, intervalMs: number) {
    this.refresher = refresher
    this.intervalMs = intervalMs
  }

  start() {
    if (this.isRunning) {
      logger.warn("cookies", "Scheduler already running")
      return
    }

    this.isRunning = true
    logger.info("cookies", "Cookie scheduler started", {
      intervalHours: this.intervalMs / (1000 * 60 * 60),
      healthCheckMinutes: BROWSER_HEALTH_CHECK_MS / (1000 * 60),
    })

    this.timer = setInterval(() => {
      this.runRefresh()
    }, this.intervalMs)

    this.timer.unref()

    this.healthTimer = setInterval(() => {
      this.runHealthCheck()
    }, BROWSER_HEALTH_CHECK_MS)

    this.healthTimer.unref()
  }

  pause() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
    logger.info("cookies", "Cookie scheduler paused")
  }

  resume() {
    if (!this.isRunning) {
      return
    }
    this.timer = setInterval(() => {
      this.runRefresh()
    }, this.intervalMs)
    this.timer.unref()

    this.healthTimer = setInterval(() => {
      this.runHealthCheck()
    }, BROWSER_HEALTH_CHECK_MS)
    this.healthTimer.unref()

    logger.info("cookies", "Cookie scheduler resumed")
  }

  stop() {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
    logger.info("cookies", "Cookie scheduler stopped")
  }

  async refreshNow(): Promise<boolean> {
    if (this.isRefreshing) {
      logger.warn("cookies", "Refresh already in progress")
      return false
    }

    return this.runRefresh()
  }

  private async runRefresh(): Promise<boolean> {
    this.isRefreshing = true

    try {
      const result = await this.refresher.refreshCookies()

      if (result.success) {
        logger.info("cookies", "Scheduled refresh completed", {
          cookieCount: result.cookieCount,
          timestamp: result.timestamp,
        })
        return true
      } else {
        logger.error("cookies", "Scheduled refresh failed", {
          error: result.error,
        })
        return false
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error("cookies", "Unexpected error during scheduled refresh", { error: msg })
      return false
    } finally {
      this.isRefreshing = false
    }
  }

  private async runHealthCheck() {
    const browser = this.refresher.getBrowser()
    if (!browser) {
      logger.info("cookies", "Health check: browser not running, re-initializing")
      try {
        await this.refresher.initBrowser()
        logger.info("cookies", "Health check: browser re-initialized successfully")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error("cookies", "Health check: failed to re-initialize browser", { error: msg })
      }
      return
    }

    try {
      const pages = browser.pages()
      logger.debug("cookies", "Health check: browser alive", { openPages: pages.length })
    } catch {
      logger.warn("cookies", "Health check: browser unresponsive, re-initializing")
      try {
        await this.refresher.initBrowser()
        logger.info("cookies", "Health check: browser re-initialized after failure")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error("cookies", "Health check: failed to re-initialize browser", { error: msg })
      }
    }
  }

  get running(): boolean {
    return this.isRunning
  }
}
