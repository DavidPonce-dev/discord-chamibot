import http from "http"
import httpProxy from "http-proxy"
import fs from "fs"
import path from "path"
import { logger } from "@/utils/logger"
import { getRefresherInstance, validateCookies, refreshCookies, extractCookies, setScheduler, initBrowser, closeBrowser, isBrowserActive, forceResetProfile } from "@/services/cookie/CookieManager"
import { CookieScheduler } from "@/services/cookie/CookieScheduler"
import { config } from "@/config"

const ADMIN_PAGE = fs.readFileSync(path.join(__dirname, "admin-page.html"), "utf-8")

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

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`)
    const path = url.pathname
    const method = req.method

    try {
      if (path === "/health" && method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(buildHealthResponse(validateCookies())))
        return
      }

      if (path.startsWith("/vnc/")) {
        if (vncProxy && vncActive) {
          req.url = req.url!.replace(/^\/vnc\//, "/")
          vncProxy.web(req, res, {
            target: "http://localhost:6080",
            ws: true,
          })
          return
        }
        res.writeHead(503, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "VNC not active. Start a login session first." }))
        return
      }

      if (!isValidToken(req)) {
        res.writeHead(403, { "Content-Type": "text/html" })
        res.end(ACCESS_DENIED_HTML)
        return
      }

      if (path === "/" && method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(ADMIN_PAGE)
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
            const refresher = getRefresherInstance()
            const result = await refresher.setupForLogin()
            vncActive = true
            res.writeHead(200)
            res.end(JSON.stringify(result))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
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
            res.writeHead(200)
            res.end(JSON.stringify({ message: "VNC stopped" }))
          } else {
            res.writeHead(400)
            res.end(JSON.stringify({ error: "No active VNC session" }))
          }
          return
        }

        res.writeHead(404)
        res.end(JSON.stringify({ error: "Not found" }))
        return
      }

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
    if (req.url?.startsWith("/vnc/") && vncProxy && vncActive) {
      req.url = req.url.replace(/^\/vnc\//, "/")
      vncProxy.ws(req, socket, head, {
        target: "http://localhost:6080",
      })
    } else {
      socket.destroy()
    }
  })

  server.listen(port, () => {
    logger.info("admin", `Admin server started on port ${port}`)
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
