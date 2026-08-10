type EditFn = () => Promise<void>

type GuildState = {
  editing: boolean
  pending: EditFn | null
}

export const createMessageQueue = () => {
  const state = new Map<string, GuildState>()

  const getState = (guildId: string): GuildState => {
    let s = state.get(guildId)
    if (!s) {
      s = { editing: false, pending: null }
      state.set(guildId, s)
    }
    return s
  }

  const processNext = async (guildId: string, s: GuildState): Promise<void> => {
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

    if (s.pending) {
      processNext(guildId, s)
    }
  }

  return {
    enqueue: (guildId: string, fn: EditFn): void => {
      const s = getState(guildId)
      s.pending = fn
      if (s.editing) return
      processNext(guildId, s)
    },

    clear: (guildId: string): void => {
      state.delete(guildId)
    },
  } as const
}

export type MessageQueue = ReturnType<typeof createMessageQueue>
