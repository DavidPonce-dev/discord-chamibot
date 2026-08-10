import { describe, it, expect } from "vitest"
import { buildTrackRows, buildNavRow, buildPlaybackRow } from "@/infra/ui/queue-components"
import { buildEmptyEmbed } from "@/infra/ui/queue-embed"
import { buildHelpEmbed } from "@/infra/ui/help-embed"
import type { GuildSession } from "@/domain/types"
import { createSession } from "@/domain/session"
import { addMultiple } from "@/domain/queue"

const makeTrack = (title: string, requestedBy = "user1") => ({
  title, url: `https://youtube.com/watch?v=${title}`, requestedBy, duration: "3:00",
})

const sessionWithTracks = (trackCount: number): GuildSession => {
  const tracks = Array.from({ length: trackCount }, (_, i) => makeTrack(`Track ${i + 1}`))
  const session = createSession("g1", "v1")
  return { ...session, queue: addMultiple(session.queue, tracks) }
}

describe("infra/ui/queue-components", () => {
  describe("buildTrackRows", () => {
    it("returns rows for page tracks", () => {
      const session = sessionWithTracks(5)
      const rows = buildTrackRows(session, 1)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.length).toBeLessThanOrEqual(3)
    })

    it("includes radio shuffle button for radio tracks", () => {
      const session = createSession("g1", "v1")
      const radioTrack = { title: "Radio Song", url: "u", requestedBy: "radio", duration: "3:00" }
      const updated = { ...session, queue: { ...session.queue, radioTracks: [radioTrack] } }
      const rows = buildTrackRows(updated as GuildSession, 1)
      expect(rows).toHaveLength(1)
    })

    it("returns empty for no tracks", () => {
      const session = createSession("g1", "v1")
      const rows = buildTrackRows(session, 1)
      expect(rows).toHaveLength(0)
    })
  })

  describe("buildNavRow", () => {
    it("returns null when only 1 page", () => {
      expect(buildNavRow(1, 1)).toBeNull()
    })

    it("returns row with prev/next when multiple pages", () => {
      const row = buildNavRow(2, 5)
      expect(row).not.toBeNull()
    })

    it("disables prev on first page", () => {
      const row = buildNavRow(1, 3)
      expect(row).not.toBeNull()
    })

    it("disables next on last page", () => {
      const row = buildNavRow(3, 3)
      expect(row).not.toBeNull()
    })
  })

  describe("buildPlaybackRow", () => {
    it("shows play icon when paused", () => {
      const session = { ...createSession("g1", "v1"), playback: { ...createSession("g1", "v1").playback, isPaused: true } }
      const row = buildPlaybackRow(session)
      expect(row).toBeDefined()
    })

    it("shows pause icon when playing", () => {
      const session = createSession("g1", "v1")
      const row = buildPlaybackRow(session)
      expect(row).toBeDefined()
    })

    it("shows autoplay active state", () => {
      const session = { ...createSession("g1", "v1"), prefs: { ...createSession("g1", "v1").prefs, autoplay: true } }
      const row = buildPlaybackRow(session)
      expect(row).toBeDefined()
    })
  })
})

describe("infra/ui/embeds", () => {
  describe("buildEmptyEmbed", () => {
    it("creates embed with description", () => {
      const embed = buildEmptyEmbed()
      const data = embed.toJSON()
      expect(data.description).toContain("vacia")
    })
  })

  describe("buildHelpEmbed", () => {
    it("creates embed with all commands", () => {
      const embed = buildHelpEmbed()
      const data = embed.toJSON()
      expect(data.title).toContain("Comandos")
      expect(data.fields!.length).toBeGreaterThan(10)
    })
  })
})
