import { describe, it, expect, vi } from "vitest"
import { isCookieError, withCookieRetry } from "@/domain/ports"
import { ok, err } from "@/shared/result"

describe("domain/ports", () => {
  describe("isCookieError", () => {
    it("detecta sign in to confirm", () => {
      expect(isCookieError("Sign in to confirm your age")).toBe(true)
    })

    it("detecta http error 403", () => {
      expect(isCookieError("HTTP Error 403: Forbidden")).toBe(true)
    })

    it("detecta youtube cookie", () => {
      expect(isCookieError("YouTube requires cookie authentication")).toBe(true)
    })

    it("detecta authentication required", () => {
      expect(isCookieError("Authentication required")).toBe(true)
    })

    it("no detecta errores genericos", () => {
      expect(isCookieError("Network timeout")).toBe(false)
    })

    it("no detecta errores de formato", () => {
      expect(isCookieError("Invalid URL format")).toBe(false)
    })
  })

  describe("withCookieRetry", () => {
    it("returns result on success without retry", async () => {
      const fn = vi.fn().mockResolvedValue(ok("value"))
      const refresh = vi.fn()
      const result = await withCookieRetry(fn, refresh)
      expect(result.ok).toBe(true)
      expect(refresh).not.toHaveBeenCalled()
    })

    it("retries on cookie error after successful refresh", async () => {
      const fn = vi.fn()
        .mockResolvedValueOnce(err("Sign in to confirm your age"))
        .mockResolvedValueOnce(ok("retried"))
      const refresh = vi.fn().mockResolvedValue({ success: true })
      const result = await withCookieRetry(fn, refresh)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe("retried")
      expect(fn).toHaveBeenCalledTimes(2)
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    it("does not retry on non-cookie errors", async () => {
      const fn = vi.fn().mockResolvedValue(err("Network timeout"))
      const refresh = vi.fn()
      const result = await withCookieRetry(fn, refresh)
      expect(result.ok).toBe(false)
      expect(fn).toHaveBeenCalledTimes(1)
      expect(refresh).not.toHaveBeenCalled()
    })

    it("returns error if refresh fails", async () => {
      const fn = vi.fn().mockResolvedValue(err("Sign in to confirm"))
      const refresh = vi.fn().mockResolvedValue({ success: false })
      const result = await withCookieRetry(fn, refresh)
      expect(result.ok).toBe(false)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("does not retry twice", async () => {
      const fn = vi.fn().mockResolvedValue(err("Sign in to confirm"))
      const refresh = vi.fn().mockResolvedValue({ success: true })
      const result = await withCookieRetry(fn, refresh)
      expect(result.ok).toBe(false)
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })
})
