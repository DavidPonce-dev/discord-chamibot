import { describe, it, expect } from "vitest"
import { createMessageQueue } from "@/shared/message-queue"

describe("shared/message-queue", () => {
  it("executes enqueued function", async () => {
    const mq = createMessageQueue()
    let executed = false
    mq.enqueue("g1", async () => { executed = true })
    await new Promise(r => setTimeout(r, 10))
    expect(executed).toBe(true)
  })

  it("coalesces rapid enqueues for same guild", async () => {
    const mq = createMessageQueue()
    const results: number[] = []
    mq.enqueue("g1", async () => { await new Promise(r => setTimeout(r, 20)); results.push(1) })
    mq.enqueue("g1", async () => { results.push(2) })
    mq.enqueue("g1", async () => { results.push(3) })
    await new Promise(r => setTimeout(r, 80))
    expect(results).toEqual([1, 3])
  })

  it("runs different guilds independently", async () => {
    const mq = createMessageQueue()
    const results: string[] = []
    mq.enqueue("g1", async () => { await new Promise(r => setTimeout(r, 10)); results.push("g1") })
    mq.enqueue("g2", async () => { results.push("g2") })
    await new Promise(r => setTimeout(r, 30))
    expect(results).toContain("g1")
    expect(results).toContain("g2")
  })

  it("clear removes pending state", () => {
    const mq = createMessageQueue()
    mq.enqueue("g1", async () => { await new Promise(r => setTimeout(r, 50)) })
    mq.clear("g1")
  })

  it("handles errors in enqueued functions", async () => {
    const mq = createMessageQueue()
    mq.enqueue("g1", async () => { throw new Error("fail") })
    await new Promise(r => setTimeout(r, 10))
    let secondRan = false
    mq.enqueue("g1", async () => { secondRan = true })
    await new Promise(r => setTimeout(r, 10))
    expect(secondRan).toBe(true)
  })
})
