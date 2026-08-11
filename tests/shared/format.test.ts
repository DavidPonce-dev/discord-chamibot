import { describe, it, expect } from "vitest"
import { parseDuration, parseDurationSec, formatTime, calcTotalPages, clampPage, paginate, buildProgressBar } from "@/shared/format"

describe("shared/format", () => {
  describe("parseDuration", () => {
    it("parses H:MM:SS", () => {
      expect(parseDuration("1:30:00")).toBe(5400)
    })

    it("parses M:SS", () => {
      expect(parseDuration("3:45")).toBe(225)
    })

    it("parses single number as seconds", () => {
      expect(parseDuration("45")).toBe(45)
    })

    it("returns 0 for undefined", () => {
      expect(parseDuration(undefined)).toBe(0)
    })

    it("returns 0 for empty string", () => {
      expect(parseDuration("")).toBe(0)
    })
  })

  describe("parseDurationSec", () => {
    it("returns number as-is", () => {
      expect(parseDurationSec(120)).toBe(120)
    })

    it("parses string via parseDuration", () => {
      expect(parseDurationSec("2:00")).toBe(120)
    })

    it("returns 0 for null", () => {
      expect(parseDurationSec(null)).toBe(0)
    })

    it("returns 0 for undefined", () => {
      expect(parseDurationSec(undefined)).toBe(0)
    })
  })

  describe("formatTime", () => {
    it("formats seconds to M:SS", () => {
      expect(formatTime(125)).toBe("2:05")
    })

    it("formats hours as H:MM:SS", () => {
      expect(formatTime(3661)).toBe("1:01:01")
    })

    it("formats zero", () => {
      expect(formatTime(0)).toBe("0:00")
    })

    it("fractional mode preserves decimals", () => {
      const result = formatTime(65.5, true)
      expect(result).toContain("1:")
    })
  })

  describe("calcTotalPages", () => {
    it("returns 1 for empty list", () => {
      expect(calcTotalPages(0, 3)).toBe(1)
    })

    it("returns correct pages", () => {
      expect(calcTotalPages(10, 3)).toBe(4)
    })

    it("returns 1 when items fit in one page", () => {
      expect(calcTotalPages(3, 5)).toBe(1)
    })
  })

  describe("clampPage", () => {
    it("clamps below 1", () => {
      expect(clampPage(-1, 5)).toBe(1)
    })

    it("clamps above totalPages", () => {
      expect(clampPage(10, 5)).toBe(5)
    })

    it("returns valid page as-is", () => {
      expect(clampPage(3, 5)).toBe(3)
    })
  })

  describe("paginate", () => {
    const items = [1, 2, 3, 4, 5, 6, 7]

    it("returns first page", () => {
      const result = paginate(items, 1, 3)
      expect(result.pageItems).toEqual([1, 2, 3])
      expect(result.page).toBe(1)
      expect(result.totalPages).toBe(3)
      expect(result.startIdx).toBe(0)
    })

    it("returns middle page", () => {
      const result = paginate(items, 2, 3)
      expect(result.pageItems).toEqual([4, 5, 6])
      expect(result.startIdx).toBe(3)
    })

    it("returns last partial page", () => {
      const result = paginate(items, 3, 3)
      expect(result.pageItems).toEqual([7])
    })

    it("clamps out-of-range page", () => {
      const result = paginate(items, 99, 3)
      expect(result.page).toBe(3)
    })

    it("handles empty array", () => {
      const result = paginate([], 1, 3)
      expect(result.pageItems).toEqual([])
      expect(result.totalPages).toBe(1)
    })
  })

  describe("buildProgressBar", () => {
    it("builds bar with position and total", () => {
      const bar = buildProgressBar(30, 120)
      expect(bar).toContain("[")
      expect(bar).toContain("]")
      expect(bar).toContain("0:30")
      expect(bar).toContain("2:00")
    })

    it("handles zero total", () => {
      const bar = buildProgressBar(0, 0)
      expect(bar).toContain("?:??")
    })

    it("respects custom width", () => {
      const bar = buildProgressBar(50, 100, 10)
      const bracketContent = bar.match(/\[(.+?)\]/)![1]
      expect(bracketContent.length).toBe(10)
    })

    it("clamps position above total", () => {
      const bar = buildProgressBar(130, 120)
      const bracketContent = bar.match(/\[(.+?)\]/)![1]
      expect(bracketContent).not.toContain("\u2591")
      expect(bracketContent.length).toBe(24)
    })

    it("clamps negative position", () => {
      const bar = buildProgressBar(-5, 120)
      const bracketContent = bar.match(/\[(.+?)\]/)![1]
      expect(bracketContent).not.toContain("\u2588")
      expect(bracketContent.length).toBe(24)
    })
  })
})
