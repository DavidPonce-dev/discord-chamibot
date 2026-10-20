import fs from "fs"
import path from "path"
import type { CookieStorePort, LoggerPort } from "../../domain/ports"
import type { CookieValidation } from "../../domain/types"
import { parseCookieNames, hasAuthCookies, isSidCookie, isPsidCookie } from "../../domain/cookies"

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

    const uniqueNames = parseCookieNames(content)

    return {
      isValid: hasAuthCookies(uniqueNames),
      cookieCount: uniqueNames.length,
      cookieNames: uniqueNames,
      hasPSID: uniqueNames.some(isPsidCookie),
      hasSID: uniqueNames.some(isSidCookie),
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

  return { read, validate, delete: deleteCookie, filePath } as const
}
