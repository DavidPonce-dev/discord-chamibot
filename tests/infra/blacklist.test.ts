import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createJsonBlacklist } from "@/infra/persistence/blacklist"
import type { LoggerPort } from "@/domain/ports"
import fs from "fs"
import path from "path"
import os from "os"

describe("infra/persistence/blacklist", () => {
  const tmpDir = () => {
    const dir = path.join(os.tmpdir(), `blacklist-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  it("starts empty", () => {
    const dir = tmpDir()
    const bl = createJsonBlacklist(path.join(dir, "bl.json"))
    expect(bl.getAll()).toEqual([])
  })

  it("adds and retrieves entries", async () => {
    const dir = tmpDir()
    const filePath = path.join(dir, "bl.json")
    const bl = createJsonBlacklist(filePath)
    bl.add("g1", "Server One")
    bl.add("g2", "Server Two")
    expect(bl.getAll()).toHaveLength(2)
    expect(bl.isBlacklisted("g1")).toBe(true)
    expect(bl.isBlacklisted("g3")).toBe(false)
  })

  it("removes entries", () => {
    const dir = tmpDir()
    const bl = createJsonBlacklist(path.join(dir, "bl.json"))
    bl.add("g1", "Server")
    expect(bl.remove("g1")).toBe(true)
    expect(bl.getAll()).toHaveLength(0)
    expect(bl.isBlacklisted("g1")).toBe(false)
  })

  it("remove returns false for nonexistent", () => {
    const dir = tmpDir()
    const bl = createJsonBlacklist(path.join(dir, "bl.json"))
    expect(bl.remove("nonexistent")).toBe(false)
  })

  it("loads from existing file", () => {
    const dir = tmpDir()
    const filePath = path.join(dir, "bl.json")
    fs.writeFileSync(filePath, JSON.stringify([
      { guildId: "g1", guildName: "Server", blacklistedAt: "2024-01-01" },
    ]))
    const bl = createJsonBlacklist(filePath)
    expect(bl.getAll()).toHaveLength(1)
    expect(bl.isBlacklisted("g1")).toBe(true)
  })

  it("handles corrupt file gracefully", () => {
    const dir = tmpDir()
    const filePath = path.join(dir, "bl.json")
    fs.writeFileSync(filePath, "not json{{{")
    const bl = createJsonBlacklist(filePath)
    expect(bl.getAll()).toEqual([])
  })

  describe("persistence", () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it("persists entries for the next start, creating the directory if needed", () => {
      const filePath = path.join(tmpDir(), "nested", "bl.json")
      createJsonBlacklist(filePath).add("g1", "Server One")
      vi.advanceTimersByTime(2_000)

      expect(createJsonBlacklist(filePath).isBlacklisted("g1")).toBe(true)
    })

    // In the Docker image the data directory was not writable: the write threw inside a timer,
    // which is an uncaught exception and took the whole bot down
    it("does not throw when the file cannot be written, and logs it", () => {
      const dir = tmpDir()
      const notADirectory = path.join(dir, "file")
      fs.writeFileSync(notADirectory, "x")
      const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }
      const bl = createJsonBlacklist(path.join(notADirectory, "sub", "bl.json"), logger)

      bl.add("g1", "Server One")

      expect(() => vi.advanceTimersByTime(2_000)).not.toThrow()
      expect(bl.isBlacklisted("g1")).toBe(true)
      expect(logger.error).toHaveBeenCalledWith("blacklist", expect.any(String), expect.objectContaining({ error: expect.any(String) }))
    })
  })
})
