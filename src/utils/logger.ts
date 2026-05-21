type LogLevel = "info" | "warn" | "error" | "debug" | "event"

const COLORS: Record<LogLevel, string> = {
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  debug: "\x1b[90m",
  event: "\x1b[32m",
}

const RESET = "\x1b[0m"

function pad(str: string, len: number) {
  return str.padEnd(len)
}

export function log(level: LogLevel, service: string, message: string, meta?: Record<string, any>) {
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

export const logger = {
  info: (service: string, message: string, meta?: Record<string, any>) => log("info", service, message, meta),
  warn: (service: string, message: string, meta?: Record<string, any>) => log("warn", service, message, meta),
  error: (service: string, message: string, meta?: Record<string, any>) => log("error", service, message, meta),
  debug: (service: string, message: string, meta?: Record<string, any>) => log("debug", service, message, meta),
  event: (service: string, message: string, meta?: Record<string, any>) => log("event", service, message, meta),
}
