export interface Track {
  title: string
  url: string
  requestedBy: string
  duration?: string
  id?: string
  thumbnail?: string
}

export type LoopMode = "none" | "one" | "all"
