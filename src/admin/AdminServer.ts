import http from "http"
import httpProxy from "http-proxy"
import fs from "fs"
import path from "path"
import { logger } from "@/utils/logger"
import { getRefresherInstance, validateCookies, refreshCookies, extractCookies, setScheduler, initBrowser, closeBrowser, isBrowserActive, forceResetProfile, deleteCookies } from "@/cookies/CookieManager"
import { CookieScheduler } from "@/cookies/CookieScheduler"
import { config } from "@/config"
import { getBotClient } from "@/core/client"
import { guildManager } from "@/music/GuildManager"
import { isDeployMode, enableDeployMode, disableDeployMode } from "@/admin/DeployGuard"
import { blacklistStore } from "@/admin/BlacklistStore"

const ADMIN_PAGE = fs.readFileSync(path.join(__dirname, "admin-page.html"), "utf-8")

const NOVNC_DIR = "/usr/share/novnc"
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".oga": "audio/ogg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
}

const ACCESS_DENIED_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Access Denied</title><style>body{font-family:system-ui,sans-serif;background:#0f0f0f;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.container{text-align:center}h1{font-size:2rem;margin-bottom:.5rem;color:#f25757}p{color:#888}</style></head><body><div class="container"><h1>403 \u2014 Access Denied</h1><p>Valid authentication required.</p></div></body></html>`

let adminServer: http.Server | null = null
let isSettingUp = false
let vncProxy: httpProxy | null = null
let vncActive = false
let scheduler: CookieScheduler | null = null

export function setSchedulerInstance(s: CookieScheduler | null) {
  scheduler = s
}

export function setVncActive(active: boolean) {
  vncActive = active
}

function isValidToken(req: http.IncomingMessage): boolean {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  const token = url.searchParams.get("token")
  return config.admin.token !== "" && token === config.admin.token
}

function isAllowedOrigin(req: http.IncomingMessage): boolean {
  const origins = config.admin.allowedOrigins
  if (origins.length === 0) return true
  const origin = req.headers.origin
  if (!origin) return false
  const allowed = origins.includes(origin)
  logger.info("admin", "Origin check", { origin, allowed, allowedOrigins: origins })
  return allowed
}

function serveNovncStatic(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  let filePath = url.pathname.replace(/^\/vnc/, "")
  if (filePath === "/" || filePath === "") filePath = "/vnc.html"
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "")
  const fullPath = path.join(NOVNC_DIR, filePath)

  logger.debug("vnc", "Serving noVNC file", {
    originalUrl: req.url,
    strippedPath: filePath,
    fullPath,
    exists: fs.existsSync(fullPath),
    novncDir: NOVNC_DIR,
  })

  if (!fullPath.startsWith(NOVNC_DIR)) {
    logger.warn("vnc", "Path traversal attempt blocked", { fullPath })
    res.writeHead(403)
    res.end("Forbidden")
    return true
  }

  try {
    if (!fs.existsSync(fullPath)) {
      logger.warn("vnc", "noVNC file not found", { fullPath })
      res.writeHead(404)
      res.end("Not found")
      return true
    }
    const ext = path.extname(fullPath)
    const contentType = MIME_TYPES[ext] || "application/octet-stream"
    const content = fs.readFileSync(fullPath)
    logger.debug("vnc", "noVNC file served", { fullPath, contentType, size: content.length })
    res.writeHead(200, { "Content-Type": contentType })
    res.end(content)
    return true
  } catch (err) {
    logger.error("vnc", "Error serving noVNC file", { fullPath, error: err instanceof Error ? err.message : String(err) })
    return false
  }
}

function buildHealthResponse(validation: ReturnType<typeof validateCookies>) {
  const now = Date.now()
  const cookieAgeMs = validation.lastModified ? now - validation.lastModified.getTime() : null
  const cookieAgeHours = cookieAgeMs ? Math.round(cookieAgeMs / (1000 * 60 * 60)) : null

  return {
    status: "ok",
    service: "charmin-charmeleon",
    cookies: {
      valid: validation.isValid,
      count: validation.cookieCount,
      hasPSID: validation.hasPSID,
      hasSID: validation.hasSID,
      lastModified: validation.lastModified?.toISOString() ?? null,
      ageHours: cookieAgeHours,
    },
    browser: {
      active: isBrowserActive(),
    },
    vnc: {
      active: vncActive,
    },
  }
}

function buildStatusResponse(validation: ReturnType<typeof validateCookies>) {
  const now = Date.now()
  const cookieAgeMs = validation.lastModified ? now - validation.lastModified.getTime() : null
  const cookieAgeHours = cookieAgeMs ? Math.round(cookieAgeMs / (1000 * 60 * 60)) : null

  return {
    cookiesValid: validation.isValid,
    cookieCount: validation.cookieCount,
    hasPSID: validation.hasPSID,
    hasSID: validation.hasSID,
    lastModified: validation.lastModified?.toISOString() ?? null,
    ageHours: cookieAgeHours,
    browserActive: isBrowserActive(),
    vncActive,
  }
}

export function startAdminServer(port: number) {
  if (adminServer) {
    logger.warn("admin", "Admin server already running")
    return
  }

  vncProxy = httpProxy.createProxyServer()
  vncProxy.on("error", (err, req, res) => {
    logger.error("vnc", "Proxy error", { error: err.message, url: req.url })
    if (res instanceof http.ServerResponse) {
      res.writeHead(502, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "VNC proxy error: " + err.message }))
    }
  })

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`)
    const path = url.pathname
    const method = req.method

    logger.debug("admin", "Incoming request", {
      method,
      path,
      search: url.search,
      host: req.headers.host,
      origin: req.headers.origin,
    })

    // Health check must be first — before origin/auth checks — so that
    // Docker/Traefik/Coolify health probes (wget, curl, etc.) never get blocked
    if (path === "/health" && method === "GET") {
      try {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(buildHealthResponse(validateCookies())))
      } catch {
        res.writeHead(500)
        res.end(JSON.stringify({ error: "health check failed" }))
      }
      return
    }

    if (!isAllowedOrigin(req)) {
      res.writeHead(403, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Origin not allowed" }))
      return
    }

    try {
      if (path.startsWith("/vnc/")) {
        if (!vncActive) {
          logger.warn("vnc", "VNC not active", { path })
          res.writeHead(503, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: "VNC not active. Start a login session first." }))
          return
        }
        // Only require token for the initial HTML page, not for static assets
        // Sub-resources (JS, CSS, images) are requested without query params
        const isHtmlRequest = path.endsWith(".html") || path === "/vnc/" || path === "/vnc"
        if (isHtmlRequest && !isValidToken(req)) {
          logger.warn("vnc", "Token validation failed for VNC HTML request", { path, query: url.search })
          res.writeHead(403, { "Content-Type": "text/html" })
          res.end(ACCESS_DENIED_HTML)
          return
        }
        logger.debug("vnc", "Handling VNC request", { path, tokenRequired: isHtmlRequest })
        serveNovncStatic(req, res)
        return
      }

      if (!isValidToken(req)) {
        res.writeHead(403, { "Content-Type": "text/html" })
        res.end(ACCESS_DENIED_HTML)
        return
      }

      if (path === "/" && method === "GET") {
        const originsStr = config.admin.allowedOrigins.length > 0
          ? config.admin.allowedOrigins.join(", ")
          : "Any (no restriction)"
        const html = ADMIN_PAGE.replace("{{ALLOWED_ORIGINS}}", originsStr)
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(html)
        return
      }

      if (path === "/api/status" && method === "GET") {
        res.writeHead(200)
        res.end(JSON.stringify(buildStatusResponse(validateCookies())))
        return
      }

      if (path === "/api/browser/start" && method === "POST") {
        if (isBrowserActive()) {
          res.writeHead(409)
          res.end(JSON.stringify({ error: "Browser already running" }))
          return
        }
        try {
          await initBrowser()
          res.writeHead(200)
          res.end(JSON.stringify({ message: "Browser started" }))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          res.writeHead(500)
          res.end(JSON.stringify({ error: msg }))
        }
        return
      }

      if (path === "/api/browser/close" && method === "POST") {
        if (!isBrowserActive()) {
          res.writeHead(400)
          res.end(JSON.stringify({ error: "No browser running" }))
          return
        }
        try {
          const result = await refreshCookies()
          await closeBrowser()
          res.writeHead(200)
          res.end(JSON.stringify({ message: "Browser closed", cookieRefresh: result }))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          res.writeHead(500)
          res.end(JSON.stringify({ error: msg }))
        }
        return
      }

      if (path === "/api/profile/reset" && method === "POST") {
        try {
          await forceResetProfile()
          res.writeHead(200)
          res.end(JSON.stringify({ message: "Profile reset — use VNC login to re-authenticate" }))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          res.writeHead(500)
          res.end(JSON.stringify({ error: msg }))
        }
        return
      }

      if (path === "/api/cookies/delete" && method === "POST") {
        try {
          await deleteCookies()
          res.writeHead(200)
          res.end(JSON.stringify({ message: "Cookies eliminadas correctamente" }))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          res.writeHead(500)
          res.end(JSON.stringify({ error: msg }))
        }
        return
      }

      if (path.startsWith("/api/")) {
        res.setHeader("Content-Type", "application/json")

        if (path === "/api/cookies/status" && method === "GET") {
          const validation = validateCookies()
          res.writeHead(200)
          res.end(JSON.stringify({
            ...validation,
            lastModified: validation.lastModified?.toISOString() ?? null,
          }))
          return
        }

        if (path === "/api/cookies/refresh" && method === "POST") {
          const result = await refreshCookies()
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (path === "/api/cookies/extract" && method === "POST") {
          const result = await extractCookies()
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (path === "/api/cookies/setup" && method === "POST") {
          if (isSettingUp) {
            res.writeHead(409)
            res.end(JSON.stringify({ error: "Setup already in progress" }))
            return
          }

          isSettingUp = true
          scheduler?.pause()
          try {
            logger.info("vnc", "Starting VNC login session")
            const refresher = getRefresherInstance()
            const result = await refresher.setupForLogin()
            vncActive = true
            logger.info("vnc", "VNC session started", { result })
            res.writeHead(200)
            res.end(JSON.stringify(result))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            logger.error("vnc", "Failed to start VNC session", { error: msg })
            scheduler?.resume()
            res.writeHead(500)
            res.end(JSON.stringify({ error: msg }))
          } finally {
            isSettingUp = false
          }
          return
        }

        if (path === "/api/cookies/setup/stop" && method === "POST") {
          if (vncActive) {
            vncActive = false
            scheduler?.resume()
            logger.info("vnc", "VNC session stopped")
            res.writeHead(200)
            res.end(JSON.stringify({ message: "VNC stopped" }))
          } else {
            logger.warn("vnc", "Attempted to stop VNC but no active session")
            res.writeHead(400)
            res.end(JSON.stringify({ error: "No active VNC session" }))
          }
          return
        }

        if (path === "/api/guilds" && method === "GET") {
          const client = getBotClient()
          const guilds: unknown[] = []

          if (client) {
            for (const guild of client.guilds.cache.values()) {
              const scheduler = guildManager.get(guild.id)
              const musicInfo: Record<string, unknown> = {
                connected: !!scheduler,
              }

              if (scheduler) {
                const currentTrack = scheduler.getCurrentTrack()
                musicInfo.voiceChannel = scheduler.getVoiceChannelName() ?? null
                musicInfo.currentTrack = currentTrack ? {
                  title: currentTrack.title,
                  url: currentTrack.url,
                  requestedBy: currentTrack.requestedBy,
                  duration: currentTrack.duration ?? null,
                  position: scheduler.getPosition(),
                } : null
                musicInfo.queueSize = scheduler.getSize()
                musicInfo.isPaused = scheduler.isPaused()
                musicInfo.autoplay = scheduler.isAutoplayEnabled()
                musicInfo.loopMode = scheduler.getLoopMode()
              }

              guilds.push({
                id: guild.id,
                name: guild.name,
                memberCount: guild.memberCount,
                blacklisted: blacklistStore.isBlacklisted(guild.id),
                music: musicInfo,
              })
            }
          }

          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({
            deployMode: isDeployMode(),
            guilds,
          }))
          return
        }

        if (path === "/api/bot/toggle" && method === "POST") {
          if (isDeployMode()) {
            disableDeployMode()
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({
              deployMode: false,
              message: "Service restored — playback enabled",
            }))
            return
          }

          enableDeployMode()

          let disconnectedCount = 0
          const sessionIds = Array.from(guildManager.getSessions().keys())
          for (const guildId of sessionIds) {
            const scheduler = guildManager.get(guildId)
            if (scheduler) {
              scheduler.destroy()
            }
            disconnectedCount++
          }

          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({
            deployMode: true,
            disconnectedGuilds: disconnectedCount,
            message: `Deploy mode enabled — ${disconnectedCount} voice channel(s) disconnected`,
          }))
          return
        }

        if (path === "/api/guild/leave" && method === "POST") {
          const guildId = url.searchParams.get("id")
          if (!guildId) {
            res.writeHead(400)
            res.end(JSON.stringify({ error: "Missing guild id" }))
            return
          }

          const client = getBotClient()
          if (!client) {
            res.writeHead(503)
            res.end(JSON.stringify({ error: "Bot not connected" }))
            return
          }

          const guild = client.guilds.cache.get(guildId)
          if (!guild) {
            res.writeHead(404)
            res.end(JSON.stringify({ error: "Guild not found" }))
            return
          }

          const scheduler = guildManager.get(guildId)
          if (scheduler) {
            scheduler.destroy()
          }

          try {
            await guild.leave()
            logger.info("admin", `Bot left guild ${guild.name} (${guildId})`)
            res.writeHead(200)
            res.end(JSON.stringify({ message: `Left guild ${guild.name}` }))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            res.writeHead(500)
            res.end(JSON.stringify({ error: msg }))
          }
          return
        }

        if (path === "/api/guild/blacklist" && method === "POST") {
          const guildId = url.searchParams.get("id")
          if (!guildId) {
            res.writeHead(400)
            res.end(JSON.stringify({ error: "Missing guild id" }))
            return
          }

          const client = getBotClient()
          let guildName = guildId

          if (client) {
            const guild = client.guilds.cache.get(guildId)
            if (guild) {
              guildName = guild.name
            }
          }

          blacklistStore.add(guildId, guildName)

          if (client) {
            const guild = client.guilds.cache.get(guildId)
            if (guild) {
              const scheduler = guildManager.get(guildId)
              if (scheduler) {
                scheduler.destroy()
              }
              try {
                await guild.leave()
              } catch (err) {
                logger.warn("admin", "Failed to leave guild after blacklist", { error: String(err) })
              }
            }
          }

          res.writeHead(200)
          res.end(JSON.stringify({ message: `Blacklisted ${guildName}` }))
          return
        }

        if (path === "/api/blacklist" && method === "GET") {
          const entries = blacklistStore.getAll()
          res.writeHead(200)
          res.end(JSON.stringify({ blacklist: entries }))
          return
        }

        if (path === "/api/blacklist/remove" && method === "POST") {
          const guildId = url.searchParams.get("id")
          if (!guildId) {
            res.writeHead(400)
            res.end(JSON.stringify({ error: "Missing guild id" }))
            return
          }

          blacklistStore.remove(guildId)
          res.writeHead(200)
          res.end(JSON.stringify({ message: "Removed from blacklist" }))
          return
        }

        logger.warn("admin", "API route not found", { path, method })
        res.writeHead(404)
        res.end(JSON.stringify({ error: "Not found" }))
        return
      }

      logger.warn("admin", "Route not found", { path, method })
      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Not found" }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error("admin", "Request failed", { path, method, error: msg })
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: msg }))
    }
  })

  server.on("upgrade", (req, socket, head) => {
    logger.debug("vnc", "WebSocket upgrade attempt", { url: req.url, origin: req.headers.origin })
    if (!isAllowedOrigin(req)) {
      logger.warn("vnc", "WebSocket upgrade rejected — origin not allowed", { origin: req.headers.origin, url: req.url })
      socket.destroy()
      return
    }
    if (!isValidToken(req)) {
      logger.warn("vnc", "WebSocket upgrade rejected — invalid token", { origin: req.headers.origin, url: req.url })
      socket.destroy()
      return
    }
    if (req.url?.startsWith("/vnc/") && vncProxy && vncActive) {
      logger.info("vnc", "Proxying WebSocket connection", { url: req.url })
      req.url = req.url.replace(/^\/vnc\//, "/")
      vncProxy.ws(req, socket, head, {
        target: "http://localhost:6080",
      })
    } else {
      logger.warn("vnc", "WebSocket upgrade rejected", { url: req.url, vncActive, hasProxy: !!vncProxy })
      socket.destroy()
    }
  })

  server.listen(port, "0.0.0.0", () => {
    const origins = config.admin.allowedOrigins
    logger.info("admin", `Admin server started on port ${port}`, {
      allowedOrigins: origins.length > 0 ? origins : "any",
    })
  })

  server.on("error", (err) => {
    logger.error("admin", "Admin server error", { error: err.message })
  })

  adminServer = server
}

export function stopAdminServer(): Promise<void> {
  return new Promise((resolve) => {
    if (adminServer) {
      adminServer.close(() => {
        adminServer = null
        vncActive = false
        logger.info("admin", "Admin server stopped")
        resolve()
      })
    } else {
      resolve()
    }
  })
}
