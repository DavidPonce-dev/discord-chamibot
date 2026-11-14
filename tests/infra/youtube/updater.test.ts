import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { LoggerPort } from "@/domain/ports"

vi.mock("@/infra/youtube/ytdlp", () => ({ spawnYtDlp: vi.fn() }))

import { spawnYtDlp } from "@/infra/youtube/ytdlp"
import { createYtDlpUpdater } from "@/infra/youtube/updater"

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }
const DAY_MS = 24 * 60 * 60_000

describe("infra/youtube/updater", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(spawnYtDlp).mockResolvedValue({ code: 0, stdout: "Updated yt-dlp to 2026.11.01\n", stderr: "" })
  })
  afterEach(() => { vi.useRealTimers() })

  // YouTube changes break old yt-dlp builds: the image's copy must not stay frozen at build time
  it("updates yt-dlp on start and then once a day", async () => {
    const updater = createYtDlpUpdater(logger, DAY_MS)
    updater.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(spawnYtDlp).toHaveBeenCalledTimes(1)
    expect(vi.mocked(spawnYtDlp).mock.calls[0][0]).toEqual(["-U"])

    await vi.advanceTimersByTimeAsync(DAY_MS)
    expect(spawnYtDlp).toHaveBeenCalledTimes(2)
    updater.stop()
  })

  it("stops updating after stop", async () => {
    const updater = createYtDlpUpdater(logger, DAY_MS)
    updater.start()
    await vi.advanceTimersByTimeAsync(0)
    updater.stop()

    await vi.advanceTimersByTimeAsync(DAY_MS * 3)
    expect(spawnYtDlp).toHaveBeenCalledTimes(1)
  })

  it("logs a failed update and keeps the bot running", async () => {
    vi.mocked(spawnYtDlp).mockResolvedValue({ code: 1, stdout: "", stderr: "ERROR: Unable to write to /usr/local/bin/yt-dlp" })
    const updater = createYtDlpUpdater(logger, DAY_MS)

    await expect(updater.updateNow()).resolves.toBe(false)
    expect(logger.warn).toHaveBeenCalledWith("ytdlp", expect.any(String), expect.objectContaining({ error: expect.stringContaining("Unable to write") }))
  })

  it("does not run two updates at once", async () => {
    let finish!: () => void
    vi.mocked(spawnYtDlp).mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({ code: 0, stdout: "", stderr: "" }) }))
    const updater = createYtDlpUpdater(logger, DAY_MS)

    const first = updater.updateNow()
    const second = updater.updateNow()
    finish()
    await Promise.all([first, second])

    expect(spawnYtDlp).toHaveBeenCalledTimes(1)
  })
})
