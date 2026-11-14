import { describe, it, expect, vi, beforeEach } from "vitest"
import { EventEmitter } from "events"
import { PassThrough } from "stream"
import type * as ChildProcess from "child_process"
import type { CookieStorePort, LoggerPort } from "@/domain/ports"

vi.mock("child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof ChildProcess>()),
  spawn: vi.fn(),
}))

import { spawn } from "child_process"
import { createYtDlpAudio } from "@/infra/youtube/audio"

const cookieStore: CookieStorePort = {
  read: () => null,
  validate: () => ({ isValid: false, cookieCount: 0, cookieNames: [], hasPSID: false, hasSID: false, lastModified: null }),
  delete: () => {},
  filePath: () => null,
}

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }

const AUDIO_URL = "https://rr1.googlevideo.com/videoplayback?expire=9999999999"

type FakeProcess = EventEmitter & { stdout: PassThrough; stderr: EventEmitter; kill: ReturnType<typeof vi.fn>; killed: boolean }

const fakeFfmpeg = (): FakeProcess => {
  const proc = new EventEmitter() as FakeProcess
  proc.stdout = new PassThrough()
  proc.stderr = new EventEmitter()
  proc.kill = vi.fn()
  proc.killed = false
  vi.mocked(spawn).mockReturnValueOnce(proc as never)
  return proc
}

describe("infra/youtube/audio FFmpeg stream", () => {
  beforeEach(() => { vi.clearAllMocks() })

  // FFmpeg prints a progress line twice a second: on long tracks that stderr grew without bound
  // and was scanned in full on every chunk
  it("lanza FFmpeg sin las lineas de progreso", async () => {
    fakeFfmpeg()
    const audio = createYtDlpAudio(cookieStore, logger)

    const result = await audio.createFromAudioUrl("g1", AUDIO_URL)

    expect(result.ok).toBe(true)
    const args = vi.mocked(spawn).mock.calls[0][1] as string[]
    expect(args).toContain("-nostats")
    expect(args[args.indexOf("-loglevel") + 1]).toBe("warning")
    expect(args[args.indexOf("-i") + 1]).toBe(AUDIO_URL)
  })

  it("marca el stream como fallido cuando FFmpeg informa un 403", async () => {
    const proc = fakeFfmpeg()
    const audio = createYtDlpAudio(cookieStore, logger)
    await audio.createFromAudioUrl("g1", AUDIO_URL)

    proc.stderr.emit("data", Buffer.from("[https @ 0x1] HTTP error 403 Forbidden\n"))

    expect(audio.consumeStreamFailure("g1")).toBe(true)
    expect(audio.consumeStreamFailure("g1")).toBe(false)
  })

  it("detecta el 403 aunque llegue despues de mucha salida y partido entre dos chunks", async () => {
    const proc = fakeFfmpeg()
    const audio = createYtDlpAudio(cookieStore, logger)
    await audio.createFromAudioUrl("g1", AUDIO_URL)

    for (let i = 0; i < 500; i++) proc.stderr.emit("data", Buffer.from(`${"x".repeat(200)}\n`))
    expect(audio.consumeStreamFailure("g1")).toBe(false)
    proc.stderr.emit("data", Buffer.from("[https @ 0x1] HTTP err"))
    proc.stderr.emit("data", Buffer.from("or 403 Forbidden\n"))

    expect(audio.consumeStreamFailure("g1")).toBe(true)
  })

  it("no guarda mas que el final del stderr", async () => {
    const proc = fakeFfmpeg()
    const audio = createYtDlpAudio(cookieStore, logger)
    await audio.createFromAudioUrl("g1", AUDIO_URL)

    for (let i = 0; i < 500; i++) proc.stderr.emit("data", Buffer.from(`${"x".repeat(200)}\n`))
    proc.stderr.emit("data", Buffer.from("Server returned 5XX Server Error reply\n"))
    proc.emit("close", 1)

    const call = vi.mocked(logger.error).mock.calls.find(([, msg]) => msg === "FFmpeg termino con error")
    const stderr = (call?.[2] as { stderr: string }).stderr
    // What matters when diagnosing is the last thing FFmpeg said, not the first 2000 characters
    expect(stderr).toContain("5XX Server Error")
    expect(stderr.length).toBeLessThanOrEqual(4_000)
  })
})
