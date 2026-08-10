export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export const mapR = <T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> =>
  r.ok ? ok(fn(r.value)) : r

export const flatMapR = <T, U, E>(r: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> =>
  r.ok ? fn(r.value) : r

export const matchR = <T, E, R>(
  r: Result<T, E>,
  handlers: { readonly ok: (v: T) => R; readonly err: (e: E) => R }
): R => r.ok ? handlers.ok(r.value) : handlers.err(r.error)

export const pipe = <A>(value: A): A => value
export const pipe2 = <A, B>(value: A, fn1: (a: A) => B): B => fn1(value)
export const pipe3 = <A, B, C>(value: A, fn1: (a: A) => B, fn2: (b: B) => C): C => fn2(fn1(value))
export const pipe4 = <A, B, C, D>(value: A, fn1: (a: A) => B, fn2: (b: B) => C, fn3: (c: C) => D): D => fn3(fn2(fn1(value)))

export const tap = <T>(fn: (v: T) => void) => (v: T): T => { fn(v); return v }
