import type http from "http"
import type { MusicUseCases } from "../../usecases/music"
import type { AdminUseCases } from "../../usecases/admin"
import type { CookieUseCases } from "../../usecases/cookie"
import type { LoggerPort } from "../../domain/ports"
import { getErrorMessage } from "../../shared/error"
import { getPosition } from "../../domain/session"
import { json } from "./middleware"

type RouteDeps = Readonly<{
  music: MusicUseCases
  admin: AdminUseCases
  cookie: CookieUseCases
  blacklist: { isBlacklisted: (guildId: string) => boolean; getAll: () => readonly any[]; add: (id: string, name: string) => void; remove: (id: string) => boolean }
  logger: LoggerPort
}>

type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => Promise<void>

export const createRoutes = (
  deps: RouteDeps,
  adminPageHtml: string,
  allowedOrigins: readonly string[],
  cookieScheduler: { pause: () => void; resume: () => void } | null,
): {
  vncState: { active: boolean }
  setupState: { busy: boolean }
  handlers: Record<string, RouteHandler>
} => {
  const { music, admin, cookie } = deps

  const vncState = { active: false }
  const setupState = { busy: false }

  const handlers: Record<string, RouteHandler> = {
    "GET /api/status": async (_req, res) => {
      const validation = cookie.validate()
      json(res, 200, {
        cookiesValid: validation.isValid,
        cookieCount: validation.cookieCount,
        hasPSID: validation.hasPSID,
        hasSID: validation.hasSID,
        lastModified: validation.lastModified?.toISOString() ?? null,
        browserActive: cookie.isBrowserActive(),
        vncActive: vncState.active,
      })
    },

    "POST /api/cookies/refresh": async (_req, res) => {
      const result = await cookie.refresh()
      json(res, 200, result)
    },

    "POST /api/cookies/extract": async (_req, res) => {
      const result = await cookie.extract()
      json(res, 200, result)
    },

    "GET /api/cookies/status": async (_req, res) => {
      const validation = cookie.validate()
      json(res, 200, { ...validation, lastModified: validation.lastModified?.toISOString() ?? null })
    },

    "POST /api/cookies/delete": async (_req, res) => {
      const result = await cookie.delete()
      json(res, result.ok ? 200 : 404, result.ok ? { message: "Cookies eliminadas" } : { error: result.error })
    },

    "POST /api/cookies/setup": async (_req, res) => {
      if (setupState.busy) { json(res, 409, { error: "Setup already in progress" }); return }
      setupState.busy = true
      cookieScheduler?.pause()
      try {
        const result = await cookie.setupLogin()
        if (result.ok) {
          vncState.active = true
          json(res, 200, result.value)
        } else {
          cookieScheduler?.resume()
          json(res, 500, { error: result.error })
        }
      } catch (e: unknown) {
        cookieScheduler?.resume()
        json(res, 500, { error: getErrorMessage(e) })
      } finally {
        setupState.busy = false
      }
    },

    "POST /api/cookies/setup/stop": async (_req, res) => {
      if (vncState.active) {
        vncState.active = false
        cookieScheduler?.resume()
        json(res, 200, { message: "VNC stopped" })
      } else {
        json(res, 400, { error: "No active VNC session" })
      }
    },

    "POST /api/profile/reset": async (_req, res) => {
      await cookie.resetProfile()
      json(res, 200, { message: "Profile reset" })
    },

    "POST /api/browser/start": async (_req, res) => {
      if (cookie.isBrowserActive()) { json(res, 409, { error: "Browser already running" }); return }
      json(res, 200, { message: "Browser start requested" })
    },

    "POST /api/browser/close": async (_req, res) => {
      const extractResult = await cookie.extract()
      await cookie.close()
      json(res, 200, { message: "Browser closed", cookieExtract: extractResult })
    },

    "GET /api/guilds": async (_req, res) => {
      const sessions = music.getSessions()
      const guilds = admin.getGuildsStatus(sessions, getPosition)
      json(res, 200, { deployMode: admin.isDeployMode(), guilds })
    },

    "POST /api/bot/toggle": async (_req, res) => {
      const sessions = music.getSessions()
      const result = admin.toggleDeployMode(sessions, music.destroySession)
      music.setDeployMode(result.deployMode)
      json(res, 200, {
        deployMode: result.deployMode,
        disconnectedGuilds: result.disconnectedGuilds,
        message: result.deployMode
          ? `Deploy mode enabled — ${result.disconnectedGuilds} voice channel(s) disconnected`
          : "Service restored — playback enabled",
      })
    },

    "POST /api/guild/leave": async (_req, res, url) => {
      const guildId = url.searchParams.get("id")
      if (!guildId) { json(res, 400, { error: "Missing guild id" }); return }
      const result = await admin.leaveGuild(guildId, music.destroySession)
      json(res, result.ok ? 200 : 404, result.ok ? { message: `Left guild ${guildId}` } : { error: result.error })
    },

    "POST /api/guild/blacklist": async (_req, res, url) => {
      const guildId = url.searchParams.get("id")
      if (!guildId) { json(res, 400, { error: "Missing guild id" }); return }
      const result = await admin.blacklistGuild(guildId, music.destroySession)
      json(res, result.ok ? 200 : 500, result.ok ? { message: `Blacklisted ${result.value}` } : { error: result.error })
    },

    "GET /api/blacklist": async (_req, res) => {
      json(res, 200, { blacklist: admin.getBlacklist() })
    },

    "POST /api/blacklist/remove": async (_req, res, url) => {
      const guildId = url.searchParams.get("id")
      if (!guildId) { json(res, 400, { error: "Missing guild id" }); return }
      const result = admin.removeBlacklist(guildId)
      json(res, result.ok ? 200 : 404, result.ok ? { message: "Removed from blacklist" } : { error: result.error })
    },

    "GET /": async (_req, res) => {
      const html = adminPageHtml.replace("{{ALLOWED_ORIGINS}}", allowedOrigins.join(", ") || "Any")
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(html)
    },
  }

  return { vncState, setupState, handlers }
}
