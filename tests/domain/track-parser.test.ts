import { describe, it, expect } from "vitest"
import { extractArtist, extractSong, youtubeThumbnail, sanitizeYouTubeUrl, extractVideoId } from "@/domain/track-parser"

describe("domain/track-parser", () => {
  describe("youtubeThumbnail", () => {
    it("genera URL correcta", () => {
      expect(youtubeThumbnail("abc123")).toBe("https://img.youtube.com/vi/abc123/hqdefault.jpg")
    })
  })

  describe("extractArtist", () => {
    it("extrae artista con dash", () => {
      expect(extractArtist("Pink Floyd - Comfortably Numb")).toBe("Pink Floyd")
    })

    it("extrae artista con feat", () => {
      expect(extractArtist("Drake feat. Rihanna")).toBe("Drake")
    })

    it("extrae artista con brackets japoneses", () => {
      expect(extractArtist("Babymetal「Gimme Chocolate」")).toBe("Babymetal")
    })

    it("retorna vacio si no puede determinar", () => {
      expect(extractArtist("Just a song title")).toBe("")
    })

    it("maneja artista con colon", () => {
      expect(extractArtist("Queen: Bohemian Rhapsody")).toBe("Queen")
    })
  })

  describe("extractSong", () => {
    it("extrae cancion con dash", () => {
      expect(extractSong("Pink Floyd - Comfortably Numb")).toBe("Comfortably Numb")
    })

    it("extrae cancion con brackets japoneses", () => {
      expect(extractSong("Babymetal「Gimme Chocolate」")).toBe("Gimme Chocolate")
    })
  })

  describe("sanitizeYouTubeUrl", () => {
    it("limpia URL con parametros extra", () => {
      expect(sanitizeYouTubeUrl("https://www.youtube.com/watch?v=abc123&t=60")).toBe("https://www.youtube.com/watch?v=abc123")
    })

    it("retorna URL sin cambios si no tiene v param", () => {
      expect(sanitizeYouTubeUrl("https://example.com")).toBe("https://example.com")
    })
  })

  describe("extractVideoId", () => {
    it("extrae ID de URL", () => {
      expect(extractVideoId("https://www.youtube.com/watch?v=abc123")).toBe("abc123")
    })

    it("retorna undefined si no hay ID", () => {
      expect(extractVideoId("https://example.com")).toBeUndefined()
    })
  })
})
