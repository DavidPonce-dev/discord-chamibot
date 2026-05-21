let cookieFile: string | null = null

export function getCookieFile(): string | null {
  return cookieFile
}

export function setCookieFile(path: string | null) {
  cookieFile = path
}
