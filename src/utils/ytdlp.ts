import { spawn } from "child_process"
import fs from "fs"
import { getCookieFile } from "./cookies"
import { logger } from "@/utils/logger"

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

export interface YtDlpResult {
  stdout: string
  stderr: string
  code: number | null
}

export function buildYtDlpArgs(baseArgs: string[], extraArgs: string[] = []): string[] {
  const args = [...baseArgs, "--js-runtimes", "deno", "--no-playlist", "--quiet", "--no-warnings", "--user-agent", USER_AGENT, ...extraArgs]
  const cookieFile = getCookieFile()
  if (cookieFile) {
    const exists = fs.existsSync(cookieFile)
    const size = exists ? fs.statSync(cookieFile).size : 0
    logger.debug("ytdlp", "Cookie file check", { path: cookieFile, exists, size })
    if (exists && size > 0) {
      args.push("--cookies", cookieFile)
    } else {
      logger.warn("ytdlp", "Cookie file missing or empty", { path: cookieFile, exists, size })
    }
  } else {
    logger.debug("ytdlp", "No cookie file configured")
  }
  return args
}

export function spawnYtDlp(args: string[], timeoutMs = 30000): Promise<YtDlpResult> {
  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    proc.stdout.on("data", (d) => stdoutChunks.push(d))
    proc.stderr.on("data", (d) => stderrChunks.push(d))
    proc.on("close", (code) => resolve({
      stdout: Buffer.concat(stdoutChunks).toString(),
      stderr: Buffer.concat(stderrChunks).toString(),
      code,
    }))
    proc.on("error", () => resolve({
      stdout: Buffer.concat(stdoutChunks).toString(),
      stderr: Buffer.concat(stderrChunks).toString() || "spawn failed",
      code: -1,
    }))

    const timer = setTimeout(() => {
      if (!proc.killed) proc.kill("SIGKILL")
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString(),
        stderr: Buffer.concat(stderrChunks).toString() || "timeout",
        code: -1,
      })
    }, timeoutMs)

    proc.on("close", () => clearTimeout(timer))
    proc.on("error", () => clearTimeout(timer))
  })
}
