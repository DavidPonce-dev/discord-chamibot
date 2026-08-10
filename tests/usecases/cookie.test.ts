import { describe, it, expect, vi } from "vitest"
import { createCookieUseCases } from "@/usecases/cookie"
import { createMockPorts } from "../usecases/mock-ports"

describe("usecases/cookie", () => {
  it("refresh delegates to browser.refresh", async () => {
    const refresh = vi.fn().mockResolvedValue({ success: true, cookieCount: 5, timestamp: "now" })
    const ports = createMockPorts({ browser: { ...createMockPorts().browser, refresh } })
    const cookie = createCookieUseCases(ports)
    const result = await cookie.refresh()
    expect(refresh).toHaveBeenCalled()
    expect(result.success).toBe(true)
  })

  it("extract delegates to browser.extract", async () => {
    const extract = vi.fn().mockResolvedValue({ success: true, cookieCount: 3, timestamp: "now" })
    const ports = createMockPorts({ browser: { ...createMockPorts().browser, extract } })
    const cookie = createCookieUseCases(ports)
    const result = await cookie.extract()
    expect(extract).toHaveBeenCalled()
    expect(result.success).toBe(true)
  })

  it("validate delegates to cookieStore.validate", () => {
    const validate = vi.fn().mockReturnValue({ isValid: true, cookieCount: 10, cookieNames: ["SID"], hasPSID: true, hasSID: true, lastModified: null })
    const ports = createMockPorts({ cookieStore: { ...createMockPorts().cookieStore, validate } })
    const cookie = createCookieUseCases(ports)
    const result = cookie.validate()
    expect(result.isValid).toBe(true)
    expect(result.cookieCount).toBe(10)
  })

  it("setupLogin delegates to browser.setupLogin", async () => {
    const setupLogin = vi.fn().mockResolvedValue({ ok: true, value: { url: "http://localhost:6080", instructions: "Sign in" } })
    const ports = createMockPorts({ browser: { ...createMockPorts().browser, setupLogin } })
    const cookie = createCookieUseCases(ports)
    const result = await cookie.setupLogin()
    expect(result.ok).toBe(true)
  })

  it("delete returns not_found when no cookie file", async () => {
    const ports = createMockPorts({
      cookieStore: { ...createMockPorts().cookieStore, filePath: () => null },
    })
    const cookie = createCookieUseCases(ports)
    const result = await cookie.delete()
    expect(result.ok).toBe(false)
  })

  it("delete succeeds when cookie file exists", async () => {
    const deleteCookie = vi.fn()
    const ports = createMockPorts({
      cookieStore: { ...createMockPorts().cookieStore, filePath: () => "/cookies/file.txt", delete: deleteCookie },
    })
    const cookie = createCookieUseCases(ports)
    const result = await cookie.delete()
    expect(result.ok).toBe(true)
    expect(deleteCookie).toHaveBeenCalled()
  })

  it("isBrowserActive delegates to browser.isActive", () => {
    const isActive = vi.fn().mockReturnValue(true)
    const ports = createMockPorts({ browser: { ...createMockPorts().browser, isActive } })
    const cookie = createCookieUseCases(ports)
    expect(cookie.isBrowserActive()).toBe(true)
  })

  it("resetProfile delegates to browser.resetProfile", async () => {
    const resetProfile = vi.fn().mockResolvedValue(undefined)
    const ports = createMockPorts({ browser: { ...createMockPorts().browser, resetProfile } })
    const cookie = createCookieUseCases(ports)
    await cookie.resetProfile()
    expect(resetProfile).toHaveBeenCalled()
  })

  it("close delegates to browser.close", async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const ports = createMockPorts({ browser: { ...createMockPorts().browser, close } })
    const cookie = createCookieUseCases(ports)
    await cookie.close()
    expect(close).toHaveBeenCalled()
  })
})
