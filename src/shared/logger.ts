import type { LoggerPort } from "../domain/ports"

type LogLevel = "info" | "warn" | "error" | "debug" | "event"

const COLORS: Record<LogLevel, string> = {
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  debug: "\x1b[90m",
  event: "\x1b[32m",
}

const RESET = "\x1b[0m"

// "event" lines (commands, buttons) are as relevant as "info" ones
const SEVERITY: Record<LogLevel, number> = { debug: 0, info: 1, event: 1, warn: 2, error: 3 }

// Unknown or missing values print everything, like before LOG_LEVEL existed
const minSeverity = (level: string | undefined): number =>
  SEVERITY[(level ?? "").toLowerCase() as LogLevel] ?? SEVERITY.debug

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

export const createLogger = (level: string | undefined = process.env.LOG_LEVEL): LoggerPort => {
  const threshold = minSeverity(level)
  const at = (lvl: LogLevel) => (service: string, message: string, meta?: Record<string, unknown>): void => {
    if (SEVERITY[lvl] >= threshold) log(lvl, service, message, meta)
  }
  return { info: at("info"), warn: at("warn"), error: at("error"), debug: at("debug"), event: at("event") }
}
