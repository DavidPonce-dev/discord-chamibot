import type { BrowserPort, LoggerPort } from "../../domain/ports"
import type { CookieValidation } from "../../domain/types"
import { COOKIE_AUTH_CHECK_INTERVAL_MS, COOKIE_RECOVERY_MAX_BACKOFF_MS } from "../../config/timeouts"

type AuthWatchOptions = Readonly<{
  // Reads the cookie file; enables the session watchdog when provided
  validate?: () => CookieValidation
  checkIntervalMs?: number
  maxBackoffMs?: number
}>

export const createCookieScheduler = (
  browser: BrowserPort,
  intervalMs: number,
  logger: LoggerPort,
  authWatch: AuthWatchOptions = {},
) => {
  const { validate, checkIntervalMs = COOKIE_AUTH_CHECK_INTERVAL_MS, maxBackoffMs = COOKIE_RECOVERY_MAX_BACKOFF_MS } = authWatch

  let timer: NodeJS.Timeout | null = null
  let checkTimer: NodeJS.Timeout | null = null
  let isRunning = false
  let isRefreshing = false
  // Session watchdog state: back off between failed recoveries (a logged-out profile can't recover
  // on its own, so don't relaunch Chromium every check)
  let backoffMs = checkIntervalMs
  let nextRecoveryAt = 0
  let failing = false

  const runRefresh = async (reason: string): Promise<boolean> => {
    if (isRefreshing) return false
    isRefreshing = true
    try {
      const result = await browser.refresh()
      if (result.success) {
        logger.info("cookies", "Refresh completed", { reason, cookieCount: result.cookieCount })
        return true
      }
      logger.error("cookies", "Refresh failed", { reason, error: result.error })
      return false
    } catch (e: unknown) {
      logger.error("cookies", "Error during refresh", { reason, error: String(e) })
      return false
    } finally {
      isRefreshing = false
    }
  }

  // Renews the cookies as soon as the Google session (SID/PSID) is missing, even if nobody is
  // using the bot, instead of waiting for the next periodic refresh or a failed playback
  const checkSession = async (): Promise<void> => {
    if (!validate) return
    if (validate().isValid) {
      if (failing) logger.info("cookies", "Sesion de YouTube recuperada (SID/PSID presentes)")
      failing = false
      backoffMs = checkIntervalMs
      nextRecoveryAt = 0
      return
    }
    if (Date.now() < nextRecoveryAt) return

    logger.warn("cookies", "Cookies sin SID/PSID: renovando automaticamente")
    await runRefresh("missing_session")
    if (validate().isValid) {
      logger.info("cookies", "Cookies renovadas automaticamente")
      failing = false
      backoffMs = checkIntervalMs
      nextRecoveryAt = 0
      return
    }

    failing = true
    nextRecoveryAt = Date.now() + backoffMs
    logger.error("cookies", "No se pudo recuperar la sesion de YouTube: probablemente hay que iniciar sesion desde el panel de admin (VNC)", {
      nextAttemptInMin: Math.round(backoffMs / 60_000),
    })
    backoffMs = Math.min(backoffMs * 2, maxBackoffMs)
  }

  // The browser is launched on demand by each refresh and closed afterwards,
  // so there is no need to keep it alive between refreshes
  const schedule = (): void => {
    if (!timer) {
      timer = setInterval(() => { runRefresh("scheduled") }, intervalMs)
      timer.unref()
    }
    if (validate && !checkTimer) {
      checkTimer = setInterval(() => { checkSession() }, checkIntervalMs)
      checkTimer.unref()
    }
  }

  const start = (): void => {
    if (isRunning) return
    isRunning = true
    schedule()
  }

  const pause = (): void => {
    if (timer) { clearInterval(timer); timer = null }
    if (checkTimer) { clearInterval(checkTimer); checkTimer = null }
  }

  // Resume only a started scheduler (pause during the VNC login keeps isRunning true)
  const resume = (): void => {
    if (!isRunning) return
    // A manual login may have just fixed the session: retry right away instead of waiting the backoff
    nextRecoveryAt = 0
    backoffMs = checkIntervalMs
    schedule()
  }

  const stop = (): void => {
    if (!isRunning) return
    isRunning = false
    pause()
  }

  return { start, pause, resume, stop, checkNow: checkSession } as const
}

export type CookieScheduler = ReturnType<typeof createCookieScheduler>
