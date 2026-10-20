import { describe, it, expect } from "vitest"
import { hasAuthCookies, parseCookieNames } from "@/domain/cookies"

const line = (name: string) => `.youtube.com\tTRUE\t/\tTRUE\t0\t${name}\tvalue`

describe("domain/cookies", () => {
  it("parses unique cookie names from a Netscape file", () => {
    const content = ["# Netscape HTTP Cookie File", "", line("SID"), line("VISITOR_INFO1_LIVE"), line("SID")].join("\n")
    expect(parseCookieNames(content)).toEqual(["SID", "VISITOR_INFO1_LIVE"])
  })

  it("detects a Google session by SID-family or PSID cookies", () => {
    expect(hasAuthCookies(["SID"])).toBe(true)
    expect(hasAuthCookies(["__Secure-3PSID"])).toBe(true)
    expect(hasAuthCookies(["HSID", "SSID"])).toBe(true)
  })

  it("treats anonymous cookies as no session", () => {
    expect(hasAuthCookies(["VISITOR_INFO1_LIVE", "YSC", "PREF"])).toBe(false)
    expect(hasAuthCookies([])).toBe(false)
  })
})
