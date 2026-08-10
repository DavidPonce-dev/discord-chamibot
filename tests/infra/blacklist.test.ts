import { describe, it, expect } from "vitest"
import { createJsonBlacklist } from "@/infra/persistence/blacklist"
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
})
