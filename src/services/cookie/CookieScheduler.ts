import { logger } from "@/utils/logger"
import { CookieRefresherService } from "./CookieRefresherService"

export class CookieScheduler {
  private refresher: CookieRefresherService
  private intervalMs: number
  private timer: NodeJS.Timeout | null = null
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
    })

    this.timer = setInterval(() => {
      this.runRefresh()
    }, this.intervalMs)

    this.timer.unref()
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

  get running(): boolean {
    return this.isRunning
  }
}
