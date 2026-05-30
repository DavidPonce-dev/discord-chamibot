import { describe, it, expect, vi } from "vitest"
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from "discord.js"
import { buildQueueContent, buildEmptyEmbed } from "@/ui/embeds/QueueEmbed"
import { buildTrackRows, buildNavRow, buildPlaybackRow, buildNowPlayingButtons } from "@/ui/components/QueueComponents"
import { TRACKS_PER_PAGE } from "@/constants"
import type { TrackScheduler } from "@/services/scheduler/TrackScheduler"
import type { Track } from "@/core/types"

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    title: "Test Song",
    url: "https://youtube.com/watch?v=t1",
    requestedBy: "user",
    duration: "3:30",
    id: "t1",
    ...overrides,
  }
}

function mockQueue(overrides: Record<string, any> = {}) {
  const base = {
    getQueue: vi.fn().mockReturnValue([] as Track[]),
    getCurrentTrack: vi.fn().mockReturnValue(null as Track | null),
    getSize: vi.fn().mockReturnValue(0),
    getPosition: vi.fn().mockReturnValue(0),
    isPaused: vi.fn().mockReturnValue(false),
    isAutoplayEnabled: vi.fn().mockReturnValue(false),
  }
  return { ...base, ...overrides } as unknown as TrackScheduler
}

describe("QueueEmbed", () => {
  describe("buildEmptyEmbed", () => {
    it("devuelve un EmbedBuilder", () => {
      const embed = buildEmptyEmbed()
      expect(embed).toBeInstanceOf(EmbedBuilder)
    })

    it("tiene el título correcto", () => {
      const embed = buildEmptyEmbed()
      expect(embed.data.title).toBe("🎵 Charmin Charmeleon 🎵")
    })

    it("tiene description 'La cola está vacía'", () => {
      const embed = buildEmptyEmbed()
      expect(embed.data.description).toBe("La cola está vacía")
    })
  })

  describe("buildQueueContent", () => {
    it("sin tracks ni current muestra embed sin description", () => {
      const embed = buildQueueContent(mockQueue(), 1)
      expect(embed.data.title).toBe("🎵 Charmin Charmeleon 🎵")
      expect(embed.data.description).toBeUndefined()
    })

    it("con current muestra el título en description", () => {
      const q = mockQueue({
        getCurrentTrack: vi.fn().mockReturnValue(makeTrack({ title: "Now Playing" })),
        getPosition: vi.fn().mockReturnValue(65),
      })
      const embed = buildQueueContent(q, 1)
      expect(embed.data.description).toContain("Now Playing")
      expect(embed.data.description).toContain("1:05") // 65s en la barra
    })

    it("con statusTitle lo incluye al inicio", () => {
      const q = mockQueue({
        getCurrentTrack: vi.fn().mockReturnValue(makeTrack()),
        getPosition: vi.fn().mockReturnValue(0),
      })
      const embed = buildQueueContent(q, 1, "🎵 usuario agregó un tema")
      expect(embed.data.description).toContain("usuario agregó un tema")
    })

    it("tracks sin duration no explotan", () => {
      const q = mockQueue({
        getCurrentTrack: vi.fn().mockReturnValue(makeTrack({ duration: undefined })),
        getPosition: vi.fn().mockReturnValue(0),
      })
      expect(() => buildQueueContent(q, 1)).not.toThrow()
    })
  })

  describe("TRACKS_PER_PAGE", () => {
    it("value es 3", () => {
      expect(TRACKS_PER_PAGE).toBe(3)
    })
  })
})

function btnData(btn: unknown) {
  return (btn as ButtonBuilder).data as any
}

describe("QueueComponents", () => {
  describe("buildTrackRows", () => {
    it("sin tracks devuelve array vacío", () => {
      const q = mockQueue()
      expect(buildTrackRows(q, 1)).toEqual([])
    })

    it("con 1 track devuelve 1 row", () => {
      const q = mockQueue({
        getQueue: vi.fn().mockReturnValue([makeTrack({ title: "Alone Track" })]),
      })
      const rows = buildTrackRows(q, 1)
      expect(rows).toHaveLength(1)
    })

    it("con 5 tracks page 1 devuelve 3 rows (pagina 1)", () => {
      const tracks = Array.from({ length: 5 }, (_, i) => makeTrack({ title: `Track ${i}` }))
      const q = mockQueue({ getQueue: vi.fn().mockReturnValue(tracks) })
      expect(buildTrackRows(q, 1)).toHaveLength(3)
    })

    it("con 5 tracks page 2 devuelve 2 rows (pagina 2)", () => {
      const tracks = Array.from({ length: 5 }, (_, i) => makeTrack({ title: `Track ${i}` }))
      const q = mockQueue({ getQueue: vi.fn().mockReturnValue(tracks) })
      expect(buildTrackRows(q, 2)).toHaveLength(2)
    })
  })

  describe("buildNavRow", () => {
    it("totalPages <= 1 devuelve null", () => {
      expect(buildNavRow(1, 1)).toBeNull()
    })

    it("totalPages > 1 devuelve ActionRow", () => {
      const row = buildNavRow(1, 3)
      expect(row).toBeInstanceOf(ActionRowBuilder)
    })

    it("page 1 desactiva botón prev", () => {
      const row = buildNavRow(1, 3)!
      expect(btnData(row.components[0]).disabled).toBe(true)
    })

    it("last page desactiva botón next", () => {
      const row = buildNavRow(3, 3)!
      expect(btnData(row.components[2]).disabled).toBe(true)
    })
  })

  describe("buildPlaybackRow", () => {
    it("devuelve ActionRowBuilder con 5 botones", () => {
      const row = buildPlaybackRow(mockQueue())
      expect(row).toBeInstanceOf(ActionRowBuilder)
      expect(row.components).toHaveLength(5)
    })

    it("cuando no está pausado muestra 'Pausar'", () => {
      const q = mockQueue({ isPaused: vi.fn().mockReturnValue(false) })
      const row = buildPlaybackRow(q)
      expect(btnData(row.components[0]).label).toBe("Pausar")
    })

    it("cuando está pausado muestra 'Reanudar'", () => {
      const q = mockQueue({ isPaused: vi.fn().mockReturnValue(true) })
      const row = buildPlaybackRow(q)
      expect(btnData(row.components[0]).label).toBe("Reanudar")
    })

    it("autoplay ON muestra 'Radio: ON'", () => {
      const q = mockQueue({ isAutoplayEnabled: vi.fn().mockReturnValue(true) })
      const row = buildPlaybackRow(q)
      expect(btnData(row.components[4]).label).toBe("Radio: ON")
    })

    it("autoplay OFF muestra 'Radio: OFF'", () => {
      const q = mockQueue({ isAutoplayEnabled: vi.fn().mockReturnValue(false) })
      const row = buildPlaybackRow(q)
      expect(btnData(row.components[4]).label).toBe("Radio: OFF")
    })
  })

  describe("buildNowPlayingButtons", () => {
    it("devuelve ActionRowBuilder con 5 botones", () => {
      const q = mockQueue()
      const row = buildNowPlayingButtons(q)
      expect(row).toBeInstanceOf(ActionRowBuilder)
      expect(row.components).toHaveLength(5)
    })

    it("pausado muestra '▶ Reanudar' con id np_resume", () => {
      const q = mockQueue({ isPaused: vi.fn().mockReturnValue(true) })
      const row = buildNowPlayingButtons(q)
      expect(btnData(row.components[1]).label).toBe("▶ Reanudar")
      expect(btnData(row.components[1]).custom_id).toBe("np_resume")
    })

    it("no pausado muestra '⏸ Pausar' con id np_pause", () => {
      const q = mockQueue({ isPaused: vi.fn().mockReturnValue(false) })
      const row = buildNowPlayingButtons(q)
      expect(btnData(row.components[1]).label).toBe("⏸ Pausar")
      expect(btnData(row.components[1]).custom_id).toBe("np_pause")
    })
  })
})
