type LogLevel = "info" | "warn" | "error" | "debug" | "event"

const COLORS: Record<LogLevel, string> = {
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  debug: "\x1b[90m",
  event: "\x1b[32m",
}

const RESET = "\x1b[0m"

function pad(str: string, len: number): string {
  return str.padEnd(len)
}

function log(level: LogLevel, service: string, message: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19)
  const color = COLORS[level] ?? ""
  const tag = `[${timestamp}] ${pad(`[${level.toUpperCase()}]`, 8)} ${pad(`[${service}]`, 20)} ${message}`

  if (level === "error") {
    console.error(color + tag + RESET, meta ?? "")
  } else if (level === "warn") {
    console.warn(color + tag + RESET, meta ?? "")
  } else {
    console.log(color + tag + RESET, meta ?? "")
  }
}

import type { LoggerPort } from "../domain/ports"

export const createLogger = (): LoggerPort => ({
  info: (service: string, message: string, meta?: Record<string, unknown>) => log("info", service, message, meta),
  warn: (service: string, message: string, meta?: Record<string, unknown>) => log("warn", service, message, meta),
  error: (service: string, message: string, meta?: Record<string, unknown>) => log("error", service, message, meta),
  debug: (service: string, message: string, meta?: Record<string, unknown>) => log("debug", service, message, meta),
  event: (service: string, message: string, meta?: Record<string, unknown>) => log("event", service, message, meta),
})
