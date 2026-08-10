import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createCookieScheduler } from "@/infra/cookie/scheduler"
import type { BrowserPort, LoggerPort } from "@/domain/ports"

const mockLogger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }

describe("infra/cookie/scheduler", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const mockBrowser = (overrides: Partial<BrowserPort> = {}): BrowserPort => ({
    init: vi.fn().mockResolvedValue({ ok: true }),
    close: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue({ success: true, cookieCount: 5, timestamp: "now" }),
    extract: vi.fn().mockResolvedValue({ success: true, timestamp: "now" }),
    setupLogin: vi.fn().mockResolvedValue({ ok: true }),
    isActive: vi.fn().mockReturnValue(true),
    resetProfile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })

  it("starts and stops", () => {
    const scheduler = createCookieScheduler(mockBrowser(), 60000, mockLogger)
    expect(scheduler.running).toBe(false)
    scheduler.start()
    expect(scheduler.running).toBe(true)
    scheduler.stop()
    expect(scheduler.running).toBe(false)
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

  it("refreshNow triggers immediate refresh", async () => {
    const refresh = vi.fn().mockResolvedValue({ success: true, cookieCount: 3, timestamp: "now" })
    const scheduler = createCookieScheduler(mockBrowser({ refresh }), 60000, mockLogger)
    const result = await scheduler.refreshNow()
    expect(result).toBe(true)
    expect(refresh).toHaveBeenCalled()
  })

  it("pause and resume", () => {
    const scheduler = createCookieScheduler(mockBrowser(), 1000, mockLogger)
    scheduler.start()
    scheduler.pause()
    scheduler.resume()
    expect(scheduler.running).toBe(true)
    scheduler.stop()
  })

  it("health check re-initializes browser when not active", async () => {
    const init = vi.fn().mockResolvedValue({ ok: true })
    const isActive = vi.fn().mockReturnValue(false)
    const scheduler = createCookieScheduler(mockBrowser({ init, isActive }), 60000, mockLogger)
    scheduler.start()
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(init).toHaveBeenCalled()
    scheduler.stop()
  })
})
