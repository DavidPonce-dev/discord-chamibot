import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import type { LoggerPort } from "@/domain/ports"

// Cookies the fake browser profile "has" in each test
let profileCookies: { name: string; value: string; domain: string; path: string; secure: boolean; expires: number; httpOnly: boolean }[] = []

vi.mock("playwright", () => ({
  chromium: {
    launchPersistentContext: vi.fn(async () => ({
      on: vi.fn(),
      close: vi.fn(async () => {}),
      cookies: vi.fn(async () => profileCookies),
      newPage: vi.fn(async () => ({
        goto: vi.fn(async () => {}),
        waitForTimeout: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
      })),
    })),
  },
}))

import { createPlaywrightBrowser } from "@/infra/cookie/browser"

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }
const cookie = (name: string) => ({ name, value: "v", domain: ".youtube.com", path: "/", secure: true, expires: 0, httpOnly: false })
const VALID_FILE = ".youtube.com\tTRUE\t/\tTRUE\t0\tSID\tgood-session\n"

describe("infra/cookie/browser refresh", () => {
  let dir: string
  let cookieFile: string
  const create = () => createPlaywrightBrowser({ cookieDir: dir, cookieFile, browserProfile: path.join(dir, "profile") }, logger)

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cookies-"))
    cookieFile = path.join(dir, "youtube-cookies.txt")
  })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it("writes the cookies when the profile has a Google session", async () => {
    profileCookies = [cookie("SID"), cookie("__Secure-3PSID"), cookie("YSC")]
    const result = await create().refresh()
    expect(result).toMatchObject({ success: true, isLoggedIn: true, cookieCount: 3 })
    expect(fs.readFileSync(cookieFile, "utf-8")).toContain("\tSID\t")
  })

  it("does not overwrite a working session with anonymous cookies from a logged-out profile", async () => {
    fs.writeFileSync(cookieFile, VALID_FILE)
    profileCookies = [cookie("YSC"), cookie("VISITOR_INFO1_LIVE")]
    const result = await create().refresh()
    expect(result.success).toBe(false)
    expect(result.isLoggedIn).toBe(false)
    expect(result.error).toContain("VNC")
    expect(fs.readFileSync(cookieFile, "utf-8")).toBe(VALID_FILE)
  })

  it("still saves anonymous cookies when there was no session to protect, but reports failure", async () => {
    profileCookies = [cookie("YSC")]
    const result = await create().refresh()
    expect(result.success).toBe(false)
    expect(fs.readFileSync(cookieFile, "utf-8")).toContain("\tYSC\t")
  })
})
