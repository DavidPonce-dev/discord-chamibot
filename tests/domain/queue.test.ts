import { describe, it, expect } from "vitest"
import {
  emptyQueue, addTrack, addNext, addMultiple, dequeue, removeTrack,
  moveUp, moveDown, shuffle, toggleLoop, applyLoop, clear, getAllTracks,
  getSize, isEmpty, addRadioTrack, clearRadio, replaceRadioTrack,
} from "@/domain/queue"
import type { Track } from "@/domain/types"

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    title: "Test Track",
    url: "https://youtube.com/watch?v=test",
    requestedBy: "user1",
    ...overrides,
  }
}

describe("domain/queue", () => {
  describe("emptyQueue", () => {
    it("crea cola vacia", () => {
      const q = emptyQueue()
      expect(q.userTracks).toEqual([])
      expect(q.radioTracks).toEqual([])
      expect(q.current).toBeNull()
      expect(q.loopMode).toBe("none")
    })
  })

  describe("addTrack", () => {
    it("anade track a userTracks", () => {
      const q = emptyQueue()
      const track = makeTrack()
      const result = addTrack(q, track)
      expect(result.userTracks).toHaveLength(1)
      expect(result.userTracks[0]).toBe(track)
    })

    it("limpia radioTracks al anadir track de usuario", () => {
      const q = { ...emptyQueue(), radioTracks: [makeTrack({ requestedBy: "radio" })] }
      const result = addTrack(q, makeTrack())
      expect(result.radioTracks).toHaveLength(0)
    })
  })

  describe("addNext", () => {
    it("anade track al frente", () => {
      const q = addTrack(emptyQueue(), makeTrack({ title: "First" }))
      const result = addNext(q, makeTrack({ title: "Next" }))
      expect(result.userTracks[0].title).toBe("Next")
      expect(result.userTracks[1].title).toBe("First")
    })
  })

  describe("addMultiple", () => {
    it("anade multiples tracks", () => {
      const tracks = [makeTrack({ title: "A" }), makeTrack({ title: "B" }), makeTrack({ title: "C" })]
      const result = addMultiple(emptyQueue(), tracks)
      expect(result.userTracks).toHaveLength(3)
    })
  })

  describe("dequeue", () => {
    it("retorna primer track de userTracks", () => {
      const q = addMultiple(emptyQueue(), [makeTrack({ title: "A" }), makeTrack({ title: "B" })])
      const { track, queue } = dequeue(q, false)
      expect(track?.title).toBe("A")
      expect(queue.userTracks).toHaveLength(1)
    })

    it("retorna radio track si autoplay y no hay user tracks", () => {
      const radioTrack = makeTrack({ title: "Radio", requestedBy: "radio" })
      const q = { ...emptyQueue(), radioTracks: [radioTrack] }
      const { track } = dequeue(q, true)
      expect(track?.title).toBe("Radio")
    })

    it("retorna null si no hay tracks", () => {
      const { track } = dequeue(emptyQueue(), false)
      expect(track).toBeNull()
    })

    it("no retorna radio track sin autoplay", () => {
      const q = { ...emptyQueue(), radioTracks: [makeTrack({ requestedBy: "radio" })] }
      const { track } = dequeue(q, false)
      expect(track).toBeNull()
    })
  })

  describe("removeTrack", () => {
    it("remueve track por indice", () => {
      const q = addMultiple(emptyQueue(), [makeTrack({ title: "A" }), makeTrack({ title: "B" })])
      const result = removeTrack(q, 0)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.track.title).toBe("A")
        expect(result.value.queue.userTracks).toHaveLength(1)
      }
    })

    it("retorna error si indice fuera de rango", () => {
      const result = removeTrack(emptyQueue(), 0)
      expect(result.ok).toBe(false)
    })
  })

  describe("moveUp", () => {
    it("mueve track hacia arriba", () => {
      const q = addMultiple(emptyQueue(), [makeTrack({ title: "A" }), makeTrack({ title: "B" })])
      const result = moveUp(q, 1)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.userTracks[0].title).toBe("B")
        expect(result.value.userTracks[1].title).toBe("A")
      }
    })

    it("retorna error si indice es 0", () => {
      const q = addTrack(emptyQueue(), makeTrack())
      expect(moveUp(q, 0).ok).toBe(false)
    })
  })

  describe("moveDown", () => {
    it("mueve track hacia abajo", () => {
      const q = addMultiple(emptyQueue(), [makeTrack({ title: "A" }), makeTrack({ title: "B" })])
      const result = moveDown(q, 0)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.userTracks[0].title).toBe("B")
        expect(result.value.userTracks[1].title).toBe("A")
      }
    })
  })

  describe("shuffle", () => {
    it("retorna cola con mismos tracks", () => {
      const tracks = Array.from({ length: 10 }, (_, i) => makeTrack({ title: `Track ${i}` }))
      const q = addMultiple(emptyQueue(), tracks)
      const result = shuffle(q)
      expect(result.userTracks).toHaveLength(10)
    })
  })

  describe("toggleLoop", () => {
    it("cicla none -> one -> all -> none", () => {
      let q = emptyQueue()
      expect(q.loopMode).toBe("none")
      q = toggleLoop(q)
      expect(q.loopMode).toBe("one")
      q = toggleLoop(q)
      expect(q.loopMode).toBe("all")
      q = toggleLoop(q)
      expect(q.loopMode).toBe("none")
    })
  })

  describe("applyLoop", () => {
    it("loop one reencola al frente", () => {
      const q = { ...emptyQueue(), loopMode: "one" as const }
      const track = makeTrack({ title: "Looped" })
      const result = applyLoop(q, track)
      expect(result.userTracks[0].title).toBe("Looped")
    })

    it("loop all reencola al final", () => {
      const q = { ...addTrack(emptyQueue(), makeTrack({ title: "Existing" })), loopMode: "all" as const }
      const result = applyLoop(q, makeTrack({ title: "Looped" }))
      expect(result.userTracks[result.userTracks.length - 1].title).toBe("Looped")
    })

    it("loop none no modifica cola", () => {
      const q = emptyQueue()
      const result = applyLoop(q, makeTrack())
      expect(result.userTracks).toHaveLength(0)
    })
  })

  describe("clear", () => {
    it("vacia ambas colas", () => {
      const q = addMultiple({ ...emptyQueue(), radioTracks: [makeTrack({ requestedBy: "radio" })] }, [makeTrack()])
      const result = clear(q)
      expect(result.userTracks).toHaveLength(0)
      expect(result.radioTracks).toHaveLength(0)
    })
  })

  describe("getSize", () => {
    it("suma user + radio", () => {
      const q = { ...addTrack(emptyQueue(), makeTrack()), radioTracks: [makeTrack({ requestedBy: "radio" })] }
      expect(getSize(q)).toBe(2)
    })
  })

  describe("isEmpty", () => {
    it("true si cola vacia sin current", () => {
      expect(isEmpty(emptyQueue())).toBe(true)
    })

    it("false si tiene current", () => {
      const q = { ...emptyQueue(), current: makeTrack() }
      expect(isEmpty(q)).toBe(false)
    })
  })

  describe("addRadioTrack", () => {
    it("anade a radioTracks", () => {
      const q = addRadioTrack(emptyQueue(), makeTrack({ requestedBy: "radio" }))
      expect(q.radioTracks).toHaveLength(1)
    })
  })

  describe("clearRadio", () => {
    it("limpia solo radioTracks", () => {
      const q = { ...addTrack(emptyQueue(), makeTrack()), radioTracks: [makeTrack({ requestedBy: "radio" })] }
      const result = clearRadio(q)
      expect(result.radioTracks).toHaveLength(0)
      expect(result.userTracks).toHaveLength(1)
    })
  })

  describe("immutability", () => {
    it("addTrack no muta la cola original", () => {
      const original = emptyQueue()
      addTrack(original, makeTrack())
      expect(original.userTracks).toHaveLength(0)
    })

    it("shuffle no muta la cola original", () => {
      const original = addMultiple(emptyQueue(), [makeTrack({ title: "A" }), makeTrack({ title: "B" })])
      shuffle(original)
      expect(original.userTracks[0].title).toBe("A")
    })
  })

  describe("getAllTracks", () => {
    it("concatena userTracks + radioTracks", () => {
      const q = {
        ...addMultiple(emptyQueue(), [makeTrack({ title: "User1" }), makeTrack({ title: "User2" })]),
        radioTracks: [makeTrack({ title: "Radio1", requestedBy: "radio" })],
      }
      const all = getAllTracks(q)
      expect(all).toHaveLength(3)
      expect(all[0].title).toBe("User1")
      expect(all[2].title).toBe("Radio1")
    })

    it("retorna vacio para cola vacia", () => {
      expect(getAllTracks(emptyQueue())).toEqual([])
    })
  })

  describe("replaceRadioTrack", () => {
    it("reemplaza track de radio por indice", () => {
      const radioTrack = makeTrack({ title: "Old Radio", requestedBy: "radio" })
      const q = { ...emptyQueue(), radioTracks: [radioTrack] }
      const newTrack = makeTrack({ title: "New Radio", requestedBy: "radio" })
      const result = replaceRadioTrack(q, 0, newTrack)
      expect(result.radioTracks[0].title).toBe("New Radio")
    })
  })
})
