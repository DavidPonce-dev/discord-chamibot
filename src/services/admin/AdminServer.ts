import http from "http"
import { logger } from "@/utils/logger"
import { getRefresherInstance, validateCookies, refreshCookies } from "@/services/cookie/CookieManager"
import { CookieRefresherService } from "@/services/cookie/CookieRefresherService"

let adminServer: http.Server | null = null
let isSettingUp = false

export function startAdminServer(port: number) {
  if (adminServer) {
    logger.warn("admin", "Admin server already running")
    return
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`)
    const path = url.pathname
    const method = req.method

    res.setHeader("Content-Type", "application/json")

    try {
      if (path === "/health" && method === "GET") {
        res.writeHead(200)
        res.end(JSON.stringify({ status: "ok", service: "charmin-charmeleon" }))
        return
      }

      if (path === "/cookies/status" && method === "GET") {
        const validation = validateCookies()
        res.writeHead(200)
        res.end(JSON.stringify({
          ...validation,
          lastModified: validation.lastModified?.toISOString() ?? null,
        }))
        return
      }

      if (path === "/cookies/refresh" && method === "POST") {
        const result = await refreshCookies()
        res.writeHead(200)
        res.end(JSON.stringify(result))
        return
      }

      if (path === "/cookies/setup" && method === "POST") {
        if (isSettingUp) {
          res.writeHead(409)
          res.end(JSON.stringify({ error: "Setup already in progress" }))
          return
        }

        isSettingUp = true
        try {
          const refresher = getRefresherInstance()
          const result = await refresher.setupForLogin()
          res.writeHead(200)
          res.end(JSON.stringify(result))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          res.writeHead(500)
          res.end(JSON.stringify({ error: msg }))
        } finally {
          isSettingUp = false
        }
        return
      }

      res.writeHead(404)
      res.end(JSON.stringify({ error: "Not found" }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error("admin", "Request failed", { path, method, error: msg })
      res.writeHead(500)
      res.end(JSON.stringify({ error: msg }))
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
        logger.info("admin", "Admin server stopped")
        resolve()
      })
    } else {
      resolve()
    }
  })
}
