import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import type * as ChildProcess from "child_process"
import type { LoggerPort } from "@/domain/ports"

type FakeCookie = { name: string; value: string; domain: string; path: string; secure: boolean; expires: number; httpOnly: boolean }

// Cookies the fake browser profile "has" in each test
let profileCookies: FakeCookie[] = []

// Like Chromium, the fake persistent context keeps its cookies inside the profile directory,
// so they survive a restart and are lost when the profile is wiped
const PROFILE_COOKIES = "fake-cookies.json"
const readProfileCookies = (profileDir: string): FakeCookie[] => {
  try { return JSON.parse(fs.readFileSync(path.join(profileDir, PROFILE_COOKIES), "utf-8")) } catch { return profileCookies }
}

// resetProfile runs `pkill -9 -f chrome`: never let it touch real processes
vi.mock("child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof ChildProcess>()),
  execSync: vi.fn(),
}))

vi.mock("playwright", () => ({
  chromium: {
    launchPersistentContext: vi.fn(async (profileDir: string) => ({
      on: vi.fn(),
      close: vi.fn(async () => {}),
      cookies: vi.fn(async () => readProfileCookies(profileDir)),
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

describe("infra/cookie/browser profile locks", () => {
  let dir: string
  let profileDir: string
  const LOCKS = ["SingletonLock", "SingletonCookie", "SingletonSocket"]
  const create = () => createPlaywrightBrowser({ cookieDir: dir, cookieFile: path.join(dir, "youtube-cookies.txt"), browserProfile: profileDir }, logger)
  const canSymlink = (() => {
    const probe = path.join(os.tmpdir(), `symlink-probe-${process.pid}`)
    try {
      fs.symlinkSync("target", probe)
      fs.rmSync(probe, { force: true })
      return true
    } catch {
      return false
    }
  })()
  // lstat, unlike existsSync, sees a symlink whose target is gone
  const lockExists = (name: string): boolean => {
    try { fs.lstatSync(path.join(profileDir, name)); return true } catch { return false }
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cookies-"))
    profileDir = path.join(dir, "profile")
    profileCookies = [cookie("SID"), cookie("YSC")]
  })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  // Nothing else uses the profile once this process has no browser open, so a leftover lock is
  // always stale: waiting for it to age only delayed every refresh
  it("removes leftover locks right away instead of waiting for them to age", async () => {
    const browser = create()
    for (const name of LOCKS) fs.writeFileSync(path.join(profileDir, name), "")

    const result = await browser.refresh()

    expect(result.success).toBe(true)
    expect(LOCKS.filter(lockExists)).toEqual([])
  }, 2_000)

  // Chromium's real locks are symlinks to "<hostname>-<pid>", which dangle after an unclean exit:
  // a lock left by the previous container makes Chromium refuse to open the profile
  it.skipIf(!canSymlink)("removes the dangling symlink locks left by a previous container", async () => {
    const browser = create()
    for (const name of LOCKS) fs.symlinkSync("old-container-123", path.join(profileDir, name))

    const result = await browser.refresh()

    expect(result.success).toBe(true)
    expect(LOCKS.filter(lockExists)).toEqual([])
  })
})

describe("infra/cookie/browser session across restarts", () => {
  let dir: string
  let cookieFile: string
  let profileDir: string
  // Each call is a fresh process start (deploy/restart) on the same persistent volumes
  const start = () => createPlaywrightBrowser({ cookieDir: dir, cookieFile, browserProfile: profileDir }, logger)
  // Simulates the VNC login from the admin panel: Google stores the session in the profile
  const loginInProfile = () => {
    fs.writeFileSync(path.join(profileDir, PROFILE_COOKIES), JSON.stringify([cookie("SID"), cookie("__Secure-3PSID"), cookie("YSC")]))
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cookies-"))
    cookieFile = path.join(dir, "youtube-cookies.txt")
    profileDir = path.join(dir, "profile")
    // A profile with no stored session only yields anonymous cookies
    profileCookies = [cookie("YSC"), cookie("VISITOR_INFO1_LIVE")]
  })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it("keeps the Google session after a restart, so the scheduled refresh succeeds", async () => {
    start()
    loginInProfile()
    expect((await start().refresh()).success).toBe(true)

    const result = await start().refresh()
    expect(result).toMatchObject({ success: true, isLoggedIn: true })
    expect(fs.readFileSync(cookieFile, "utf-8")).toContain("\tSID\t")
  })

  it("reproduces the prod error: wiping the profile on startup logs Google out", async () => {
    start()
    loginInProfile()
    expect((await start().refresh()).success).toBe(true)

    // What bootstrap used to do on every start ("Reiniciando perfil de navegador (deploy limpio)")
    const restarted = start()
    await restarted.resetProfile()

    const result = await restarted.refresh()
    expect(result.success).toBe(false)
    expect(result.isLoggedIn).toBe(false)
    expect(result.error).toContain("sin SID/PSID")
    // The previous session file survives, which is why playback kept working until it expired
    expect(fs.readFileSync(cookieFile, "utf-8")).toContain("\tSID\t")
  })
})
