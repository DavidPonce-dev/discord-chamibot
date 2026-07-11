import { groqCall } from "./GroqClient"

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
  return groqCall<ParsedTrack>({
    messages: [{ role: "user", content: buildPrompt(title) }],
    temperature: 0.1,
    max_tokens: 100,
    response_format: { type: "json_object" },
  }, 5000)
}
