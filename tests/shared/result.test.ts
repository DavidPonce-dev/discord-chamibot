import { describe, it, expect } from "vitest"
import { ok, err } from "@/shared/result"

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
})
