import { describe, it, expect } from "vitest"
import { buildRecommendPrompt, buildParsePrompt } from "@/infra/recommendation/groq"

describe("infra/recommendation/groq prompts", () => {
  describe("buildRecommendPrompt", () => {
    it("includes artist and song", () => {
      const prompt = buildRecommendPrompt("Pink Floyd", "Comfortably Numb", 5, [], [])
      expect(prompt).toContain("Pink Floyd")
      expect(prompt).toContain("Comfortably Numb")
      expect(prompt).toContain("5")
    })

    it("includes artist history when provided", () => {
      const prompt = buildRecommendPrompt("Artist", "Song", 3, ["Band A", "Band B"], [])
      expect(prompt).toContain("Band A")
      expect(prompt).toContain("Band B")
    })

    it("includes genre tags when provided", () => {
      const prompt = buildRecommendPrompt("Artist", "Song", 3, [], ["rock", "progressive"])
      expect(prompt).toContain("rock")
      expect(prompt).toContain("progressive")
    })

    it("excludes history text when empty", () => {
      const prompt = buildRecommendPrompt("Artist", "Song", 3, [], [])
      expect(prompt).not.toContain("Recent artists")
    })
  })

  describe("buildParsePrompt", () => {
    it("includes the title", () => {
      const prompt = buildParsePrompt("Pink Floyd - Comfortably Numb (Official Video)")
      expect(prompt).toContain("Pink Floyd - Comfortably Numb")
    })

    it("requests JSON output", () => {
      const prompt = buildParsePrompt("Some Title")
      expect(prompt).toContain("artist")
      expect(prompt).toContain("song")
    })
  })
})
