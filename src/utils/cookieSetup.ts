import fs from "fs"
import path from "path"
import os from "os"
import { logger } from "./logger"

export function setupCookies(): string | null {
  const cookies = process.env.YOUTUBE_COOKIES
  if (!cookies || cookies.length < 10) {
    return null
  }

  const cookiePath = path.join(os.tmpdir(), "youtube-cookies.txt")
  fs.writeFileSync(cookiePath, cookies, { mode: 0o600 })

  const lines = cookies.split("\n").filter((l) => l.trim() && !l.startsWith("#"))
  const hasAuth = cookies.includes("__Secure-1PSID") || cookies.includes("__Secure-3PSID") || cookies.includes("SID")

  logger.info("cookie", "YouTube cookies escritas", {
    path: cookiePath,
    totalLines: cookies.split("\n").length,
    dataLines: lines.length,
    hasAuth,
    firstLine: lines[0]?.slice(0, 100),
    sizeBytes: cookies.length,
  })

  return cookiePath
}
