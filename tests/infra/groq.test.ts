import { describe, it, expect, vi, afterEach } from "vitest"
import { createGroqAdapter, buildRecommendPrompt } from "@/infra/recommendation/groq"
import type { LoggerPort } from "@/domain/ports"

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }

const groqResponse = (content: unknown, init: { ok?: boolean; status?: number } = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
  text: async () => "",
})

const stubFetch = (response: unknown) => {
  const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => response)
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("infra/recommendation/groq", () => {
  // The API is called in json_object mode, which can only return an object: asking for a bare
  // array left the key name up to the model
  it("pide un objeto JSON con la clave 'tracks'", () => {
    const prompt = buildRecommendPrompt("Artist", "Song", 3, [], [])
    expect(prompt).toContain('"tracks"')
    expect(prompt).not.toContain("JSON array")
  })

  it("devuelve los candidatos de la clave 'tracks'", async () => {
    stubFetch(groqResponse({ tracks: [{ artist: "Air", name: "Sexy Boy" }, { artist: "Air", name: "" }] }))
    const groq = createGroqAdapter("key", logger)

    const result = await groq.recommend("Air", "La Femme D'argent", new Set(), 5, [], [])

    expect(result).toEqual([{ artist: "Air", name: "Sexy Boy" }])
  })

  it("descarta los candidatos ya escuchados", async () => {
    stubFetch(groqResponse({ tracks: [{ artist: "Air", name: "Sexy Boy" }, { artist: "Air", name: "Venus" }] }))
    const groq = createGroqAdapter("key", logger)

    const result = await groq.recommend("Air", "x", new Set(["air sexy boy"]), 5, [], [])

    expect(result).toEqual([{ artist: "Air", name: "Venus" }])
  })

  it("usa el modelo configurado", async () => {
    const fetchMock = stubFetch(groqResponse({ tracks: [] }))
    const groq = createGroqAdapter("key", logger, "custom-model")

    await groq.recommend("Air", "x", new Set(), 5, [], [])

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("custom-model")
  })

  it("deja registro cuando la API rechaza la peticion", async () => {
    stubFetch(groqResponse({}, { ok: false, status: 401 }))
    const groq = createGroqAdapter("key", logger)

    const result = await groq.recommend("Air", "x", new Set(), 5, [], [])

    expect(result).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith("groq", expect.any(String), expect.objectContaining({ status: 401 }))
  })

  it("no llama a la API sin api key", async () => {
    const fetchMock = stubFetch(groqResponse({ tracks: [] }))
    const groq = createGroqAdapter("", logger)

    expect(await groq.recommend("Air", "x", new Set(), 5, [], [])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
