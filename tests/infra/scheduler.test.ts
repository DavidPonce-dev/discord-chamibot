import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createCookieScheduler } from "@/infra/cookie/scheduler"
import type { BrowserPort, LoggerPort } from "@/domain/ports"

const mockLogger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }

describe("infra/cookie/scheduler", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const mockBrowser = (overrides: Partial<BrowserPort> = {}): BrowserPort => ({
    close: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue({ success: true, cookieCount: 5, timestamp: "now" }),
    extract: vi.fn().mockResolvedValue({ success: true, timestamp: "now" }),
    setupLogin: vi.fn().mockResolvedValue({ ok: true }),
    isActive: vi.fn().mockReturnValue(true),
    resetProfile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })

  it("does not refresh before start or after stop", async () => {
    const refresh = vi.fn().mockResolvedValue({ success: true, cookieCount: 5, timestamp: "now" })
    const scheduler = createCookieScheduler(mockBrowser({ refresh }), 1000, mockLogger)
    await vi.advanceTimersByTimeAsync(3000)
    expect(refresh).not.toHaveBeenCalled()
    scheduler.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
    scheduler.stop()
    await vi.advanceTimersByTimeAsync(3000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("runs refresh on interval", async () => {
    const refresh = vi.fn().mockResolvedValue({ success: true, cookieCount: 5, timestamp: "now" })
    const scheduler = createCookieScheduler(mockBrowser({ refresh }), 1000, mockLogger)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).toHaveBeenCalled()
    scheduler.stop()
  })

  it("prevents concurrent refreshes", async () => {
    let resolveRefresh: (() => void) | null = null
    const refresh = vi.fn().mockImplementation(() => new Promise<{ success: boolean; timestamp: string }>(resolve => { resolveRefresh = () => resolve({ success: true, timestamp: "now" }) }))
    const scheduler = createCookieScheduler(mockBrowser({ refresh }), 1000, mockLogger)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
    resolveRefresh!()
    scheduler.stop()
  })

  it("pause stops refreshes and resume restarts them", async () => {
    const refresh = vi.fn().mockResolvedValue({ success: true, cookieCount: 5, timestamp: "now" })
    const scheduler = createCookieScheduler(mockBrowser({ refresh }), 1000, mockLogger)
    scheduler.start()
    scheduler.pause()
    await vi.advanceTimersByTimeAsync(3000)
    expect(refresh).not.toHaveBeenCalled()
    scheduler.resume()
    await vi.advanceTimersByTimeAsync(1000)
    expect(refresh).toHaveBeenCalledTimes(1)
    scheduler.stop()
  })

  describe("session watchdog (SID/PSID)", () => {
    const MIN = 60_000
    const VALID = { isValid: true, cookieCount: 10, cookieNames: ["SID"], hasPSID: true, hasSID: true, lastModified: null }
    const INVALID = { isValid: false, cookieCount: 0, cookieNames: [], hasPSID: false, hasSID: false, lastModified: null }
    // Periodic refresh far away (12h) so only the watchdog acts in these tests
    const create = (browser: BrowserPort, validate: () => typeof VALID | typeof INVALID) =>
      createCookieScheduler(browser, 12 * 60 * MIN, mockLogger, { validate, checkIntervalMs: 10 * MIN, maxBackoffMs: 40 * MIN })

    it("renews the cookies as soon as the session is lost, without anyone using the bot", async () => {
      let valid = true
      const refresh = vi.fn(async () => { valid = true; return { success: true, cookieCount: 5, timestamp: "now" } })
      const scheduler = create(mockBrowser({ refresh }), () => (valid ? VALID : INVALID))
      scheduler.start()

      await vi.advanceTimersByTimeAsync(10 * MIN)
      expect(refresh).not.toHaveBeenCalled()

      valid = false
      await vi.advanceTimersByTimeAsync(10 * MIN)
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(valid).toBe(true)
      scheduler.stop()
    })

    it("backs off between failed recoveries (logged-out profile) instead of relaunching every check", async () => {
      const refresh = vi.fn().mockResolvedValue({ success: false, error: "not logged in", timestamp: "now" })
      const scheduler = create(mockBrowser({ refresh }), () => INVALID)
      scheduler.start()

      await vi.advanceTimersByTimeAsync(10 * MIN) // attempt 1, next in 10 min
      expect(refresh).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(10 * MIN) // attempt 2, next in 20 min
      expect(refresh).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(10 * MIN) // waiting
      expect(refresh).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(10 * MIN) // attempt 3, next in 40 min (max)
      expect(refresh).toHaveBeenCalledTimes(3)
      await vi.advanceTimersByTimeAsync(30 * MIN)
      expect(refresh).toHaveBeenCalledTimes(3)
      await vi.advanceTimersByTimeAsync(10 * MIN) // attempt 4, still capped at 40 min
      expect(refresh).toHaveBeenCalledTimes(4)
      scheduler.stop()
    })

    it("retries right away after resume (e.g. a manual VNC login)", async () => {
      const refresh = vi.fn().mockResolvedValue({ success: false, error: "not logged in", timestamp: "now" })
      const scheduler = create(mockBrowser({ refresh }), () => INVALID)
      scheduler.start()
      await vi.advanceTimersByTimeAsync(20 * MIN) // 2 attempts, backoff now 20 min
      expect(refresh).toHaveBeenCalledTimes(2)

      scheduler.pause()
      scheduler.resume()
      await vi.advanceTimersByTimeAsync(10 * MIN)
      expect(refresh).toHaveBeenCalledTimes(3)
      scheduler.stop()
    })

    it("does nothing while the cookies stay valid", async () => {
      const refresh = vi.fn()
      const scheduler = create(mockBrowser({ refresh }), () => VALID)
      scheduler.start()
      await vi.advanceTimersByTimeAsync(5 * 60 * MIN)
      expect(refresh).not.toHaveBeenCalled()
      scheduler.stop()
    })
  })

  it("does not touch the browser between refreshes", async () => {
    const browser = mockBrowser()
    const scheduler = createCookieScheduler(browser, 60 * 60 * 1000, mockLogger)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    expect(browser.refresh).not.toHaveBeenCalled()
    expect(browser.isActive).not.toHaveBeenCalled()
    scheduler.stop()
  })
})
