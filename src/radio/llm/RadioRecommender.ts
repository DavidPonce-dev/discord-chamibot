import { groqCall } from "./GroqClient"

export interface GroqCandidate {
  name: string
  artist: string
}

function buildPrompt(
  artist: string,
  song: string,
  limit: number,
  artistHistory: string[],
  genreTags: string[],
): string {
  const recentArtists = artistHistory.length
    ? `Recent artists in this session: ${artistHistory.join(", ")}`
    : ""

  const genreContext = genreTags.length
    ? `Genre/Style context (Last.fm tags): ${genreTags.join(", ")}`
    : ""

  return `You are a music curator for an autoplay radio.
Given a track, suggest ${limit} songs.

Rules:
- Prioritize songs by the SAME artist "${artist}" first
- If no more tracks by that artist available, suggest songs by artists from the SAME genre or similar style
${recentArtists}
${genreContext}
- Do NOT suggest the original track
- Return ONLY a valid JSON array of objects with keys "artist" and "name"
- Example: [{"artist": "Band Name", "name": "Song Title"}]

Track: "${song}" by ${artist}`
}

export async function groqRecommend(
  artist: string,
  song: string,
  excludeTitles: Set<string>,
  limit = 5,
  artistHistory: string[] = [],
  genreTags: string[] = [],
): Promise<GroqCandidate[]> {
  const result = await groqCall<unknown>({
    messages: [{ role: "user", content: buildPrompt(artist, song, limit, artistHistory, genreTags) }],
    temperature: 0.3,
    max_tokens: 300,
    response_format: { type: "json_object" },
  })

  if (!result) return []

  const raw = Array.isArray(result) ? result : (result as Record<string, unknown>).suggestions ?? (result as Record<string, unknown>).tracks ?? []
  const candidates = Array.isArray(raw) ? raw : []

  return candidates
    .filter((c: GroqCandidate) => {
      if (!c.artist || !c.name) return false
      const full = `${c.artist} ${c.name}`.toLowerCase()
      return !excludeTitles.has(full)
    })
    .slice(0, limit) as GroqCandidate[]
}
