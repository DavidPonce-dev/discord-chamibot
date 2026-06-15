import { config } from "@/config"
import { logger } from "@/utils/logger"

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

export interface ParsedTrack {
  artist: string | null
  song: string | null
}

function buildPrompt(title: string): string {
  return `You are a music track identifier. Given a YouTube video title, extract the artist name and song title.
Rules:
- Return ONLY valid JSON with keys "artist" and "song"
- Use null for a field if you cannot determine it
- The artist is the performer/band, NOT the channel name
- For non-music content, set both to null

Title: ${title}`
}

export async function parseTrackTitle(title: string): Promise<ParsedTrack | null> {
  if (!config.groq?.apiKey) return null

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
            content: buildPrompt(title),
          },
        ],
        temperature: 0.1,
        max_tokens: 100,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      logger.warn("llm", "Groq API error", { status: response.status })
      return null
    }

    const data = await response.json() as { choices: { message: { content: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (!content) return null

    const parsed = JSON.parse(content) as ParsedTrack
    return parsed
  } catch (err) {
    logger.debug("llm", "Groq request failed", { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}
