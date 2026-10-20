import { describe, it, expect, vi } from "vitest"
import { initCookieSystem } from "@/bootstrap/cookie-setup"
import { ok } from "@/shared/result"
import type { CookieStorePort, BrowserPort, LoggerPort } from "@/domain/ports"

const mockLogger: LoggerPort = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn(),
}

const mockCookieStore = (overrides: Partial<CookieStorePort> = {}): CookieStorePort => ({
  read: () => null,
  validate: () => ({ isValid: false, cookieCount: 0, cookieNames: [], hasPSID: false, hasSID: false, lastModified: null }),
  delete: () => {},
  filePath: () => "/cookies/youtube-cookies.txt",
  ...overrides,
})

const mockBrowser = (overrides: Partial<BrowserPort> = {}): BrowserPort => ({
  close: async () => {},
  refresh: async () => ({ success: true, cookieCount: 5, timestamp: "now" }),
  extract: async () => ({ success: true, cookieCount: 5, timestamp: "now" }),
  setupLogin: async () => ok({ url: "", instructions: "" }),
  isActive: () => false,
  resetProfile: async () => {},
  ...overrides,
})

describe("bootstrap/cookie-setup", () => {
  const VALID = { isValid: true, cookieCount: 10, cookieNames: ["SID"], hasPSID: true, hasSID: true, lastModified: new Date() }
  const INVALID = { isValid: false, cookieCount: 0, cookieNames: [], hasPSID: false, hasSID: false, lastModified: null }

  const init = (store: CookieStorePort, browser: BrowserPort) =>
    initCookieSystem({ cookieStore: store, browser, cookieRefreshIntervalMs: 30000, logger: mockLogger })

  it("starts the scheduler even when there is no cookie file yet", async () => {
    const refresh = vi.fn().mockResolvedValue({ success: false, error: "not logged in", timestamp: "now" })
    const scheduler = await init(mockCookieStore({ filePath: () => null }), mockBrowser({ refresh }))
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(scheduler).toBeDefined()
    scheduler.stop()
  })

  it("does not refresh at startup when cookies are valid", async () => {
    const refresh = vi.fn()
    const scheduler = await init(mockCookieStore({ validate: () => VALID }), mockBrowser({ refresh }))
    expect(refresh).not.toHaveBeenCalled()
    scheduler.stop()
  })

  it("renews invalid cookies before the bot starts", async () => {
    let valid = false
    const refresh = vi.fn(async () => { valid = true; return { success: true, cookieCount: 5, timestamp: "now" } })
    const scheduler = await init(mockCookieStore({ validate: () => (valid ? VALID : INVALID) }), mockBrowser({ refresh }))
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(valid).toBe(true)
    scheduler.stop()
  })

  it("keeps a running scheduler when the startup renewal fails (it retries later)", async () => {
    const refresh = vi.fn().mockResolvedValue({ success: false, error: "fail", timestamp: "now" })
    const scheduler = await init(mockCookieStore(), mockBrowser({ refresh }))
    expect(scheduler).toBeDefined()
    scheduler.stop()
  })
})
