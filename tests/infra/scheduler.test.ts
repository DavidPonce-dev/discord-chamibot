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
