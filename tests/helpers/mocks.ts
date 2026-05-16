import { vi } from "vitest"
import type { Track } from "../../src/core/types"
import type { AudioResource } from "@discordjs/voice"

export function createMockTrack(overrides: Partial<Track> = {}): Track {
  return {
    title: "Test Track",
    url: "https://youtube.com/watch?v=test123",
    requestedBy: "tester",
    duration: "3:30",
    id: "test123",
    thumbnail: "https://img.youtube.com/vi/test123/hqdefault.jpg",
    ...overrides,
  }
}

export function createMockVoiceConnection() {
  return {
    subscribe: vi.fn(),
    destroy: vi.fn(),
    joinConfig: { guildId: "test-guild" },
    on: vi.fn(),
  }
}

export function createMockAudioService() {
  return {
    createResource: vi.fn().mockResolvedValue({} as AudioResource),
    killProcess: vi.fn(),
  }
}

export function createMockRadioService() {
  return {
    findRelated: vi.fn().mockResolvedValue(null),
  }
}

export function createMockTrackScheduler(overrides: Record<string, any> = {}) {
  return {
    add: vi.fn(),
    addMultiple: vi.fn(),
    addNext: vi.fn(),
    getQueue: vi.fn().mockReturnValue([]),
    getCurrentTrack: vi.fn().mockReturnValue(null),
    getSize: vi.fn().mockReturnValue(0),
    getPosition: vi.fn().mockReturnValue(0),
    shuffle: vi.fn(),
    remove: vi.fn().mockReturnValue(null),
    moveUp: vi.fn().mockReturnValue(false),
    moveDown: vi.fn().mockReturnValue(false),
    toggleLoop: vi.fn().mockReturnValue("none"),
    getLoopMode: vi.fn().mockReturnValue("none"),
    seek: vi.fn(),
    clear: vi.fn(),
    skip: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    isPaused: vi.fn().mockReturnValue(false),
    togglePause: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    toggleAutoplay: vi.fn().mockReturnValue(false),
    isAutoplayEnabled: vi.fn().mockReturnValue(false),
    onTrackChange: undefined,
    onDisconnect: undefined,
    ...overrides,
  }
}
