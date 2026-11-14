import { describe, it, expect, vi, afterEach } from "vitest"
import { createYtDlpAudio } from "@/infra/youtube/audio"
import type { CookieStorePort, LoggerPort } from "@/domain/ports"

vi.mock("@/infra/youtube/ytdlp", () => ({
  buildYtDlpArgs: vi.fn((base: string[]) => [...base]),
  spawnYtDlp: vi.fn(),
  USER_AGENT: "test-agent",
  AUDIO_FORMAT: "bestaudio",
}))

import { spawnYtDlp } from "@/infra/youtube/ytdlp"

const mockCookieStore = (filePath: string | null): CookieStorePort => ({
  read: () => null,
  validate: () => ({ isValid: false, cookieCount: 0, cookieNames: [], hasPSID: false, hasSID: false, lastModified: null }),
  delete: () => {},
  filePath: () => filePath,
})

const mockLogger: LoggerPort = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  event: () => {},
}

const okResult = { code: 0, stdout: "https://audio.example/stream\n", stderr: "" }
const reloadError = {
  code: -1,
  stdout: "",
  stderr: "ERROR: [youtube] abc123: The page needs to be reloaded.\n",
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("infra/youtube/audio getAudioUrl", () => {
  it("returns audio url on first attempt", async () => {
    vi.mocked(spawnYtDlp).mockResolvedValueOnce(okResult)
    const refresh = vi.fn().mockResolvedValue({ success: true })

    const audio = createYtDlpAudio(mockCookieStore(null), mockLogger, refresh)
    const result = await audio.getAudioUrl("https://youtube.com/watch?v=abc123")

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe("https://audio.example/stream")
    expect(spawnYtDlp).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
  })

  it("refreshes cookies and retries on page-reload error", async () => {
    vi.mocked(spawnYtDlp)
      .mockResolvedValueOnce(reloadError)
      .mockResolvedValueOnce(okResult)
    const refresh = vi.fn().mockResolvedValue({ success: true })

    const audio = createYtDlpAudio(mockCookieStore(null), mockLogger, refresh)
    const result = await audio.getAudioUrl("https://youtube.com/watch?v=abc123")

    expect(result.ok).toBe(true)
    expect(spawnYtDlp).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("retries and returns last error when failure persists", async () => {
    vi.mocked(spawnYtDlp).mockResolvedValue({ code: -1, stdout: "", stderr: "Network timeout\n" })

    const audio = createYtDlpAudio(mockCookieStore(null), mockLogger)
    const result = await audio.getAudioUrl("https://youtube.com/watch?v=abc123")

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("Network timeout")
    expect(spawnYtDlp).toHaveBeenCalledTimes(3)
  })

  it("does not retry when the video is unavailable", async () => {
    vi.mocked(spawnYtDlp).mockResolvedValue({ code: 1, stdout: "", stderr: "ERROR: [youtube] abc123: Video unavailable\n" })

    const audio = createYtDlpAudio(mockCookieStore(null), mockLogger)
    const result = await audio.createResource("guild1", "https://youtube.com/watch?v=abc123")

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("Video unavailable")
    expect(spawnYtDlp).toHaveBeenCalledTimes(1)
  })

  it("returns the error when yt-dlp cannot resolve the audio URL", async () => {
    vi.mocked(spawnYtDlp).mockResolvedValue({ code: -1, stdout: "", stderr: "Network timeout\n" })

    const audio = createYtDlpAudio(mockCookieStore(null), mockLogger)
    const result = await audio.createResource("guild1", "https://youtube.com/watch?v=abc123")

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("Network timeout")
  })

  // Each refresh launches Chromium: once per track is enough to know whether it helps
  it("refreshes the cookies at most once while retrying the same track", async () => {
    vi.mocked(spawnYtDlp).mockResolvedValue(reloadError)
    const refresh = vi.fn().mockResolvedValue({ success: true })

    const audio = createYtDlpAudio(mockCookieStore(null), mockLogger, refresh)
    const result = await audio.getAudioUrl("https://youtube.com/watch?v=abc123")

    expect(result.ok).toBe(false)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
