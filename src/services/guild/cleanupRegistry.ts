type CleanupFn = (guildId: string) => void

const cleanupCallbacks: CleanupFn[] = []
const preDestroyCallbacks: CleanupFn[] = []

export function registerCleanup(cb: CleanupFn) {
  cleanupCallbacks.push(cb)
}

export function registerPreDestroyCleanup(cb: CleanupFn) {
  preDestroyCallbacks.push(cb)
}

export function runPreDestroyCleanup(guildId: string) {
  for (const cb of preDestroyCallbacks) {
    cb(guildId)
  }
}

export function runCleanup(guildId: string) {
  for (const cb of cleanupCallbacks) {
    cb(guildId)
  }
}
