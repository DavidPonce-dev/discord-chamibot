import { config } from "@/config"
import { logger } from "@/utils/logger"

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

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
  if (!config.groq?.apiKey) return []

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.groq.apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: buildPrompt(artist, song, limit, artistHistory, genreTags),
          },
        ],
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      logger.warn("radio", "Groq recommend API error", { status: response.status })
      return []
    }

    const data = await response.json() as { choices: { message: { content: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (!content) return []

    const parsed = JSON.parse(content)
    const candidates = Array.isArray(parsed) ? parsed : parsed.suggestions ?? parsed.tracks ?? []

    return candidates
      .filter((c: GroqCandidate) => {
        if (!c.artist || !c.name) return false
        const full = `${c.artist} ${c.name}`.toLowerCase()
        return !excludeTitles.has(full)
      })
      .slice(0, limit) as GroqCandidate[]
  } catch (err) {
    logger.debug("radio", "Groq recommend request failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
