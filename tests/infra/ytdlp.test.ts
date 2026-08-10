import { describe, it, expect } from "vitest"
import { buildYtDlpArgs, parseYtDlpSearchOutput, searchYtDlp } from "@/infra/youtube/ytdlp"
import type { CookieStorePort } from "@/domain/ports"

const mockCookieStore = (filePath: string | null): CookieStorePort => ({
  read: () => null,
  write: () => {},
  validate: () => ({ isValid: false, cookieCount: 0, cookieNames: [], hasPSID: false, hasSID: false, lastModified: null }),
  delete: () => {},
  filePath: () => filePath,
})

describe("infra/youtube/ytdlp", () => {
  describe("buildYtDlpArgs", () => {
    it("builds base args with user agent", () => {
      const args = buildYtDlpArgs(["--get-url"], mockCookieStore(null))
      expect(args).toContain("--get-url")
      expect(args).toContain("--user-agent")
      expect(args).toContain("--js-runtimes")
      expect(args).toContain("deno")
    })

    it("includes extra args", () => {
      const args = buildYtDlpArgs(["--get-url"], mockCookieStore(null), ["--format", "bestaudio"])
      expect(args).toContain("--format")
      expect(args).toContain("bestaudio")
    })

    it("does not include cookies when no cookie file", () => {
      const args = buildYtDlpArgs(["--get-url"], mockCookieStore(null))
      expect(args).not.toContain("--cookies")
    })

    it("does not include cookies when file does not exist", () => {
      const args = buildYtDlpArgs(["--get-url"], mockCookieStore("/nonexistent/cookies.txt"))
      expect(args).not.toContain("--cookies")
    })
  })

  describe("parseYtDlpSearchOutput", () => {
    it("parses multiple JSON lines into entries", () => {
      const out = [
        JSON.stringify({ id: "abc123", title: "Song One", url: "https://youtube.com/watch?v=abc123", duration: 240, channel: "Artist" }),
        JSON.stringify({ id: "def456", title: "Song Two", duration: 180 }),
      ].join("\n")
      const entries = parseYtDlpSearchOutput(out)
      expect(entries).toHaveLength(2)
      expect(entries[0]).toEqual({
        id: "abc123",
        title: "Song One",
        url: "https://youtube.com/watch?v=abc123",
        duration: 240,
        channel: "Artist",
        track: undefined,
        artist: undefined,
        album: undefined,
      })
      expect(entries[1].url).toBe("https://www.youtube.com/watch?v=def456")
    })

    it("skips malformed lines", () => {
      const out = ['{"id":"ok","title":"T"}', "not json", "", "{broken", '{"url":""}'].join("\n")
      const entries = parseYtDlpSearchOutput(out)
      expect(entries).toHaveLength(1)
      expect(entries[0].id).toBe("ok")
    })

    it("maps flat playlist entries (no duration)", () => {
      const out = JSON.stringify({ id: "PL123", title: "Best of 80s", url: "https://www.youtube.com/playlist?list=PL123" })
      const entries = parseYtDlpSearchOutput(out)
      expect(entries[0].duration).toBeUndefined()
      expect(entries[0].url).toContain("playlist")
    })

    it("maps track/artist/album enrichment fields", () => {
      const out = JSON.stringify({ id: "x", title: "T", duration: 10, track: "Song", artist: "Artist", album: "Album" })
      const entries = parseYtDlpSearchOutput(out)
      expect(entries[0].track).toBe("Song")
      expect(entries[0].artist).toBe("Artist")
      expect(entries[0].album).toBe("Album")
    })
  })

  describe("searchYtDlp", () => {
    it("returns empty array for empty query without spawning", async () => {
      const entries = await searchYtDlp("   ", 5, mockCookieStore(null))
      expect(entries).toEqual([])
    })

    it("returns empty array for limit <= 0", async () => {
      const entries = await searchYtDlp("queen", 0, mockCookieStore(null))
      expect(entries).toEqual([])
    })
  })
})
