import { describe, it, expect, vi, beforeEach } from "vitest"
import type { AudioResource } from "@discordjs/voice"

const mockSpawnYtDlp = vi.hoisted(() => vi.fn())
const mockBuildYtDlpArgs = vi.hoisted(() => vi.fn((args, extra = []) => [...args, ...extra]))
const mockIsCookieError = vi.hoisted(() => vi.fn())
const mockRefreshCookies = vi.hoisted(() => vi.fn())
const mockGetCookieFile = vi.hoisted(() => vi.fn().mockReturnValue(null))
const mockGetErrorMessage = vi.hoisted(() => vi.fn((e) => e instanceof Error ? e.message : String(e)))
const mockFormatTime = vi.hoisted(() => vi.fn((s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`))
const mockCreateAudioResource = vi.hoisted(() => vi.fn().mockReturnValue({} as AudioResource))
const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  event: vi.fn(),
  info: vi.fn(),
}))

const mockSpawn = vi.hoisted(() => {
  const proc = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
    killed: false,
  }
  return vi.fn().mockReturnValue(proc)
})

vi.mock("@/utils/ytdlp", () => ({
  spawnYtDlp: mockSpawnYtDlp,
  buildYtDlpArgs: mockBuildYtDlpArgs,
  USER_AGENT: "test-agent",
}))

vi.mock("@/services/cookie/CookieManager", () => ({
  isCookieError: mockIsCookieError,
  refreshCookies: mockRefreshCookies,
  getCookieFile: mockGetCookieFile,
}))

vi.mock("@/utils/error", () => ({
  getErrorMessage: mockGetErrorMessage,
}))

vi.mock("@/utils/format", () => ({
  formatTime: mockFormatTime,
}))

vi.mock("@/utils/logger", () => ({
  logger: mockLogger,
}))

vi.mock("@discordjs/voice", () => ({
  createAudioResource: mockCreateAudioResource,
  StreamType: { OggOpus: "ogg/opus" },
}))

vi.mock("child_process", () => ({
  spawn: mockSpawn,
}))

const { AudioService } = await import("@/services/audio/AudioService")

const TEST_URL = "https://youtube.com/watch?v=test123"
const AUDIO_URL = "https://rr5---sn-abc123.googlevideo.com/videoplayback?test=1"

function makeYtDlpResult(overrides: Record<string, unknown> = {}) {
  return {
    stdout: AUDIO_URL,
    stderr: "",
    code: 0,
    ...overrides,
  }
}

describe("AudioService", () => {
  let service: any

  beforeEach(() => {
    vi.clearAllMocks()
    service = new AudioService()
    mockSpawnYtDlp.mockResolvedValue(makeYtDlpResult())
    mockIsCookieError.mockReturnValue(false)
    mockCreateAudioResource.mockReturnValue({} as AudioResource)
    mockSpawn.mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        if (event === "close") setTimeout(() => cb(0), 0)
      }),
      kill: vi.fn(),
      killed: false,
    })
  })

  describe("getAudioUrl", () => {
    it("usa bestaudio y retorna URL", async () => {
      mockSpawnYtDlp.mockResolvedValueOnce(makeYtDlpResult())

      await service.createResource(TEST_URL)

      expect(mockSpawnYtDlp).toHaveBeenCalledTimes(1)
      const args = mockSpawnYtDlp.mock.calls[0][0]
      expect(args).toContain("--format")
      expect(args).toContain("bestaudio")
    })

    it("falla → lanza error", async () => {
      mockSpawnYtDlp.mockResolvedValue(makeYtDlpResult({ code: 1, stderr: "failed" }))

      await expect(service.createResource(TEST_URL)).rejects.toThrow()
    })

    it("cookie error → refresca → reintenta", async () => {
      mockSpawnYtDlp
        .mockResolvedValueOnce(makeYtDlpResult({ code: 1, stderr: "Sign in to confirm" }))
        .mockResolvedValueOnce(makeYtDlpResult())

      mockIsCookieError.mockReturnValue(true)
      mockRefreshCookies.mockResolvedValue({ success: true, cookieCount: 10 })

      await service.createResource(TEST_URL)

      expect(mockRefreshCookies).toHaveBeenCalledTimes(1)
      expect(mockSpawnYtDlp).toHaveBeenCalledTimes(2)
    })

    it("cookie error pero refresh falla → re-tira error", async () => {
      mockSpawnYtDlp.mockResolvedValue(makeYtDlpResult({ code: 1, stderr: "Sign in to confirm" }))

      mockIsCookieError.mockReturnValue(true)
      mockRefreshCookies.mockResolvedValue({ success: false })

      await expect(service.createResource(TEST_URL)).rejects.toThrow()
      expect(mockRefreshCookies).toHaveBeenCalledTimes(1)
    })

    it("error no es de cookies → no intenta refresh", async () => {
      mockSpawnYtDlp.mockResolvedValue(makeYtDlpResult({ code: 1, stderr: "Network error" }))

      mockIsCookieError.mockReturnValue(false)

      await expect(service.createResource(TEST_URL)).rejects.toThrow()
      expect(mockRefreshCookies).not.toHaveBeenCalled()
    })
  })

  describe("createResource", () => {
    it("spawns FFmpeg con args correctos", async () => {
      await service.createResource(TEST_URL)

      expect(mockSpawn).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining([
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-i", AUDIO_URL,
        "-f", "opus",
        "-c:a", "libopus",
        "-b:a", "128k",
        "-application", "audio",
        "pipe:1",
      ]))
    })

    it("con seek agrega -ss al comando", async () => {
      await service.createResource(TEST_URL, 120)

      expect(mockFormatTime).toHaveBeenCalledWith(120, true)
      const ffmpegArgs = mockSpawn.mock.calls[0][1]
      expect(ffmpegArgs).toContain("-ss")
    })

    it("llama createAudioResource con stdout de FFmpeg", async () => {
      const mockStdout = { on: vi.fn() }
      mockSpawn.mockReturnValue({
        stdout: mockStdout,
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (...args: any[]) => void) => {
          if (event === "close") setTimeout(() => cb(0), 0)
        }),
        kill: vi.fn(),
        killed: false,
      })

      await service.createResource(TEST_URL)

      expect(mockCreateAudioResource).toHaveBeenCalledWith(mockStdout, { inputType: "ogg/opus" })
    })

    it("getAudioUrl lanza error → createResource propaga el error", async () => {
      mockSpawnYtDlp.mockResolvedValue(makeYtDlpResult({ code: 1, stderr: "yt-dlp exploded" }))

      await expect(service.createResource(TEST_URL)).rejects.toThrow()
    })
  })

  describe("killProcess", () => {
    it("mata FFmpeg activo", () => {
      const mockProc = { kill: vi.fn(), killed: false }
      ;(service as any).activeFfmpeg = mockProc

      service.killProcess()

      expect(mockProc.kill).toHaveBeenCalledWith("SIGKILL")
      expect((service as any).activeFfmpeg).toBeNull()
    })

    it("no hace nada si no hay proceso activo", () => {
      ;(service as any).activeFfmpeg = null

      expect(() => service.killProcess()).not.toThrow()
    })

    it("no mata proceso ya killed", () => {
      const mockProc = { kill: vi.fn(), killed: true }
      ;(service as any).activeFfmpeg = mockProc

      service.killProcess()

      expect(mockProc.kill).not.toHaveBeenCalled()
    })
  })
})
