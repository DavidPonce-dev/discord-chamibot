import fs from "fs"
import path from "path"
import os from "os"

export function setupCookies(): string | null {
  const cookies = process.env.YOUTUBE_COOKIES
  if (!cookies || cookies.length < 10) {
    return null
  }

  const cookiePath = path.join(os.tmpdir(), "youtube-cookies.txt")
  fs.writeFileSync(cookiePath, cookies, { mode: 0o600 })

  return cookiePath
}
