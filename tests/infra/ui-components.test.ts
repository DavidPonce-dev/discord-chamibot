import { describe, it, expect } from "vitest"
import { buildTrackRows, buildNavRow, buildPlaybackRow } from "@/infra/ui/queue-components"
import { buildHelpEmbed } from "@/infra/ui/help-embed"
import type { GuildSession } from "@/domain/types"
import { createSession } from "@/domain/session"
import { addMultiple } from "@/domain/queue"
import { BUTTON_PREFIXES } from "@/config/ui"

const makeTrack = (title: string, requestedBy = "user1") => ({
  title, url: `https://youtube.com/watch?v=${title}`, requestedBy, duration: "3:00",
})

const sessionWithTracks = (trackCount: number): GuildSession => {
  const tracks = Array.from({ length: trackCount }, (_, i) => makeTrack(`Track ${i + 1}`))
  const session = createSession("g1", "v1")
  return { ...session, queue: addMultiple(session.queue, tracks) }
}

const skipButton = (session: GuildSession) =>
  buildPlaybackRow(session).components.find((c) => c.data.custom_id === BUTTON_PREFIXES.queuePlaybackSkip)

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

    it("disables the radio shuffle button while that track is being reshuffled", () => {
      const session = createSession("g1", "v1")
      const radioTrack = { title: "Radio Song", url: "u", requestedBy: "radio", duration: "3:00" }
      const updated = {
        ...session,
        queue: { ...session.queue, radioTracks: [radioTrack] },
        reshufflingRadioIndex: 0,
      } as GuildSession
      const row = buildTrackRows(updated, 1)[0]
      const shuffle = row.components.find((c) => c.data.custom_id === `${BUTTON_PREFIXES.queueRadioShuffle}0`)
      expect(shuffle?.data.disabled).toBe(true)
    })

    it("marks the right radio row as reshuffling when user tracks come first", () => {
      // reshufflingRadioIndex is relative to radioTracks; the row index counts user tracks too
      const session = createSession("g1", "v1")
      const updated = {
        ...session,
        queue: {
          ...session.queue,
          userTracks: [makeTrack("User Song")],
          radioTracks: [{ title: "Radio A", url: "a", requestedBy: "radio", duration: "3:00" }],
        },
        reshufflingRadioIndex: 0,
      } as GuildSession
      const [userRow, radioRow] = buildTrackRows(updated, 1)
      const label = (row: typeof userRow) => row.components.find(c => c.data.custom_id?.startsWith(BUTTON_PREFIXES.queueTrack))?.data.label
      expect(label(userRow)).toBe("1. User Song (3:00)")
      expect(label(radioRow)).toContain("Buscando otra recomendación")
      const shuffle = radioRow.components.find((c) => c.data.custom_id === `${BUTTON_PREFIXES.queueRadioShuffle}1`)
      expect(shuffle?.data.disabled).toBe(true)
    })

    it("labels tracks with clean names, marks radio and fits Discord's 80-char limit", () => {
      const session = createSession("g1", "v1")
      const updated = {
        ...session,
        queue: {
          ...session.queue,
          userTracks: [makeTrack("Bad Bunny (ft. Chencho Corleone) - Me Porto Bonito (Official Video) | Un Verano Sin Ti")],
          radioTracks: [{
            title: "AIR - La femme d'argent (from Moon Safari - Official Audio)",
            canonicalTitle: "Air - La Femme D'argent",
            url: "u", requestedBy: "radio", duration: "7:07",
          }],
        },
      } as GuildSession
      const labels = buildTrackRows(updated, 1).map(row =>
        row.components.find(c => c.data.custom_id?.startsWith(BUTTON_PREFIXES.queueTrack))?.data.label)
      expect(labels).toEqual([
        "1. Bad Bunny - Me Porto Bonito (3:00)",
        "2. \u{1F4FB} Air - La Femme D'argent (7:07)",
      ])

      const long = { ...updated, queue: { ...updated.queue, userTracks: [makeTrack(`Artist - ${"x".repeat(120)}`)], radioTracks: [] } }
      const longLabel = buildTrackRows(long as GuildSession, 1)[0].components
        .find(c => c.data.custom_id?.startsWith(BUTTON_PREFIXES.queueTrack))?.data.label ?? ""
      expect(longLabel.length).toBeLessThanOrEqual(80)
      expect(longLabel.endsWith("(3:00)")).toBe(true)
    })

    it("keeps the radio shuffle button enabled when no reshuffle is in progress", () => {
      const session = createSession("g1", "v1")
      const radioTrack = { title: "Radio Song", url: "u", requestedBy: "radio", duration: "3:00" }
      const updated = { ...session, queue: { ...session.queue, radioTracks: [radioTrack] } } as GuildSession
      const row = buildTrackRows(updated, 1)[0]
      const shuffle = row.components.find((c) => c.data.custom_id === `${BUTTON_PREFIXES.queueRadioShuffle}0`)
      expect(shuffle?.data.disabled).toBe(false)
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

    it("disables skip when there is no next track", () => {
      const session = createSession("g1", "v1")
      expect(skipButton(session)?.data.disabled).toBe(true)
    })

    it("enables skip when a radio track is queued", () => {
      const session = createSession("g1", "v1")
      const withRadio = {
        ...session,
        queue: { ...session.queue, radioTracks: [{ title: "Radio", url: "u", requestedBy: "radio", duration: "3:00" }] },
      }
      expect(skipButton(withRadio as GuildSession)?.data.disabled).toBe(false)
    })

    it("enables skip when a user track is queued", () => {
      const session = sessionWithTracks(1)
      expect(skipButton(session)?.data.disabled).toBe(false)
    })
  })
})

describe("infra/ui/embeds", () => {
  describe("buildHelpEmbed", () => {
    it("creates embed with all commands", () => {
      const embed = buildHelpEmbed()
      const data = embed.toJSON()
      expect(data.title).toContain("Comandos")
      expect(data.fields!.length).toBeGreaterThan(10)
    })
  })
})
