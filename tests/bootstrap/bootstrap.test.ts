import { describe, it, expect, vi, beforeEach } from "vitest"

// Stand-in for every adapter/use case bootstrap wires up: any property is another stub and
// calling it returns a stub, so the whole startup runs without Discord, YouTube or Chromium
const { stubModule, browser } = vi.hoisted(() => {
  const stub = (): unknown =>
    new Proxy(() => {}, {
      // Not thenable, so `await stub()` resolves instead of hanging
      get: (_t, prop) => (prop === "then" ? undefined : stub()),
      apply: () => stub(),
    })
  const browser = {
    close: vi.fn(async () => {}),
    refresh: vi.fn(async () => ({ success: true, cookieCount: 5, timestamp: "now" })),
    extract: vi.fn(async () => ({ success: true, cookieCount: 5, timestamp: "now" })),
    setupLogin: vi.fn(),
    isActive: vi.fn(() => false),
    resetProfile: vi.fn(async () => {}),
  }
  const stubModule = (...names: string[]) => () => Object.fromEntries(names.map(n => [n, vi.fn(() => stub())]))
  return { stubModule, browser }
})

vi.mock("@/config", () => ({
  config: {
    discord: { token: "token" },
    youtube: { cookieDir: "/cookies", browserProfile: "/profile", cookieRefreshIntervalMs: 60_000 },
    lastfm: { apiKey: "" },
    groq: { apiKey: "" },
    admin: { token: "", allowedOrigins: [] },
  },
}))
vi.mock("@/infra/cookie/browser", () => ({ createPlaywrightBrowser: vi.fn(() => browser) }))
vi.mock("@/usecases/music", stubModule("createMusicUseCases"))
vi.mock("@/usecases/queue", stubModule("createQueueUseCases"))
vi.mock("@/usecases/radio", stubModule("createRadioUseCases"))
vi.mock("@/usecases/admin", stubModule("createAdminUseCases"))
vi.mock("@/usecases/cookie", stubModule("createCookieUseCases"))
vi.mock("@/usecases/search", stubModule("createSearchUseCases"))
vi.mock("@/infra/youtube/audio", stubModule("createYtDlpAudio"))
vi.mock("@/infra/youtube/search", stubModule("createYouTubeSearch"))
vi.mock("@/infra/youtube/audio-url-cache", stubModule("createAudioUrlCache"))
vi.mock("@/infra/recommendation/lastfm", stubModule("createLastFmAdapter"))
vi.mock("@/infra/recommendation/groq", stubModule("createGroqAdapter"))
vi.mock("@/infra/recommendation/radio-service", stubModule("createRadioService"))
vi.mock("@/infra/cookie/store", stubModule("createFileCookieStore"))
vi.mock("@/infra/persistence/blacklist", stubModule("createJsonBlacklist"))
vi.mock("@/infra/discord/voice", stubModule("createDiscordVoice", "createDiscordPlayer"))
vi.mock("@/infra/discord/guilds", stubModule("createDiscordGuildAdapter"))
vi.mock("@/infra/discord/messages", stubModule("createDiscordNotifier", "createQueueMessageStore"))
vi.mock("@/infra/http/admin-server", stubModule("createAdminServer"))
vi.mock("@/infra/discord/bot", stubModule("createBot"))
vi.mock("@/infra/ui/queue-display", stubModule("createQueueDisplay"))
vi.mock("@/shared/logger", stubModule("createLogger"))
vi.mock("@/bootstrap/process-handlers", stubModule("setupProcessHandlers"))
vi.mock("@/bootstrap/cookie-setup", stubModule("initCookieSystem"))

import { bootstrap } from "@/bootstrap"

describe("bootstrap", () => {
  beforeEach(() => { vi.clearAllMocks() })

  // Regression: every deploy wiped /profile, logging the Google session out, so the scheduled
  // refresh failed hours later with "sin SID/PSID" and a manual VNC login was needed each time
  it("does not wipe the browser profile on startup", async () => {
    await bootstrap()
    expect(browser.resetProfile).not.toHaveBeenCalled()
  })
})
