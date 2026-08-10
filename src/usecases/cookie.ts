import type { Ports } from "../domain/ports"
import type { CookieValidation, CookieRefreshResult } from "../domain/types"
import { ok, err, type Result } from "../shared/result"

export type CookieUseCases = Readonly<{
  refresh: () => Promise<CookieRefreshResult>
  extract: () => Promise<CookieRefreshResult>
  validate: () => CookieValidation
  setupLogin: () => Promise<Result<{ url: string; instructions: string }, string>>
  delete: () => Promise<Result<void, "not_found">>
  resetProfile: () => Promise<void>
  close: () => Promise<void>
  isBrowserActive: () => boolean
}>

export const createCookieUseCases = (ports: Ports): CookieUseCases => {
  const refresh = (): Promise<CookieRefreshResult> => ports.browser.refresh()
  const extract = (): Promise<CookieRefreshResult> => ports.browser.extract()
  const validate = (): CookieValidation => ports.cookieStore.validate()

  const setupLogin = (): Promise<Result<{ url: string; instructions: string }, string>> =>
    ports.browser.setupLogin()

  const deleteCookies = async (): Promise<Result<void, "not_found">> => {
    const path = ports.cookieStore.filePath()
    if (!path) return err("not_found")
    ports.cookieStore.delete()
    return ok(undefined)
  }

  const resetProfile = (): Promise<void> => ports.browser.resetProfile()
  const close = (): Promise<void> => ports.browser.close()
  const isBrowserActive = (): boolean => ports.browser.isActive()

  return {
    refresh,
    extract,
    validate,
    setupLogin,
    delete: deleteCookies,
    resetProfile,
    close,
    isBrowserActive,
  } as const
}
