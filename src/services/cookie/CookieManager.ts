import fs from "fs"
import path from "path"
import { logger } from "@/utils/logger"
import { COOKIE_REFRESH_TIMEOUT_MS } from "@/config/timeouts"
import { config } from "@/config"
import { CookieRefresherService } from "./CookieRefresherService"
import { CookieValidationResult } from "./types"
import { CookieScheduler } from "./CookieScheduler"

const COOKIE_DIR = config.youtube.cookieDir
const COOKIE_PATH = path.join(COOKIE_DIR, "youtube-cookies.txt")
const MIN_COOKIE_LENGTH = 10

const COOKIE_ERROR_PATTERNS = [
  "sign in to confirm",
  "please sign in",
  "http error 403",
  "consent age gate",
  "youtube.*cookie",
  "rejected.*cookie",
  "account.*unavailable",
  "authentication.*required",
]

let cookieFile: string | null = null
let refresherInstance: CookieRefresherService | null = null
let schedulerInstance: CookieScheduler | null = null

export function setScheduler(scheduler: CookieScheduler | null) {
  schedulerInstance = scheduler
}

function getRefresher(): CookieRefresherService {
  if (!refresherInstance) {
    refresherInstance = new CookieRefresherService({
      cookieDir: COOKIE_DIR,
      cookieFile: COOKIE_PATH,
      browserProfile: config.youtube.browserProfile,
      refreshIntervalMs: config.youtube.cookieRefreshIntervalMs,
      refreshTimeoutMs: COOKIE_REFRESH_TIMEOUT_MS,
    })
  }
  return refresherInstance
}

export function isCookieError(error: string): boolean {
  const lower = error.toLowerCase()
  return COOKIE_ERROR_PATTERNS.some((pattern) => new RegExp(pattern).test(lower))
}

export async function refreshCookies(): Promise<{ success: boolean; cookieCount?: number }> {
  try {
    const result = await getRefresher().refreshCookies()
    if (result.success) {
      cookieFile = COOKIE_PATH
    }
    return { success: result.success, cookieCount: result.cookieCount }
  } catch {
    return { success: false }
  }
}

export async function extractCookies(): Promise<{ success: boolean; cookieCount?: number }> {
  try {
    const result = await getRefresher().extractCookies()
    if (result.success) {
      cookieFile = COOKIE_PATH
    }
    return { success: result.success, cookieCount: result.cookieCount }
  } catch {
    return { success: false }
  }
}

export function validateCookies(): CookieValidationResult {
  return getRefresher().validateCookies()
}

export async function setupCookiesForLogin(): Promise<{ url: string; instructions: string }> {
  return getRefresher().setupForLogin()
}

export function getCookieFile(): string | null {
  return cookieFile
}

export function setCookieFile(filePath: string | null) {
  cookieFile = filePath
}

export function setupCookies(): string | null {
  if (!fs.existsSync(COOKIE_DIR)) {
    fs.mkdirSync(COOKIE_DIR, { recursive: true, mode: 0o700 })
    logger.info("cookie", "Cookie directory created", { path: COOKIE_DIR })
  }

  if (fs.existsSync(COOKIE_PATH)) {
    const validation = validateCookies()
    if (validation.isValid) {
      logger.info("cookie", "YouTube cookies found (mounted file)", {
        path: COOKIE_PATH,
        uniqueCookies: validation.cookieCount,
        cookieNames: validation.cookieNames.join(", "),
        hasPSID: validation.hasPSID,
        hasSID: validation.hasSID,
      })
      return COOKIE_PATH
    }
  }

  const cookies = config.youtube.cookiesEnv
  if (cookies && cookies.length > MIN_COOKIE_LENGTH) {
    fs.writeFileSync(COOKIE_PATH, cookies, { mode: 0o600 })
    const validation = validateCookies()
    logger.info("cookie", "YouTube cookies written from env var", {
      path: COOKIE_PATH,
      uniqueCookies: validation.cookieCount,
      cookieNames: validation.cookieNames.join(", "),
      hasPSID: validation.hasPSID,
      hasSID: validation.hasSID,
    })
    return COOKIE_PATH
  }

  // Return path anyway so yt-dlp can use it after cookies are extracted later
  return COOKIE_PATH
}

export async function initBrowser() {
  return getRefresher().initBrowser()
}

export async function closeBrowser() {
  return getRefresher().closeBrowser()
}

export function getRefresherInstance(): CookieRefresherService {
  return getRefresher()
}

export function isBrowserActive(): boolean {
  return getRefresher().getBrowser() !== null
}

export async function forceResetProfile() {
  return getRefresher().forceResetProfile()
}
