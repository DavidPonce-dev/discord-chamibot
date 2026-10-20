import { describe, it, expect } from "vitest"
import { buildQueueContent, describeNext } from "@/infra/ui/queue-embed"
import { createSession } from "@/domain/session"
import type { GuildSession, Track } from "@/domain/types"

const track = (overrides: Partial<Track>): Track => ({ title: "T", url: "u", requestedBy: "ana", duration: "3:00", ...overrides })

const playing = (current: Track, extra: Partial<GuildSession> = {}): GuildSession => {
  const session = createSession("g1", "v1")
  return { ...session, ...extra, queue: { ...session.queue, ...extra.queue, current } }
}

const fields = (session: GuildSession) =>
  Object.fromEntries((buildQueueContent(session, 1).data.fields ?? []).map(f => [f.name, f.value]))

describe("infra/ui/queue-embed", () => {
  it("shows the identified song and artist instead of the raw upload title", () => {
    const f = fields(playing(track({ title: "Calvin Harris - Summer ft. Ellie Goulding (Official Video)" })))
    expect(f["\u{1F3B5} Cancion"]).toBe("***Summer***")
    expect(f["\u{1F3A4} Artista"]).toBe("**Calvin Harris**")
  })

  it("shows radio tracks with their Last.fm names and as requested by the radio", () => {
    const f = fields(playing(track({
      title: "AIR - La femme d'argent (from Moon Safari - Official Audio)",
      canonicalTitle: "Air - La Femme D'argent",
      requestedBy: "radio",
    })))
    expect(f["\u{1F3B5} Cancion"]).toBe("***La Femme D'argent***")
    expect(f["\u{1F3A4} Artista"]).toBe("**Air**")
    expect(f["Pedido por"]).toBe("\u{1F4FB} Radio")
  })

  it("omits the artist field when it can't be identified", () => {
    const f = fields(playing(track({ title: "Video Killed the Radio Star" })))
    expect(f["\u{1F3B5} Cancion"]).toBe("***Video Killed the Radio Star***")
    expect(f["\u{1F3A4} Artista"]).toBeUndefined()
  })

  describe("describeNext", () => {
    const base = createSession("g1", "v1")
    const withQueue = (queue: Partial<GuildSession["queue"]>, autoplay = false): GuildSession =>
      ({ ...base, prefs: { ...base.prefs, autoplay }, queue: { ...base.queue, ...queue } })

    it("shows the next user track and who asked for it", () => {
      expect(describeNext(withQueue({ userTracks: [track({ title: "Daft Punk - One More Time", requestedBy: "ana" })] })))
        .toBe("Daft Punk - One More Time — pedido por ana")
    })

    it("shows the next radio track when the user queue is empty and autoplay is on", () => {
      expect(describeNext(withQueue({ radioTracks: [track({ title: "x", canonicalTitle: "Justice - Genesis", requestedBy: "radio" })] }, true)))
        .toBe("\u{1F4FB} Justice - Genesis")
    })

    it("tells when a radio recommendation is still being searched", () => {
      expect(describeNext(withQueue({}, true))).toBe("\u{1F4FB} Buscando recomendación…")
    })

    it("tells when nothing is queued", () => {
      expect(describeNext(withQueue({}))).toBe("Nada en cola")
    })
  })
})
