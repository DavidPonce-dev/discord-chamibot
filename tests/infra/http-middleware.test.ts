import { describe, it, expect } from "vitest"
import { isValidToken, isAllowedOrigin } from "@/infra/http/middleware"
import type http from "http"

const makeReq = (url: string, origin?: string): http.IncomingMessage => {
  const headers: Record<string, string> = { host: "localhost:3002" }
  if (origin) headers.origin = origin
  return { url, headers } as http.IncomingMessage
}

describe("infra/http/middleware", () => {
  describe("isValidToken", () => {
    it("returns true when token matches", () => {
      const req = makeReq("/api/status?token=secret123")
      expect(isValidToken(req, "secret123")).toBe(true)
    })

    it("returns false when token mismatches", () => {
      const req = makeReq("/api/status?token=wrong")
      expect(isValidToken(req, "secret123")).toBe(false)
    })

    it("returns false when no token in URL", () => {
      const req = makeReq("/api/status")
      expect(isValidToken(req, "secret123")).toBe(false)
    })

    it("returns false when adminToken is empty", () => {
      const req = makeReq("/api/status?token=anything")
      expect(isValidToken(req, "")).toBe(false)
    })
  })

  describe("isAllowedOrigin", () => {
    it("returns true when allowedOrigins is empty", () => {
      const req = makeReq("/", "https://evil.com")
      expect(isAllowedOrigin(req, [])).toBe(true)
    })

    it("returns true when origin is in list", () => {
      const req = makeReq("/", "https://my-site.com")
      expect(isAllowedOrigin(req, ["https://my-site.com"])).toBe(true)
    })

    it("returns false when origin is not in list", () => {
      const req = makeReq("/", "https://evil.com")
      expect(isAllowedOrigin(req, ["https://my-site.com"])).toBe(false)
    })

    it("returns false when no origin header", () => {
      const req = makeReq("/")
      expect(isAllowedOrigin(req, ["https://my-site.com"])).toBe(false)
    })
  })
})
