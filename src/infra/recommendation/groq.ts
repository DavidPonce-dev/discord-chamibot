import type { GroqPort, LoggerPort } from "../../domain/ports"
import type { GroqCandidate, ParsedTrack } from "../../domain/types"
import { getErrorMessage } from "../../shared/error"
import { GROQ_RECOMMEND_TIMEOUT_MS, GROQ_PARSE_TIMEOUT_MS } from "../../config/timeouts"

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
const DEFAULT_MODEL = "llama-3.3-70b-versatile"

type GroqClient = Readonly<{ apiKey: string; model: string; logger?: LoggerPort }>

type GroqRequest = {
  model?: string
  messages: { role: string; content: string }[]
  temperature?: number
  max_tokens?: number
  response_format?: { type: string }
}

const groqCall = async <T>(client: GroqClient, req: GroqRequest, timeoutMs: number): Promise<T | null> => {
  const { apiKey, model, logger } = client
  if (!apiKey) return null

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, ...req }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    // Failures used to be silent: a revoked key or a retired model just looked like "no suggestions"
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      logger?.warn("groq", "Groq rechazo la peticion", { status: response.status, model, body: body.slice(0, 200) })
      return null
    }

    const data = await response.json() as { choices: { message: { content: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (!content) return null

    return JSON.parse(content) as T
  } catch (e: unknown) {
    logger?.warn("groq", "Fallo la llamada a Groq", { model, error: getErrorMessage(e) })
    return null
  }
}

export const buildRecommendPrompt = (
  artist: string,
  song: string,
  limit: number,
  artistHistory: readonly string[],
  genreTags: readonly string[],
): string => {
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
- Return ONLY a valid JSON object with a "tracks" key: a list of objects with keys "artist" and "name"
- Example: {"tracks": [{"artist": "Band Name", "name": "Song Title"}]}

Track: "${song}" by ${artist}`
}

export const buildParsePrompt = (title: string): string =>
  `You are a music track identifier. Given a YouTube video title, extract the artist name and song title.
Rules:
- Return ONLY valid JSON with keys "artist" and "song"
- Use null for a field if you cannot determine it
- The artist is the performer/band, NOT the channel name
- For non-music content, set both to null

Title: ${title}`

export const createGroqAdapter = (apiKey: string, logger?: LoggerPort, model: string = DEFAULT_MODEL): GroqPort => {
  const client: GroqClient = { apiKey, model, logger }

  const recommend = async (
    artist: string,
    song: string,
    excludeTitles: ReadonlySet<string>,
    limit: number,
    artistHistory: readonly string[],
    genreTags: readonly string[],
  ): Promise<readonly GroqCandidate[]> => {
    const result = await groqCall<unknown>(client, {
      messages: [{ role: "user", content: buildRecommendPrompt(artist, song, limit, artistHistory, genreTags) }],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: "json_object" },
    }, GROQ_RECOMMEND_TIMEOUT_MS)

    if (!result) return []

    const raw = Array.isArray(result)
      ? result
      : (result as Record<string, unknown>).tracks ?? (result as Record<string, unknown>).suggestions ?? []
    const candidates = Array.isArray(raw) ? raw : []

    return candidates
      .filter((c: GroqCandidate): c is GroqCandidate => {
        if (!c.artist || !c.name) return false
        const full = `${c.artist} ${c.name}`.toLowerCase()
        return !excludeTitles.has(full)
      })
      .slice(0, limit)
  }

  const parseTitle = async (title: string): Promise<ParsedTrack | null> => {
    return groqCall<ParsedTrack>(client, {
      messages: [{ role: "user", content: buildParsePrompt(title) }],
      temperature: 0.1,
      max_tokens: 100,
      response_format: { type: "json_object" },
    }, GROQ_PARSE_TIMEOUT_MS)
  }

  return { recommend, parseTitle } as const
}
