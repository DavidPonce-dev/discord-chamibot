import { config } from "@/config"
import { logger } from "@/utils/logger"

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

type GroqRequest = {
  model?: string
  messages: { role: string; content: string }[]
  temperature?: number
  max_tokens?: number
  response_format?: { type: string }
}

export async function groqCall<T>(req: GroqRequest, timeoutMs = 8000): Promise<T | null> {
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
        ...req,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      logger.warn("llm", "Groq API error", { status: response.status })
      return null
    }

    const data = await response.json() as { choices: { message: { content: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (!content) return null

    return JSON.parse(content) as T
  } catch (err) {
    logger.debug("llm", "Groq request failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
