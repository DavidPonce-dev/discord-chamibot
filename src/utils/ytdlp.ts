import { spawn } from "child_process"
import { getCookieFile } from "./cookies"

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

export interface YtDlpResult {
  stdout: string
  stderr: string
  code: number | null
}

export function buildYtDlpArgs(baseArgs: string[], extraArgs: string[] = []): string[] {
  // yt-dlp requires a JS runtime to execute YouTube's obfuscated JavaScript
  // deno is the default supported runtime for YouTube extraction
  const args = [...baseArgs, "--js-runtimes", "deno", "--no-playlist", "--quiet", "--no-warnings", "--user-agent", USER_AGENT, ...extraArgs]
  const cookieFile = getCookieFile()
  if (cookieFile) args.push("--cookies", cookieFile)
  return args
}

export function spawnYtDlp(args: string[], timeoutMs = 30000): Promise<YtDlpResult> {
  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    proc.stdout.on("data", (d) => (stdout += d))
    proc.stderr.on("data", (d) => (stderr += d))
    proc.on("close", (code) => resolve({ stdout, stderr, code }))
    proc.on("error", () => resolve({ stdout, stderr: "spawn failed", code: -1 }))

    const timer = setTimeout(() => {
      if (!proc.killed) proc.kill("SIGKILL")
      resolve({ stdout, stderr: "timeout", code: -1 })
    }, timeoutMs)

    proc.on("close", () => clearTimeout(timer))
    proc.on("error", () => clearTimeout(timer))
  })
}
