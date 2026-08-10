import fs from "fs"
import type { BlacklistRepository } from "../../domain/ports"
import type { BlacklistEntry } from "../../domain/types"

export const createJsonBlacklist = (filePath: string): BlacklistRepository => {
  let entries: BlacklistEntry[] = loadFromFile(filePath)
  let writeTimer: NodeJS.Timeout | null = null

  const debouncedSave = (): void => {
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = setTimeout(() => {
      const dir = filePath.substring(0, filePath.lastIndexOf("/")) || filePath.substring(0, filePath.lastIndexOf("\\"))
      if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), "utf-8")
    }, 1000)
  }

  const add = (guildId: string, name: string): void => {
    entries = [...entries, { guildId, guildName: name, blacklistedAt: new Date().toISOString() }]
    debouncedSave()
  }

  const remove = (guildId: string): boolean => {
    const before = entries.length
    entries = entries.filter(e => e.guildId !== guildId)
    if (entries.length < before) { debouncedSave(); return true }
    return false
  }

  const isBlacklisted = (guildId: string): boolean =>
    entries.some(e => e.guildId === guildId)

  const getAll = (): readonly BlacklistEntry[] => entries

  return { getAll, add, remove, isBlacklisted } as const
}

function loadFromFile(filePath: string): BlacklistEntry[] {
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"))
      if (Array.isArray(data)) {
        return data.filter((entry: any): entry is BlacklistEntry => !!entry.guildId)
      }
    }
  } catch {}
  return []
}
