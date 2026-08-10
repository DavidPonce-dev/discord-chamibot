import fs from "fs"
import path from "path"
import type { CookieStorePort, LoggerPort } from "../../domain/ports"
import type { CookieValidation } from "../../domain/types"

const MIN_COOKIE_LENGTH = 10

export const createFileCookieStore = (
  cookieDir: string,
  cookieFileName: string,
  logger: LoggerPort,
): CookieStorePort => {
  const cookiePath = path.join(cookieDir, cookieFileName)

  fs.mkdirSync(cookieDir, { recursive: true, mode: 0o700 })

  const read = (): string | null => {
    try {
      if (fs.existsSync(cookiePath)) {
        return fs.readFileSync(cookiePath, "utf-8")
      }
    } catch (e: unknown) {
      logger.error("cookie", "Failed to read cookie file", { error: String(e) })
    }
    return null
  }

  const write = (content: string): void => {
    try {
      fs.writeFileSync(cookiePath, content, { mode: 0o600 })
    } catch (e: unknown) {
      logger.error("cookie", "Failed to write cookie file", { error: String(e) })
    }
  }

  const validate = (): CookieValidation => {
    const result: CookieValidation = {
      isValid: false,
      cookieCount: 0,
      cookieNames: [],
      hasPSID: false,
      hasSID: false,
      lastModified: null,
    }

    if (!fs.existsSync(cookiePath)) return result

    const content = read()
    if (!content || content.length <= MIN_COOKIE_LENGTH) return result

    const lines = content.split("\n").filter((l: string) => l.trim() && !l.startsWith("#"))
    const cookieNames = lines.map((l: string) => l.split("\t")[5]).filter(Boolean)
    const uniqueNames = [...new Set(cookieNames)]

    const hasAuthCookies = uniqueNames.some((n: string) => n === "SID" || n === "HSID" || n === "SSID" || n.includes("PSID"))

    return {
      isValid: hasAuthCookies,
      cookieCount: uniqueNames.length,
      cookieNames: uniqueNames,
      hasPSID: uniqueNames.some((n: string) => n.includes("PSID")),
      hasSID: uniqueNames.some((n: string) => n === "SID" || n === "HSID" || n === "SSID"),
      lastModified: fs.statSync(cookiePath).mtime,
    }
  }

  const deleteCookie = (): void => {
    try {
      if (fs.existsSync(cookiePath)) {
        fs.unlinkSync(cookiePath)
        logger.info("cookie", "Cookie file deleted")
      }
    } catch (e: unknown) {
      logger.error("cookie", "Failed to delete cookie file", { error: String(e) })
    }
  }

  const filePath = (): string | null =>
    fs.existsSync(cookiePath) ? cookiePath : null

  return { read, write, validate, delete: deleteCookie, filePath } as const
}
