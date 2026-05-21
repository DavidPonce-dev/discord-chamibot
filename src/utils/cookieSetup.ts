import fs from "fs"
import path from "path"
import os from "os"
import { logger } from "./logger"

const COOKIE_PATH = path.join(os.tmpdir(), "youtube-cookies.txt")

export function setupCookies(): string | null {
  // Option 1: File already exists (Coolify persistent storage)
  if (fs.existsSync(COOKIE_PATH)) {
    const content = fs.readFileSync(COOKIE_PATH, "utf-8")
    if (content.length > 10) {
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
  const cookies = process.env.YOUTUBE_COOKIES
  if (cookies && cookies.length > 10) {
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
