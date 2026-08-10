import { describe, it, expect, vi } from "vitest"
import { createSearchUseCases } from "@/usecases/search"
import { createMockPorts } from "../usecases/mock-ports"

describe("usecases/search", () => {
  it("autocomplete delegates to search.autocomplete", async () => {
    const autocomplete = vi.fn().mockResolvedValue([
      { name: "Song A", value: "https://youtube.com/watch?v=a" },
    ])
    const ports = createMockPorts({ search: { ...createMockPorts().search, autocomplete } })
    const search = createSearchUseCases(ports)
    const result = await search.autocomplete("test query")
    expect(autocomplete).toHaveBeenCalledWith("test query")
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Song A")
  })
})
