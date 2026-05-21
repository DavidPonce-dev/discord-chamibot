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
  const args = [...baseArgs, "--js-runtimes", "deno", "--no-playlist", "--quiet", "--no-warnings", "--user-agent", USER_AGENT, ...extraArgs]
  const cookieFile = getCookieFile()
  if (cookieFile) args.push("--cookies", cookieFile)
  return args
}

export function spawnYtDlp(args: string[]): Promise<YtDlpResult> {
  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    proc.stdout.on("data", (d) => (stdout += d))
    proc.stderr.on("data", (d) => (stderr += d))
    proc.on("close", (code) => resolve({ stdout, stderr, code }))
    proc.on("error", () => resolve({ stdout, stderr: "spawn failed", code: -1 }))
  })
}
