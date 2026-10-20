import { describe, it, expect } from "vitest"
import { extractArtist, extractSong, parseTitle, trackNames, displayTitle, youtubeThumbnail, sanitizeYouTubeUrl, extractVideoId } from "@/domain/track-parser"

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

  describe("parseTitle (titulos reales de YouTube)", () => {
    it.each([
      ["Daft Punk - One More Time (Official Video)", "Daft Punk", "One More Time"],
      // Album after "|" must not be taken as the song
      ["Bad Bunny - Tití Me Preguntó (Official Video) | Un Verano Sin Ti", "Bad Bunny", "Tití Me Preguntó"],
      ["Bad Bunny (ft. Chencho Corleone) - Me Porto Bonito (Official Video) | Un Verano Sin Ti", "Bad Bunny", "Me Porto Bonito"],
      // Featuring after the song must not swallow the artist or replace the song
      ["Calvin Harris - Summer ft. Ellie Goulding", "Calvin Harris", "Summer"],
      ["Shakira - Hips Dont Lie feat. Wyclef Jean", "Shakira", "Hips Dont Lie"],
      ["Daft Punk - Get Lucky (Official Audio) ft. Pharrell Williams, Nile Rodgers", "Daft Punk", "Get Lucky"],
      ["Artist ft. Other - Song (Lyrics)", "Artist", "Song"],
      // Trailing segments / noise
      ["The Weeknd - Blinding Lights | Official Video", "The Weeknd", "Blinding Lights"],
      ["Coldplay - Yellow - Live in Buenos Aires", "Coldplay", "Yellow"],
      ["AIR - La femme d'argent (from Moon Safari - Official Audio)", "AIR", "La femme d'argent"],
      ["Metallica: One (Official Music Video)", "Metallica", "One"],
      // Hyphen inside a name is not a separator
      ["Jay-Z - 99 Problems", "Jay-Z", "99 Problems"],
    ])("%s", (title, artist, song) => {
      expect(parseTitle(title)).toEqual({ artist, song })
    })

    it("keeps titles without a separator as the song", () => {
      expect(parseTitle("Video Killed the Radio Star")).toEqual({ artist: "", song: "Video Killed the Radio Star" })
    })

    it("drops separators left over after removing brackets", () => {
      expect(parseTitle("Ella Baila Sola - (Video Oficial) - Eslabon Armado - DEL Records 2023").song).toBe("Eslabon Armado")
    })
  })

  describe("parseTitle con el canal como pista", () => {
    it("usa el canal como artista si el titulo no lo trae", () => {
      expect(parseTitle("Karma Police", "Radiohead")).toEqual({ artist: "Radiohead", song: "Karma Police" })
      expect(parseTitle("Persiana Americana", "Soda Stereo - Topic")).toEqual({ artist: "Soda Stereo", song: "Persiana Americana" })
    })

    it("quita el nombre del artista al inicio de la cancion", () => {
      expect(parseTitle("The Weeknd Blinding Lights", "TheWeekndVEVO")).toEqual({ artist: "The Weeknd", song: "Blinding Lights" })
    })

    it("corrige titulos invertidos (cancion - artista)", () => {
      expect(parseTitle("La Bachata - MTZ Manuel Turizo | Video Oficial", "Manuel Turizo")).toEqual({ artist: "Manuel Turizo", song: "La Bachata" })
    })

    it("no cambia un titulo bien formado", () => {
      expect(parseTitle("Miley Cyrus - Flowers (Official Video)", "MILEY")).toEqual({ artist: "Miley Cyrus", song: "Flowers" })
      expect(parseTitle("Daft Punk - One More Time", "Daft Punk")).toEqual({ artist: "Daft Punk", song: "One More Time" })
    })

    it("ignora canales que no son del artista (lyrics, sellos, recopilaciones)", () => {
      expect(parseTitle("Blinding Lights", "7clouds Lyrics")).toEqual({ artist: "", song: "Blinding Lights" })
      expect(parseTitle("Ella Baila Sola", "DEL Records")).toEqual({ artist: "", song: "Ella Baila Sola" })
    })
  })

  describe("trackNames / displayTitle", () => {
    it("prefiere artista/cancion guardados", () => {
      const track = { title: "Raw Upload Title [HD]", artist: "Air", song: "Sexy Boy" }
      expect(trackNames(track)).toEqual({ artist: "Air", song: "Sexy Boy" })
      expect(displayTitle(track)).toBe("Air - Sexy Boy")
    })

    it("usa el titulo canonico (Last.fm) antes que el titulo de YouTube", () => {
      const track = { title: "AIR - Sexy Boy (from Moon Safari - Official Audio) | HD", canonicalTitle: "Air - Sexy Boy" }
      expect(displayTitle(track)).toBe("Air - Sexy Boy")
    })

    it("muestra solo la cancion si no hay artista", () => {
      expect(displayTitle({ title: "Video Killed the Radio Star" })).toBe("Video Killed the Radio Star")
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
