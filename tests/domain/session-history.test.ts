import { describe, it, expect } from "vitest"
import { createSession, onTrackFinished } from "@/domain/session"
import { RADIO_HISTORY_LIMIT } from "@/config/radio"

describe("domain/session radio history", () => {
  // With only 5 entries the radio came back to the same songs after a handful of tracks
  it("recuerda los ultimos temas hasta el limite del historial de radio", () => {
    let session = createSession("g1", "v1")
    for (let i = 0; i < RADIO_HISTORY_LIMIT + 10; i++) {
      session = onTrackFinished(session, { title: `Song ${i}`, url: `u${i}`, requestedBy: "u1", id: `id${i}` }, () => "Artist")
    }
    expect(session.recentIds).toHaveLength(RADIO_HISTORY_LIMIT)
    expect(session.recentTitles).toHaveLength(RADIO_HISTORY_LIMIT)
    expect(session.recentIds[0]).toBe(`id${RADIO_HISTORY_LIMIT + 9}`)
    expect(session.recentIds).not.toContain("id0")
    expect(RADIO_HISTORY_LIMIT).toBeGreaterThanOrEqual(20)
  })
})
