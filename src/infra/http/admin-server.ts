import http from "http"
import type { Socket } from "net"
import httpProxy from "http-proxy"
import fs from "fs"
import path from "path"
import type { MusicUseCases } from "../../usecases/music"
import type { AdminUseCases } from "../../usecases/admin"
import type { CookieUseCases } from "../../usecases/cookie"
import type { LoggerPort } from "../../domain/ports"
import { getErrorMessage } from "../../shared/error"
import { isValidToken, isAllowedOrigin, json, ACCESS_DENIED_HTML } from "./middleware"
import { serveNovncStatic } from "./static"
import { createRoutes } from "./routes"

type AdminDeps = Readonly<{
  music: MusicUseCases
  admin: AdminUseCases
  cookie: CookieUseCases
  blacklist: { isBlacklisted: (guildId: string) => boolean; getAll: () => readonly any[]; add: (id: string, name: string) => void; remove: (id: string) => boolean }
  logger: LoggerPort
}>

export const createAdminServer = (
  deps: AdminDeps,
  port: number,
  adminToken: string,
  allowedOrigins: readonly string[],
  cookieScheduler: { pause: () => void; resume: () => void } | null,
): { start: () => void; stop: () => Promise<void> } => {
  const { cookie, logger } = deps

  let server: http.Server | null = null
  let vncProxy: httpProxy | null = null

  let adminPageHtml = ""
  try {
    adminPageHtml = fs.readFileSync(path.join(__dirname, "admin-page.html"), "utf-8")
  } catch {
    adminPageHtml = "<html><body>Admin page not found</body></html>"
  }

  const { vncState, handlers } = createRoutes(deps, adminPageHtml, allowedOrigins, cookieScheduler)

  const start = (): void => {
    if (server) return

    vncProxy = httpProxy.createProxyServer()
    vncProxy.on("error", (err: Error, req: http.IncomingMessage, res: http.ServerResponse | Socket) => {
      logger.error("vnc", "Proxy error", { error: err.message })
      if (res instanceof http.ServerResponse) {
        json(res, 502, { error: "VNC proxy error: " + err.message })
      }
    })

    server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`)
      const pathname = url.pathname
      const method = req.method

      if (pathname === "/health" && method === "GET") {
        const validation = cookie.validate()
        json(res, 200, {
          status: "ok",
          service: "charmin-charmeleon",
          cookies: {
            valid: validation.isValid,
            count: validation.cookieCount,
            hasPSID: validation.hasPSID,
            hasSID: validation.hasSID,
            lastModified: validation.lastModified?.toISOString() ?? null,
          },
          browser: { active: cookie.isBrowserActive() },
          vnc: { active: vncState.active },
        })
        return
      }

      if (!isAllowedOrigin(req, allowedOrigins)) {
        json(res, 403, { error: "Origin not allowed" })
        return
      }

      try {
        if (pathname.startsWith("/vnc/")) {
          if (!vncState.active) {
            json(res, 503, { error: "VNC not active" })
            return
          }
          const isHtml = pathname.endsWith(".html") || pathname === "/vnc/" || pathname === "/vnc"
          if (isHtml && !isValidToken(req, adminToken)) {
            res.writeHead(403, { "Content-Type": "text/html" })
            res.end(ACCESS_DENIED_HTML)
            return
          }
          serveNovncStatic(req, res)
          return
        }

        if (!isValidToken(req, adminToken)) {
          res.writeHead(403, { "Content-Type": "text/html" })
          res.end(ACCESS_DENIED_HTML)
          return
        }

        const routeKey = `${method} ${pathname}`
        const handler = handlers[routeKey]

        if (handler) {
          await handler(req, res, url)
        } else {
          json(res, 404, { error: "Not found" })
        }
      } catch (e: unknown) {
        logger.error("admin", "Request failed", { path: pathname, method, error: getErrorMessage(e) })
        json(res, 500, { error: getErrorMessage(e) })
      }
    })

    server.on("upgrade", (req, socket, head) => {
      const origin = req.headers.origin ?? "(none)"
      const vncUrl = req.url ?? ""

      if (!isAllowedOrigin(req, allowedOrigins)) {
        logger.warn("vnc", "VNC upgrade blocked: origin not allowed", { origin, url: vncUrl })
        ;(socket as any).destroy()
        return
      }
      if (!isValidToken(req, adminToken)) {
        logger.warn("vnc", "VNC upgrade blocked: invalid token", { url: vncUrl })
        ;(socket as any).destroy()
        return
      }
      if (/^\/+vnc\//.test(vncUrl) && vncProxy && vncState.active) {
        req.url = vncUrl.replace(/^\/+vnc\//, "/")
        const vncTarget = `http://localhost:${process.env.VNC_PORT || "6080"}`
        logger.debug("vnc", "Proxying VNC websocket", { origin, target: vncTarget, path: req.url })
        vncProxy.ws(req, socket as any, head, { target: vncTarget })
      } else {
        logger.warn("vnc", "VNC upgrade blocked: route or state invalid", {
          url: vncUrl,
          vncActive: vncState.active,
          hasProxy: !!vncProxy,
        })
        ;(socket as any).destroy()
      }
    })

    server.listen(port, "0.0.0.0", () => {
      logger.info("admin", `Admin server started on port ${port}`, {
        allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins.join(", ") : "any",
      })
    })

    server.on("error", (err: Error) => {
      logger.error("admin", "Admin server error", { error: err.message })
    })
  }

  const stop = (): Promise<void> => new Promise((resolve) => {
    if (server) {
      server.close(() => { server = null; vncState.active = false; resolve() })
    } else {
      resolve()
    }
  })

  return { start, stop } as const
}
