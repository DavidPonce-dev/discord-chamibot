import fs from "fs"
import path from "path"
import { logger } from "@/utils/logger"
import { COOKIE_REFRESH_TIMEOUT_MS } from "@/config/timeouts"
import { config } from "@/config"

const COOKIE_DIR = config.youtube.cookieDir
const COOKIE_PATH = path.join(COOKIE_DIR, "youtube-cookies.txt")
const MIN_COOKIE_LENGTH = 10
const REFRESHER_URL = config.services.cookieRefresherUrl

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

export function isCookieError(error: string): boolean {
  const lower = error.toLowerCase()
  return COOKIE_ERROR_PATTERNS.some((pattern) => new RegExp(pattern).test(lower))
}

export async function refreshCookies(): Promise<{ success: boolean; cookieCount?: number }> {
  logger.info("cookies", "Refreshing YouTube cookies via refresher service")

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), COOKIE_REFRESH_TIMEOUT_MS)

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

export function getCookieFile(): string | null {
  return cookieFile
}

export function setCookieFile(filePath: string | null) {
  cookieFile = filePath
}

export function setupCookies(): string | null {
  // Ensure cookie directory exists
  if (!fs.existsSync(COOKIE_DIR)) {
    fs.mkdirSync(COOKIE_DIR, { recursive: true, mode: 0o700 })
    logger.info("cookie", "Cookie directory created", { path: COOKIE_DIR })
  }

  // Option 1: File already exists (Docker volume or previous run)
  if (fs.existsSync(COOKIE_PATH)) {
    const content = fs.readFileSync(COOKIE_PATH, "utf-8")
    if (content.length > MIN_COOKIE_LENGTH) {
      const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#"))
      const cookieNames = lines.map((l) => l.split("\t")[5]).filter(Boolean)
      const uniqueNames = [...new Set(cookieNames)]

      logger.info("cookie", "YouTube cookies found (mounted file)", {
        path: COOKIE_PATH,
        totalLines: content.split("\n").length,
        dataLines: lines.length,
        uniqueCookies: uniqueNames.length,
        cookieNames: uniqueNames.join(", "),
        hasPSID: uniqueNames.some((n) => n.includes("PSID")),
        hasSID: uniqueNames.some((n) => n === "SID" || n === "HSID" || n === "SSID"),
        sizeBytes: content.length,
      })
      return COOKIE_PATH
    }
  }

  // Option 2: Write from env var
  const cookies = config.youtube.cookiesEnv
  if (cookies && cookies.length > MIN_COOKIE_LENGTH) {
    fs.writeFileSync(COOKIE_PATH, cookies, { mode: 0o600 })
    const lines = cookies.split("\n").filter((l) => l.trim() && !l.startsWith("#"))
    const cookieNames = lines.map((l) => l.split("\t")[5]).filter(Boolean)
    const uniqueNames = [...new Set(cookieNames)]

    logger.info("cookie", "YouTube cookies written from env var", {
      path: COOKIE_PATH,
      totalLines: cookies.split("\n").length,
      dataLines: lines.length,
      uniqueCookies: uniqueNames.length,
      cookieNames: uniqueNames.join(", "),
      hasPSID: uniqueNames.some((n) => n.includes("PSID")),
      hasSID: uniqueNames.some((n) => n === "SID" || n === "HSID" || n === "SSID"),
      sizeBytes: cookies.length,
    })
    return COOKIE_PATH
  }

  return null
}
