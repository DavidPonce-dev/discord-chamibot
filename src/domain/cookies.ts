// Google session cookies: without them YouTube treats requests as anonymous
// (age-restricted videos fail and "Sign in to confirm you're not a bot" appears more often)
export const isSidCookie = (name: string): boolean => name === "SID" || name === "HSID" || name === "SSID"
export const isPsidCookie = (name: string): boolean => name.includes("PSID")

export const hasAuthCookies = (names: readonly string[]): boolean =>
  names.some(n => isSidCookie(n) || isPsidCookie(n))

// Cookie names from a Netscape cookie file (tab-separated, name in the 6th column)
export const parseCookieNames = (content: string): string[] => {
  const names = content
    .split("\n")
    .filter(line => line.trim() && !line.startsWith("#"))
    .map(line => line.split("\t")[5]?.trim())
    .filter((name): name is string => !!name)
  return [...new Set(names)]
}
