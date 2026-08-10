import { describe, it, expect, vi } from "vitest"
import { createRoutes } from "@/infra/http/routes"
import type { MusicUseCases } from "@/usecases/music"
import type { AdminUseCases } from "@/usecases/admin"
import type { CookieUseCases } from "@/usecases/cookie"
import type { LoggerPort } from "@/domain/ports"
import type http from "http"

const mockLogger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }

const createMockMusic = (): MusicUseCases => ({
  play: vi.fn(), skip: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), seek: vi.fn(),
  getSession: vi.fn().mockReturnValue(null),
  getSessions: vi.fn().mockReturnValue(new Map()),
  startPlayback: vi.fn(), setSession: vi.fn(),
  destroySession: vi.fn(),
  isDeployMode: vi.fn().mockReturnValue(false),
  setDeployMode: vi.fn(),
})

const createMockAdmin = (): AdminUseCases => ({
  isDeployMode: vi.fn().mockReturnValue(false),
  toggleDeployMode: vi.fn().mockReturnValue({ deployMode: true, disconnectedGuilds: 0 }),
  leaveGuild: vi.fn().mockResolvedValue({ ok: true, value: "g1" }),
  blacklistGuild: vi.fn().mockResolvedValue({ ok: true, value: "Server" }),
  removeBlacklist: vi.fn().mockReturnValue({ ok: true, value: "g1" }),
  getGuildsStatus: vi.fn().mockReturnValue([]),
  getBlacklist: vi.fn().mockReturnValue([]),
})

const createMockCookie = (): CookieUseCases => ({
  refresh: vi.fn().mockResolvedValue({ success: true, cookieCount: 5, timestamp: "now" }),
  extract: vi.fn().mockResolvedValue({ success: true, timestamp: "now" }),
  validate: vi.fn().mockReturnValue({ isValid: true, cookieCount: 10, cookieNames: ["SID"], hasPSID: true, hasSID: true, lastModified: null }),
  setupLogin: vi.fn().mockResolvedValue({ ok: true, value: { url: "", instructions: "" } }),
  delete: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  resetProfile: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  isBrowserActive: vi.fn().mockReturnValue(true),
})

const createMockRes = (): http.ServerResponse & { _data: any; _status: number | null; _raw: string } => {
  const res: any = {
    writeHead: vi.fn(),
    end: vi.fn(),
    _data: null,
    _raw: "",
    _status: null,
  }
  res.writeHead.mockImplementation((status: number) => { res._status = status })
  res.end.mockImplementation((data: string) => {
    res._raw = data
    try { res._data = JSON.parse(data) } catch { res._data = data }
  })
  return res
}

const createMockReq = (url = "/", method = "GET"): http.IncomingMessage => ({
  url,
  method,
  headers: { host: "localhost:3002" },
} as http.IncomingMessage)

describe("infra/http/routes", () => {
  const setup = () => {
    const music = createMockMusic()
    const admin = createMockAdmin()
    const cookie = createMockCookie()
    const blacklist = { isBlacklisted: vi.fn().mockReturnValue(false), getAll: vi.fn().mockReturnValue([]), add: vi.fn(), remove: vi.fn().mockReturnValue(true) }
    const { handlers, vncState } = createRoutes(
      { music, admin, cookie, blacklist, logger: mockLogger },
      "<html>{{ALLOWED_ORIGINS}}</html>",
      [],
      null,
    )
    return { handlers, vncState, music, admin, cookie, blacklist }
  }

  it("GET / returns admin page", async () => {
    const { handlers } = setup()
    const res = createMockRes()
    await handlers["GET /"](createMockReq(), res, new URL("http://localhost/"))
    expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "text/html" })
    expect(res._raw).toContain("html")
  })

  it("GET /api/status returns cookie and browser info", async () => {
    const { handlers, cookie } = setup()
    const res = createMockRes()
    await handlers["GET /api/status"](createMockReq(), res, new URL("http://localhost/api/status"))
    expect(res._data.cookiesValid).toBe(true)
    expect(res._data.browserActive).toBe(true)
    expect(cookie.validate).toHaveBeenCalled()
  })

  it("POST /api/cookies/refresh triggers refresh", async () => {
    const { handlers, cookie } = setup()
    const res = createMockRes()
    await handlers["POST /api/cookies/refresh"](createMockReq(), res, new URL("http://localhost/api/cookies/refresh"))
    expect(cookie.refresh).toHaveBeenCalled()
  })

  it("POST /api/browser/close extracts then closes the browser", async () => {
    const { handlers, cookie } = setup()
    const res = createMockRes()
    await handlers["POST /api/browser/close"](createMockReq(), res, new URL("http://localhost/api/browser/close"))
    expect(cookie.extract).toHaveBeenCalled()
    expect(cookie.close).toHaveBeenCalled()
    expect(res._data.message).toBe("Browser closed")
  })

  it("GET /api/guilds returns guild list", async () => {
    const { handlers, admin } = setup()
    const res = createMockRes()
    await handlers["GET /api/guilds"](createMockReq(), res, new URL("http://localhost/api/guilds"))
    expect(admin.getGuildsStatus).toHaveBeenCalled()
  })

  it("POST /api/bot/toggle toggles deploy mode", async () => {
    const { handlers, admin, music } = setup()
    const res = createMockRes()
    await handlers["POST /api/bot/toggle"](createMockReq(), res, new URL("http://localhost/api/bot/toggle"))
    expect(admin.toggleDeployMode).toHaveBeenCalled()
    expect(music.setDeployMode).toHaveBeenCalledWith(true)
  })

  it("POST /api/guild/leave requires id param", async () => {
    const { handlers } = setup()
    const res = createMockRes()
    await handlers["POST /api/guild/leave"](createMockReq("/api/guild/leave"), res, new URL("http://localhost/api/guild/leave"))
    expect(res._status).toBe(400)
  })

  it("POST /api/guild/leave with id succeeds", async () => {
    const { handlers, admin } = setup()
    const res = createMockRes()
    await handlers["POST /api/guild/leave"](createMockReq("/api/guild/leave?id=g1"), res, new URL("http://localhost/api/guild/leave?id=g1"))
    expect(admin.leaveGuild).toHaveBeenCalledWith("g1", expect.anything())
  })

  it("GET /api/blacklist returns list", async () => {
    const { handlers, admin } = setup()
    const res = createMockRes()
    await handlers["GET /api/blacklist"](createMockReq(), res, new URL("http://localhost/api/blacklist"))
    expect(admin.getBlacklist).toHaveBeenCalled()
  })
})
