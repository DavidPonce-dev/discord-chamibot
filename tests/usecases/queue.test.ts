import { describe, it, expect } from "vitest"
import { createQueueUseCases } from "@/usecases/queue"
import { createMusicUseCases } from "@/usecases/music"
import { createMockPorts } from "./mock-ports"

describe("usecases/queue", () => {
  const setup = async () => {
    const ports = createMockPorts()
    const music = createMusicUseCases(ports)
    await music.play("test", "g1", "u1", "v1", {})
    const setSession = (guildId: string, session: Parameters<typeof music.setSession>[1]) => music.setSession(guildId, session)
    const queue = createQueueUseCases(ports, music.getSession, setSession)
    return { music, queue }
  }

  describe("getQueue", () => {
    it("returns error with no session", () => {
      const ports = createMockPorts()
      const music = createMusicUseCases(ports)
      const queue = createQueueUseCases(ports, music.getSession, () => {})
      const result = queue.getQueue("g1", 1)
      expect(result.ok).toBe(false)
    })

    it("returns queue data with session", async () => {
      const { queue } = await setup()
      const result = queue.getQueue("g1", 1)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.page).toBe(1)
        expect(result.value.session).not.toBeNull()
      }
    })
  })

  describe("shuffleQueue", () => {
    it("returns error with no session", () => {
      const ports = createMockPorts()
      const music = createMusicUseCases(ports)
      const queue = createQueueUseCases(ports, music.getSession, () => {})
      expect(queue.shuffleQueue("g1").ok).toBe(false)
    })
  })

  describe("removeTrack", () => {
    it("returns out_of_bounds for invalid position", async () => {
      const { queue } = await setup()
      const result = queue.removeTrack("g1", 99)
      expect(result.ok).toBe(false)
    })
  })

  describe("moveUp / moveDown", () => {
    it("moveUp returns invalid for no session", () => {
      const ports = createMockPorts()
      const music = createMusicUseCases(ports)
      const queue = createQueueUseCases(ports, music.getSession, () => {})
      expect(queue.moveUp("g1", 0).ok).toBe(false)
    })

    it("moveDown returns invalid for no session", () => {
      const ports = createMockPorts()
      const music = createMusicUseCases(ports)
      const queue = createQueueUseCases(ports, music.getSession, () => {})
      expect(queue.moveDown("g1", 0).ok).toBe(false)
    })
  })

  describe("toggleLoop", () => {
    it("returns error with no session", () => {
      const ports = createMockPorts()
      const music = createMusicUseCases(ports)
      const queue = createQueueUseCases(ports, music.getSession, () => {})
      expect(queue.toggleLoop("g1").ok).toBe(false)
    })

    it("cycles loop mode", async () => {
      const { queue } = await setup()
      const result = queue.toggleLoop("g1")
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe("one")

      const result2 = queue.toggleLoop("g1")
      if (result2.ok) expect(result2.value).toBe("all")

      const result3 = queue.toggleLoop("g1")
      if (result3.ok) expect(result3.value).toBe("none")
    })
  })
})
