import { describe, it, expect, vi } from "vitest"
import { initCookieSystem } from "@/bootstrap/cookie-setup"
import { ok } from "@/shared/result"
import type { CookieStorePort, BrowserPort, LoggerPort } from "@/domain/ports"

const mockLogger: LoggerPort = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn(),
}

const mockCookieStore = (overrides: Partial<CookieStorePort> = {}): CookieStorePort => ({
  read: () => null,
  write: () => {},
  validate: () => ({ isValid: false, cookieCount: 0, cookieNames: [], hasPSID: false, hasSID: false, lastModified: null }),
  delete: () => {},
  filePath: () => "/cookies/youtube-cookies.txt",
  ...overrides,
})

const mockBrowser = (overrides: Partial<BrowserPort> = {}): BrowserPort => ({
  init: async () => ok(undefined),
  close: async () => {},
  refresh: async () => ({ success: true, cookieCount: 5, timestamp: "now" }),
  extract: async () => ({ success: true, cookieCount: 5, timestamp: "now" }),
  setupLogin: async () => ok({ url: "", instructions: "" }),
  isActive: () => false,
  resetProfile: async () => {},
  ...overrides,
})

describe("bootstrap/cookie-setup", () => {
  it("returns null when no cookie path", async () => {
    const store = mockCookieStore({ filePath: () => null })
    const result = await initCookieSystem({
      cookieStore: store,
      browser: mockBrowser(),
      cookieRefreshIntervalMs: 30000,
      logger: mockLogger,
    })
    expect(result).toBeNull()
  })

  it("starts scheduler when cookies are valid", async () => {
    const store = mockCookieStore({
      validate: () => ({ isValid: true, cookieCount: 10, cookieNames: ["SID"], hasPSID: true, hasSID: true, lastModified: new Date() }),
    })
    const result = await initCookieSystem({
      cookieStore: store,
      browser: mockBrowser(),
      cookieRefreshIntervalMs: 30000,
      logger: mockLogger,
    })
    expect(result).not.toBeNull()
    result!.stop()
  })

  it("attempts refresh when cookies invalid and starts scheduler on success", async () => {
    const refresh = vi.fn().mockResolvedValue({ success: true, cookieCount: 5, timestamp: "now" })
    const result = await initCookieSystem({
      cookieStore: mockCookieStore(),
      browser: mockBrowser({ refresh }),
      cookieRefreshIntervalMs: 30000,
      logger: mockLogger,
    })
    expect(refresh).toHaveBeenCalled()
    expect(result).not.toBeNull()
    result!.stop()
  })

  it("returns null when cookies invalid and refresh fails", async () => {
    const refresh = vi.fn().mockResolvedValue({ success: false, error: "fail", timestamp: "now" })
    const result = await initCookieSystem({
      cookieStore: mockCookieStore(),
      browser: mockBrowser({ refresh }),
      cookieRefreshIntervalMs: 30000,
      logger: mockLogger,
    })
    expect(result).toBeNull()
  })
})
