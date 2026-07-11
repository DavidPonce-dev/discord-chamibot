/**
 * Last-edit-wins message queue.
 *
 * When multiple edits target the same guild, only the LAST one executes.
 * Intermediate requests are discarded. No queue buildup.
 *
 * Usage:
 *   const queue = new MessageQueue()
 *   queue.enqueue("guild1", () => msg.edit(payload))
 */

type EditFn = () => Promise<void>

type GuildState = {
  editing: boolean
  pending: EditFn | null
}

export class MessageQueue {
  private state = new Map<string, GuildState>()

  private getState(guildId: string): GuildState {
    let s = this.state.get(guildId)
    if (!s) {
      s = { editing: false, pending: null }
      this.state.set(guildId, s)
    }
    return s
  }

  enqueue(guildId: string, fn: EditFn) {
    const s = this.getState(guildId)
    s.pending = fn // always overwrite — only the last one matters

    if (s.editing) return // current edit will pick up pending when done

    this.processNext(guildId, s)
  }

  private async processNext(guildId: string, s: GuildState) {
    if (!s.pending) return

    s.editing = true
    const task = s.pending
    s.pending = null

    try {
      await task()
    } catch {
      // errors are handled by the caller's task
    } finally {
      s.editing = false
    }

    // if another request came in while we were editing, process it
    if (s.pending) {
      this.processNext(guildId, s)
    }
  }

  clear(guildId: string) {
    this.state.delete(guildId)
  }
}
