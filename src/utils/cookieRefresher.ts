import { logger } from "./logger"

const REFRESHER_URL = process.env.COOKIE_REFRESHER_URL || "http://cookie-refresher:3001"
const REFRESH_TIMEOUT_MS = 60_000

const COOKIE_ERROR_PATTERNS = [
  "Sign in to confirm",
  "Please sign in",
  "HTTP Error 403",
  "consent age gate",
  "cookies",
  "rejected",
  "account",
  "authentication",
  "login",
]

export function isCookieError(error: string): boolean {
  const lower = error.toLowerCase()
  return COOKIE_ERROR_PATTERNS.some((pattern) => lower.includes(pattern))
}

export async function refreshCookies(): Promise<{ success: boolean; cookieCount?: number }> {
  logger.info("cookies", "Refreshing YouTube cookies via refresher service")

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS)

    const response = await fetch(`${REFRESHER_URL}/refresh`, {
      method: "POST",
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Refresher returned ${response.status}: ${text.slice(0, 200)}`)
    }

    const result = await response.json()
    logger.info("cookies", "Cookies refreshed successfully", {
      count: result.cookieCount,
      names: result.cookieNames?.slice(0, 10),
    })

    return { success: true, cookieCount: result.cookieCount }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error("cookies", "Failed to refresh cookies", { error: msg })
    return { success: false }
  }
}
