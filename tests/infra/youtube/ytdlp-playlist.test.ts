import { describe, it, expect } from "vitest"
import { parseYtDlpSearchOutput } from "@/infra/youtube/ytdlp"

describe("infra/youtube/ytdlp playlist output", () => {
  it("keeps the playlist title of flat playlist entries", () => {
    const out = JSON.stringify({
      id: "p1",
      title: "Song",
      url: "https://www.youtube.com/watch?v=p1",
      duration: 235,
      channel: "Artist",
      playlist_title: "Popular Music Videos",
    })
    expect(parseYtDlpSearchOutput(out)[0]).toMatchObject({
      id: "p1",
      url: "https://www.youtube.com/watch?v=p1",
      duration: 235,
      channel: "Artist",
      playlistTitle: "Popular Music Videos",
    })
  })

  it("leaves the playlist title out of plain search results", () => {
    const out = JSON.stringify({ id: "a", title: "Song", url: "https://www.youtube.com/watch?v=a" })
    expect(parseYtDlpSearchOutput(out)[0].playlistTitle).toBeUndefined()
  })
})
