import fs from "fs"
import path from "path"
import { logger } from "@/utils/logger"

export interface BlacklistEntry {
  guildId: string
  guildName: string
  blacklistedAt: string
}

const BLACKLIST_PATH = path.resolve(process.cwd(), "data", "blacklist.json")

class BlacklistStore {
  private entries: Map<string, BlacklistEntry> = new Map()

  constructor() {
    this.load()
  }

  private load(): void {
    try {
      if (fs.existsSync(BLACKLIST_PATH)) {
        const data = JSON.parse(fs.readFileSync(BLACKLIST_PATH, "utf-8"))
        if (Array.isArray(data)) {
          for (const entry of data) {
            if (entry.guildId) {
              this.entries.set(entry.guildId, entry)
            }
          }
        }
        logger.info("blacklist", `Loaded ${this.entries.size} blacklisted guilds`)
      }
    } catch (err) {
      logger.error("blacklist", "Failed to load blacklist", { error: String(err) })
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(BLACKLIST_PATH)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const data = Array.from(this.entries.values())
      fs.writeFileSync(BLACKLIST_PATH, JSON.stringify(data, null, 2), "utf-8")
    } catch (err) {
      logger.error("blacklist", "Failed to save blacklist", { error: String(err) })
    }
  }

  add(guildId: string, guildName: string): void {
    this.entries.set(guildId, {
      guildId,
      guildName,
      blacklistedAt: new Date().toISOString(),
    })
    this.save()
    logger.info("blacklist", `Blacklisted guild ${guildName} (${guildId})`)
  }

  remove(guildId: string): boolean {
    const removed = this.entries.delete(guildId)
    if (removed) {
      this.save()
      logger.info("blacklist", `Unblacklisted guild ${guildId}`)
    }
    return removed
  }

  isBlacklisted(guildId: string): boolean {
    return this.entries.has(guildId)
  }

  getAll(): BlacklistEntry[] {
    return Array.from(this.entries.values())
  }
}

export const blacklistStore = new BlacklistStore()
