import fs from "fs"
import path from "path"
import { execSync, spawn, ChildProcess } from "child_process"
import { chromium, BrowserContext } from "playwright"
import { logger } from "@/utils/logger"
import { CookieRefreshResult, CookieValidationResult, CookieRefresherConfig } from "./types"

const MIN_COOKIE_LENGTH = 10

export class CookieRefresherService {
  private config: CookieRefresherConfig
  private browser: BrowserContext | null = null
  private isInitializing = false

  constructor(config: CookieRefresherConfig) {
    this.config = config
    this.ensureDirectories()
  }

  private ensureDirectories() {
    fs.mkdirSync(this.config.cookieDir, { recursive: true, mode: 0o700 })
    fs.mkdirSync(this.config.browserProfile, { recursive: true, mode: 0o700 })
  }

  private async resetProfile() {
    try {
      execSync("pkill -9 -f chrome || true", { stdio: "ignore" })
      logger.debug("cookies", "Chromium processes killed")
    } catch {}

    // Wait for profile to be free before cleaning
    await this.waitForProfileFree()

    // Empty directory contents instead of removing the mount point
    // This is necessary because /profile is a Docker volume mount
    // and fs.rmSync on a mount point will fail with EBUSY
    if (fs.existsSync(this.config.browserProfile)) {
      const entries = fs.readdirSync(this.config.browserProfile)
      for (const entry of entries) {
        const fullPath = path.join(this.config.browserProfile, entry)
        await this.forceRemoveWithRetry(fullPath)
      }
      logger.debug("cookies", "Profile directory emptied")
    }
  }

  private async forceRemoveWithRetry(fullPath: string, maxAttempts = 5) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        fs.rmSync(fullPath, { recursive: true, force: true })
        return
      } catch (err) {
        if (i === maxAttempts - 1) {
          logger.warn("cookies", `Could not remove after retries: ${path.basename(fullPath)}`)
          return
        }
        await new Promise((r) => setTimeout(r, 500 * (i + 1)))
      }
    }
  }

  async initBrowser() {
    if (this.browser) {
      logger.debug("cookies", "Browser already initialized")
      return
    }
    if (this.isInitializing) {
      logger.debug("cookies", "Browser initialization in progress, waiting...")
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 500))
      }
      return
    }

    this.isInitializing = true
    try {
      const chromiumAvailable = await this.checkChromiumAvailable()
      if (!chromiumAvailable) {
        throw new Error(
          "Chromium binary not found. Make sure Playwright and Chromium are installed. " +
          "Run: npx playwright install chromium"
        )
      }

      await this.waitForProfileFree()

      logger.info("cookies", "Initializing persistent Chromium browser (preserving profile)")
      this.browser = await chromium.launchPersistentContext(this.config.browserProfile, {
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-features=ProcessSingleton",
        ],
      })

      this.browser.on("close", () => {
        logger.warn("cookies", "Browser closed unexpectedly")
        this.browser = null
      })

      logger.info("cookies", "Chromium browser initialized and ready")
    } finally {
      this.isInitializing = false
    }
  }

  async forceResetProfile() {
    if (this.browser) {
      await this.closeBrowser()
      await this.waitForProfileFree()
    }
    await this.resetProfile()
    logger.info("cookies", "Profile force reset — browser will need re-initialization")
  }

  private async checkChromiumAvailable(): Promise<boolean> {
    try {
      const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
      await browser.close()
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error("cookies", "Chromium not available", { error: msg })
      return false
    }
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close().catch(() => {})
      this.browser = null
      logger.info("cookies", "Chromium browser closed")
    }
  }

  getBrowser(): BrowserContext | null {
    return this.browser
  }

  async refreshCookies(): Promise<CookieRefreshResult> {
    logger.info("cookies", "Refreshing YouTube cookies via Playwright")

    if (!this.browser) {
      logger.warn("cookies", "Browser not available, re-initializing (preserving profile)")
      try {
        await this.initBrowser()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { success: false, error: "Failed to initialize browser: " + msg, timestamp: new Date().toISOString() }
      }
    }

    if (!this.browser) {
      return { success: false, error: "Failed to initialize browser", timestamp: new Date().toISOString() }
    }

    try {
      const page = await this.browser.newPage()
      await page.goto("https://www.youtube.com", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })

      await page.waitForTimeout(3000)

      const isLoggedIn = await this.checkLoggedIn(page)
      if (!isLoggedIn) {
        logger.warn("cookies", "No active YouTube session detected in browser profile")
      }

      const cookies = await this.browser.cookies()
      const ytCookies = this.filterYouTubeCookies(cookies).map((c) => ({
        ...c,
        path: c.path || "/",
        secure: c.secure || false,
        expires: c.expires || 0,
        httpOnly: c.httpOnly || false,
      }))

      await page.close()

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

      if (msg.includes("closed") || msg.includes("crashed") || msg.includes("Target page")) {
        logger.warn("cookies", "Browser died during refresh, marking as null for auto-recovery")
        this.browser = null
      }

      return {
        success: false,
        error: msg,
        timestamp: new Date().toISOString(),
      }
    }
  }

  private async waitForProfileFree(timeoutMs = 10000): Promise<void> {
    const lockFiles = ["SingletonLock", "SingletonCookie", "SingletonSocket"]
    const start = Date.now()

    while (Date.now() - start < timeoutMs) {
      const hasLocks = lockFiles.some((file) =>
        fs.existsSync(path.join(this.config.browserProfile, file))
      )

      if (!hasLocks) {
        logger.debug("cookies", "Profile released after", { elapsedMs: Date.now() - start })
        return
      }

      // Clean up stale lock files older than 5 seconds
      for (const file of lockFiles) {
        const lockPath = path.join(this.config.browserProfile, file)
        try {
          const stat = fs.statSync(lockPath)
          if (Date.now() - stat.mtimeMs > 5000) {
            fs.unlinkSync(lockPath)
            logger.debug("cookies", `Cleaned stale lock file: ${file}`)
          }
        } catch {}
      }

      await new Promise((r) => setTimeout(r, 500))
    }

    // Force cleanup after timeout
    for (const file of lockFiles) {
      const lockPath = path.join(this.config.browserProfile, file)
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath)
        logger.debug("cookies", `Force removed lock file: ${file}`)
      }
    }
  }

  async extractCookies(): Promise<CookieRefreshResult> {
    logger.info("cookies", "Extracting cookies from open browser")

    if (!this.browser) {
      return { success: false, error: "Browser not running", timestamp: new Date().toISOString() }
    }

    try {
      const cookies = await this.browser.cookies()
      const ytCookies = this.filterYouTubeCookies(cookies).map((c) => ({
        ...c,
        path: c.path || "/",
        secure: c.secure || false,
        expires: c.expires || 0,
        httpOnly: c.httpOnly || false,
      }))

      if (ytCookies.length === 0) {
        throw new Error("No YouTube cookies found in browser")
      }

      const netscapeContent = this.cookiesToNetscape(ytCookies)
      fs.writeFileSync(this.config.cookieFile, netscapeContent, { mode: 0o600 })

      logger.info("cookies", "Cookies extracted successfully", {
        count: ytCookies.length,
        names: ytCookies.slice(0, 10).map((c) => c.name),
      })

      return {
        success: true,
        cookieCount: ytCookies.length,
        cookieNames: ytCookies.map((c) => c.name),
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error("cookies", "Failed to extract cookies", { error: msg })
      return {
        success: false,
        error: msg,
        timestamp: new Date().toISOString(),
      }
    }
  }

  async setupForLogin(): Promise<{ url: string; instructions: string }> {
    logger.info("cookies", "Starting interactive login session via VNC")

    const display = ":99"
    const vncPort = process.env.VNC_PORT || "6080"

    if (!this.isXvfbAvailable()) {
      throw new Error(
        "Xvfb is not available. Install it for interactive login: apt-get install xvfb x11vnc novnc websockify"
      )
    }

    // Close existing browser before launching with VNC
    if (this.browser) {
      await this.closeBrowser()
      await this.waitForProfileFree()
    }

    const xvfb = this.startXvfb(display)
    const vncProcesses = this.startVNC(display, vncPort)

    try {
      this.browser = await chromium.launchPersistentContext(this.config.browserProfile, {
        headless: false,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-features=ProcessSingleton",
        ],
        env: { ...process.env, DISPLAY: display },
      })

      const page = await this.browser.newPage()
      await page.goto("https://www.youtube.com", {
        waitUntil: "domcontentloaded",
      })

      this.browser.on("close", () => {
        logger.info("cookies", "Browser closed unexpectedly during VNC session")
        this.browser = null
        this.stopVNC(vncProcesses)
        this.stopXvfb(xvfb)
      })

      const vncUrl = `http://localhost:${vncPort}/vnc.html?autoconnect=true`
      return {
        url: vncUrl,
        instructions: `Open ${vncUrl} in your browser. If you're not logged in, sign in to YouTube. Then use the "Extract Cookies" button in the admin panel.`,
      }
    } catch (err) {
      this.stopVNC(vncProcesses)
      this.stopXvfb(xvfb)
      this.browser = null
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

    const hasAuthCookies = uniqueNames.some((n) => n === "SID" || n === "HSID" || n === "SSID" || n.includes("PSID"))

    result.isValid = hasAuthCookies
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
      const includeSubdomains = "TRUE"
      const secure = c.secure ? "TRUE" : "FALSE"
      const expiry = c.expires && c.expires > 0 ? Math.floor(c.expires) : 0
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

  private startXvfb(display: string): ChildProcess {
    const xvfb = spawn("Xvfb", [display, "-screen", "0", "1280x720x24"], {
      stdio: "ignore",
      env: { ...process.env, DISPLAY: display },
    })
    logger.debug("cookies", "Xvfb started", { display })
    return xvfb
  }

  private stopXvfb(xvfb: ChildProcess) {
    if (xvfb && !xvfb.killed) {
      xvfb.kill("SIGTERM")
      logger.debug("cookies", "Xvfb stopped")
    }
  }

  private startVNC(
    display: string,
    port: string
  ): ChildProcess[] {
    const processes: ChildProcess[] = []

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

  private stopVNC(processes: ChildProcess[]) {
    for (const proc of processes) {
      if (proc && !proc.killed) {
        proc.kill("SIGTERM")
      }
    }
    logger.debug("cookies", "VNC services stopped")
  }
}
