import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import { chromium, BrowserContext } from "playwright"
import { logger } from "@/utils/logger"
import { CookieRefreshResult, CookieValidationResult, CookieRefresherConfig } from "./types"

const MIN_COOKIE_LENGTH = 10

export class CookieRefresherService {
  private config: CookieRefresherConfig
  private isLaunching = false

  constructor(config: CookieRefresherConfig) {
    this.config = config
    this.ensureDirectories()
  }

  private ensureDirectories() {
    fs.mkdirSync(this.config.cookieDir, { recursive: true, mode: 0o700 })
    fs.mkdirSync(this.config.browserProfile, { recursive: true, mode: 0o700 })
  }

  private async cleanupBeforeLaunch() {
    if (this.isLaunching) {
      throw new Error("Chromium launch already in progress")
    }
    this.isLaunching = true

    try {
      execSync("pkill -f chromium || true", { stdio: "ignore" })
      logger.debug("cookies", "Existing Chromium processes killed")
    } catch {
      logger.debug("cookies", "No Chromium processes to kill")
    }

    const lockFiles = ["SingletonLock", "SingletonCookie", "SingletonSocket"]
    for (const file of lockFiles) {
      const lockPath = path.join(this.config.browserProfile, file)
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath)
        logger.debug("cookies", `Removed lock file: ${file}`)
      }
    }
  }

  private releaseLaunchLock() {
    this.isLaunching = false
  }

  async refreshCookies(): Promise<CookieRefreshResult> {
    logger.info("cookies", "Refreshing YouTube cookies via Playwright")

    await this.cleanupBeforeLaunch()

    let context: BrowserContext | null = null
    try {
      context = await chromium.launchPersistentContext(this.config.browserProfile, {
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-setuid-sandbox",
        ],
      })

      const page = await context.newPage()
      await page.goto("https://www.youtube.com", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })

      await page.waitForTimeout(3000)

      const isLoggedIn = await this.checkLoggedIn(page)
      if (!isLoggedIn) {
        logger.warn("cookies", "No active YouTube session detected in browser profile")
      }

      const cookies = await context.cookies()
      const ytCookies = this.filterYouTubeCookies(cookies).map((c) => ({
        ...c,
        path: c.path || "/",
        secure: c.secure || false,
        expires: c.expires || 0,
        httpOnly: c.httpOnly || false,
      }))

      if (ytCookies.length === 0) {
        throw new Error("No YouTube cookies found in browser profile")
      }

      const netscapeContent = this.cookiesToNetscape(ytCookies)
      fs.writeFileSync(this.config.cookieFile, netscapeContent, { mode: 0o600 })

      logger.info("cookies", "Cookies refreshed successfully", {
        count: ytCookies.length,
        names: ytCookies.slice(0, 10).map((c) => c.name),
      })

      return {
        success: true,
        cookieCount: ytCookies.length,
        cookieNames: ytCookies.map((c) => c.name),
        isLoggedIn,
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error("cookies", "Failed to refresh cookies", { error: msg })
      return {
        success: false,
        error: msg,
        timestamp: new Date().toISOString(),
      }
    } finally {
      if (context) {
        await context.close().catch(() => {})
      }
      this.releaseLaunchLock()
    }
  }

  async setupForLogin(): Promise<{ url: string; instructions: string }> {
    logger.info("cookies", "Starting interactive login session via VNC")

    await this.cleanupBeforeLaunch()

    const display = ":99"
    const vncPort = process.env.VNC_PORT || "6080"

    if (!this.isXvfbAvailable()) {
      this.releaseLaunchLock()
      throw new Error(
        "Xvfb is not available. Install it for interactive login: apt-get install xvfb x11vnc novnc websockify"
      )
    }

    const xvfb = this.startXvfb(display)
    const vncProcesses = this.startVNC(display, vncPort)

    try {
      const context = await chromium.launchPersistentContext(this.config.browserProfile, {
        headless: false,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-setuid-sandbox",
        ],
        env: { ...process.env, DISPLAY: display },
      })

      const page = await context.newPage()
      await page.goto("https://accounts.google.com", {
        waitUntil: "domcontentloaded",
      })

      context.on("close", async () => {
        logger.info("cookies", "Browser closed, extracting cookies...")
        try {
          await this.refreshCookies()
        } catch (err) {
          logger.error("cookies", "Failed to extract cookies after setup", {
            error: err instanceof Error ? err.message : String(err),
          })
        } finally {
          this.stopVNC(vncProcesses)
          this.stopXvfb(xvfb)
        }
      })

      const vncUrl = `http://localhost:${vncPort}/vnc.html?autoconnect=true`
      return {
        url: vncUrl,
        instructions: `Open ${vncUrl} in your browser, login to YouTube, then close the browser to save cookies.`,
      }
    } catch (err) {
      this.stopVNC(vncProcesses)
      this.stopXvfb(xvfb)
      this.releaseLaunchLock()
      throw err
    }
  }

  validateCookies(): CookieValidationResult {
    const result: CookieValidationResult = {
      isValid: false,
      cookieCount: 0,
      cookieNames: [],
      hasPSID: false,
      hasSID: false,
      lastModified: null,
    }

    if (!fs.existsSync(this.config.cookieFile)) {
      return result
    }

    const content = fs.readFileSync(this.config.cookieFile, "utf-8")
    if (content.length <= MIN_COOKIE_LENGTH) {
      return result
    }

    const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#"))
    const cookieNames = lines.map((l) => l.split("\t")[5]).filter(Boolean)
    const uniqueNames = [...new Set(cookieNames)]

    result.isValid = true
    result.cookieCount = uniqueNames.length
    result.cookieNames = uniqueNames
    result.hasPSID = uniqueNames.some((n) => n.includes("PSID"))
    result.hasSID = uniqueNames.some((n) => n === "SID" || n === "HSID" || n === "SSID")
    result.lastModified = fs.statSync(this.config.cookieFile).mtime

    return result
  }

  private filterYouTubeCookies(
    cookies: import("playwright").Cookie[]
  ): import("playwright").Cookie[] {
    return cookies.filter(
      (c) =>
        c.domain.includes("youtube.com") ||
        c.domain.includes(".google.com") ||
        c.domain.includes(".youtube.com")
    )
  }

  private cookiesToNetscape(
    cookies: Array<{
      name: string
      value: string
      domain: string
      path: string
      secure: boolean
      expires: number
      httpOnly: boolean
    }>
  ): string {
    const lines = ["# Netscape HTTP Cookie File", "# Generated by CookieRefresherService", ""]

    for (const c of cookies) {
      const domain = c.domain.startsWith(".") ? c.domain : `.${c.domain}`
      const includeSubdomains = c.domain.startsWith(".") ? "TRUE" : "FALSE"
      const secure = c.secure ? "TRUE" : "FALSE"
      const expiry = c.expires ? Math.floor(c.expires) : 0
      const httpOnly = c.httpOnly ? "TRUE" : "FALSE"

      lines.push(
        `${domain}\t${includeSubdomains}\t${c.path}\t${secure}\t${expiry}\t${c.name}\t${c.value}`
      )
    }

    return lines.join("\n") + "\n"
  }

  private async checkLoggedIn(page: import("playwright").Page): Promise<boolean> {
    try {
      const isLoggedIn = await page.evaluate(() => {
        const avatar = document.querySelector("yt-img-shadow#avatar")
        return !!avatar
      })
      return isLoggedIn
    } catch {
      return false
    }
  }

  private isXvfbAvailable(): boolean {
    try {
      execSync("which Xvfb", { stdio: "ignore" })
      return true
    } catch {
      return false
    }
  }

  private startXvfb(display: string): ReturnType<typeof import("child_process").spawn> {
    const { spawn } = require("child_process")
    const xvfb = spawn("Xvfb", [display, "-screen", "0", "1280x720x24"], {
      stdio: "ignore",
      env: { ...process.env, DISPLAY: display },
    })
    logger.debug("cookies", "Xvfb started", { display })
    return xvfb
  }

  private stopXvfb(
    xvfb: ReturnType<typeof import("child_process").spawn>
  ) {
    if (xvfb && !xvfb.killed) {
      xvfb.kill("SIGTERM")
      logger.debug("cookies", "Xvfb stopped")
    }
  }

  private startVNC(
    display: string,
    port: string
  ): Array<ReturnType<typeof import("child_process").spawn>> {
    const { spawn } = require("child_process")
    const processes: ReturnType<typeof spawn>[] = []

    const x11vnc = spawn(
      "x11vnc",
      ["-display", display, "-forever", "-nopw", "-listen", "0.0.0.0", "-rfbport", "5900", "-shared"],
      { stdio: "ignore", env: { ...process.env, DISPLAY: display } }
    )
    processes.push(x11vnc)

    const websockify = spawn(
      "websockify",
      ["--web", "/usr/share/novnc", port, "localhost:5900"],
      { stdio: "ignore", env: { ...process.env, DISPLAY: display } }
    )
    processes.push(websockify)

    logger.debug("cookies", "VNC services started", { display, port })
    return processes
  }

  private stopVNC(processes: Array<ReturnType<typeof import("child_process").spawn>>) {
    for (const proc of processes) {
      if (proc && !proc.killed) {
        proc.kill("SIGTERM")
      }
    }
    logger.debug("cookies", "VNC services stopped")
  }
}
