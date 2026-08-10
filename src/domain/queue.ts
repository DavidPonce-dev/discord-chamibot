import type { Queue, Track } from "./types"
import { ok, err, type Result } from "../shared/result"

export const emptyQueue = (): Queue => ({
  userTracks: [],
  radioTracks: [],
  current: null,
  loopMode: "none",
})

export const addTrack = (q: Queue, track: Track): Queue => ({
  ...q,
  userTracks: [...q.userTracks, track],
  radioTracks: [],
})

export const addNext = (q: Queue, track: Track): Queue => ({
  ...q,
  userTracks: [track, ...q.userTracks],
})

export const addMultiple = (q: Queue, tracks: readonly Track[]): Queue => ({
  ...q,
  userTracks: [...q.userTracks, ...tracks],
  radioTracks: [],
})

export const dequeue = (q: Queue, autoplay: boolean): { readonly track: Track | null; readonly queue: Queue } => {
  if (q.userTracks.length > 0) {
    const [track, ...rest] = q.userTracks
    return { track, queue: { ...q, userTracks: rest, current: track } }
  }
  if (autoplay && q.radioTracks.length > 0) {
    const [track, ...rest] = q.radioTracks
    return { track, queue: { ...q, radioTracks: rest, current: track } }
  }
  return { track: null, queue: q }
}

export const removeTrack = (q: Queue, index: number): Result<{ readonly track: Track; readonly queue: Queue }, "out_of_bounds"> => {
  const all = getAllTracks(q)
  if (index < 0 || index >= all.length) return err("out_of_bounds")
  const removed = all[index]
  if (index < q.userTracks.length) {
    return ok({
      track: removed,
      queue: { ...q, userTracks: q.userTracks.filter((_, i) => i !== index) },
    })
  }
  const radioIdx = index - q.userTracks.length
  return ok({
    track: removed,
    queue: { ...q, radioTracks: q.radioTracks.filter((_, i) => i !== radioIdx) },
  })
}

export const moveUp = (q: Queue, index: number): Result<Queue, "invalid"> => {
  const all = getAllTracks(q)
  if (index <= 0 || index >= all.length) return err("invalid")

  if (index < q.userTracks.length) {
    const newUser = [...q.userTracks]
    const temp = newUser[index]
    newUser[index] = newUser[index - 1]
    newUser[index - 1] = temp
    return ok({ ...q, userTracks: newUser })
  }

  const radioIdx = index - q.userTracks.length
  if (radioIdx === 0) return err("invalid")
  const newRadio = [...q.radioTracks]
  const temp = newRadio[radioIdx]
  newRadio[radioIdx] = newRadio[radioIdx - 1]
  newRadio[radioIdx - 1] = temp
  return ok({ ...q, radioTracks: newRadio })
}

export const moveDown = (q: Queue, index: number): Result<Queue, "invalid"> => {
  const all = getAllTracks(q)
  if (index < 0 || index >= all.length - 1) return err("invalid")

  if (index < q.userTracks.length) {
    if (index === q.userTracks.length - 1) return err("invalid")
    const newUser = [...q.userTracks]
    const temp = newUser[index]
    newUser[index] = newUser[index + 1]
    newUser[index + 1] = temp
    return ok({ ...q, userTracks: newUser })
  }

  const radioIdx = index - q.userTracks.length
  if (radioIdx >= q.radioTracks.length - 1) return err("invalid")
  const newRadio = [...q.radioTracks]
  const temp = newRadio[radioIdx]
  newRadio[radioIdx] = newRadio[radioIdx + 1]
  newRadio[radioIdx + 1] = temp
  return ok({ ...q, radioTracks: newRadio })
}

export const shuffle = (q: Queue): Queue => {
  const combined = fisherYates([...q.userTracks, ...q.radioTracks])
  return {
    ...q,
    userTracks: combined.filter(t => t.requestedBy !== "radio"),
    radioTracks: combined.filter(t => t.requestedBy === "radio"),
  }
}

export const toggleLoop = (q: Queue): Queue => ({
  ...q,
  loopMode: q.loopMode === "none" ? "one" : q.loopMode === "one" ? "all" : "none",
})

export const applyLoop = (q: Queue, finished: Track): Queue => {
  if (q.loopMode === "one") {
    return finished.requestedBy === "radio"
      ? { ...q, radioTracks: [{ ...finished }, ...q.radioTracks] }
      : { ...q, userTracks: [{ ...finished }, ...q.userTracks] }
  }
  if (q.loopMode === "all") {
    return finished.requestedBy === "radio"
      ? { ...q, radioTracks: [...q.radioTracks, { ...finished }] }
      : { ...q, userTracks: [...q.userTracks, { ...finished }] }
  }
  return q
}

export const clear = (q: Queue): Queue => ({
  ...q,
  userTracks: [],
  radioTracks: [],
})

export const getAllTracks = (q: Queue): readonly Track[] => [...q.userTracks, ...q.radioTracks]

export const getSize = (q: Queue): number => q.userTracks.length + q.radioTracks.length

export const isEmpty = (q: Queue): boolean => getSize(q) === 0 && !q.current

export const addRadioTrack = (q: Queue, track: Track): Queue => ({
  ...q,
  radioTracks: [...q.radioTracks, track],
})

export const replaceRadioTrack = (q: Queue, radioIndex: number, track: Track): Queue => {
  const newRadio = [...q.radioTracks]
  newRadio[radioIndex] = track
  return { ...q, radioTracks: newRadio }
}

export const clearRadio = (q: Queue): Queue => ({
  ...q,
  radioTracks: [],
})

const fisherYates = <T>(arr: T[]): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
