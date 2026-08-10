import { describe, it, expect } from "vitest"
import { ok, err, mapR, flatMapR, matchR, tap, pipe, pipe2, pipe3, pipe4 } from "@/shared/result"

describe("shared/result", () => {
  describe("ok / err", () => {
    it("crea resultado exitoso", () => {
      const r = ok(42)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value).toBe(42)
    })

    it("crea resultado con error", () => {
      const r = err("fail")
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toBe("fail")
    })
  })

  describe("mapR", () => {
    it("mapea valor en ok", () => {
      const r = mapR(ok(10), v => v * 2)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value).toBe(20)
    })

    it("no mapea en err", () => {
      const r = mapR(err("fail"), (v: number) => v * 2)
      expect(r.ok).toBe(false)
    })
  })

  describe("flatMapR", () => {
    it("encadena resultados ok", () => {
      const r = flatMapR(ok(10), v => v > 5 ? ok(v * 2) : err("too small"))
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value).toBe(20)
    })

    it("propaga error", () => {
      const r = flatMapR(ok(3), v => v > 5 ? ok(v * 2) : err("too small"))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toBe("too small")
    })

    it("no ejecuta fn en err", () => {
      let called = false
      flatMapR(err("fail"), (v: number) => { called = true; return ok(v) })
      expect(called).toBe(false)
    })
  })

  describe("matchR", () => {
    it("ejecuta handler ok", () => {
      const result = matchR(ok(42), {
        ok: v => `value: ${v}`,
        err: e => `error: ${e}`,
      })
      expect(result).toBe("value: 42")
    })

    it("ejecuta handler err", () => {
      const result = matchR(err("oops"), {
        ok: (v: number) => `value: ${v}`,
        err: e => `error: ${e}`,
      })
      expect(result).toBe("error: oops")
    })
  })

  describe("tap", () => {
    it("ejecuta side effect y retorna valor", () => {
      let sideEffect = 0
      const fn = tap<number>(v => { sideEffect = v })
      const result = fn(42)
      expect(result).toBe(42)
      expect(sideEffect).toBe(42)
    })
  })

  describe("pipe", () => {
    it("returns value as-is", () => {
      expect(pipe(42)).toBe(42)
    })
  })

  describe("pipe2", () => {
    it("applies one function", () => {
      expect(pipe2(10, v => v * 2)).toBe(20)
    })
  })

  describe("pipe3", () => {
    it("applies two functions in sequence", () => {
      expect(pipe3(5, v => v + 1, v => v * 3)).toBe(18)
    })
  })

  describe("pipe4", () => {
    it("applies three functions in sequence", () => {
      expect(pipe4(2, v => v + 1, v => v * 2, v => v - 1)).toBe(5)
    })
  })
})
