import { describe, it, expect } from "vitest"
import { getErrorMessage } from "@/shared/error"

describe("shared/error", () => {
  it("extracts message from Error", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom")
  })

  it("stringifies non-Error values", () => {
    expect(getErrorMessage("string error")).toBe("string error")
    expect(getErrorMessage(42)).toBe("42")
    expect(getErrorMessage(null)).toBe("null")
  })
})
