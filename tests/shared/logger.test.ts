import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createLogger } from "@/shared/logger"

describe("shared/logger", () => {
  let log: ReturnType<typeof vi.spyOn>
  let warn: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => {})
    warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    error = vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks() })

  const logAll = (logger: ReturnType<typeof createLogger>) => {
    logger.debug("svc", "debug")
    logger.info("svc", "info")
    logger.event("svc", "event")
    logger.warn("svc", "warn")
    logger.error("svc", "error")
  }

  it("prints every level by default", () => {
    logAll(createLogger())
    expect(log).toHaveBeenCalledTimes(3)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
  })

  it("drops debug output at the info level", () => {
    logAll(createLogger("info"))
    expect(log).toHaveBeenCalledTimes(2)
    expect(log.mock.calls.every(([line]) => !String(line).includes("debug"))).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("prints only warnings and errors at the warn level", () => {
    logAll(createLogger("warn"))
    expect(log).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
  })

  it("falls back to printing everything for an unknown level", () => {
    logAll(createLogger("verbose"))
    expect(log).toHaveBeenCalledTimes(3)
  })
})
