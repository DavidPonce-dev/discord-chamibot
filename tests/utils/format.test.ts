import { describe, it, expect } from "vitest"
import { parseDuration, parseDurationSec, formatTime, buildProgressBar } from "@/utils/format"

describe("parseDuration", () => {
  it("undefined devuelve 0", () => {
    expect(parseDuration(undefined)).toBe(0)
  })

  it("string vacío devuelve 0", () => {
    expect(parseDuration("")).toBe(0)
  })

  it("'0:00' devuelve 0", () => {
    expect(parseDuration("0:00")).toBe(0)
  })

  it("'5:30' devuelve 330 segundos", () => {
    expect(parseDuration("5:30")).toBe(330)
  })

  it("'1:02:30' devuelve 3750 segundos", () => {
    expect(parseDuration("1:02:30")).toBe(3750)
  })

  it("'0:45' devuelve 45 segundos", () => {
    expect(parseDuration("0:45")).toBe(45)
  })

  it("'59:59' devuelve 3599 segundos", () => {
    expect(parseDuration("59:59")).toBe(3599)
  })
})

describe("parseDurationSec", () => {
  it("undefined devuelve 0", () => {
    expect(parseDurationSec(undefined)).toBe(0)
  })

  it("null devuelve 0", () => {
    expect(parseDurationSec(null)).toBe(0)
  })

  it("number directo devuelve el mismo número", () => {
    expect(parseDurationSec(42)).toBe(42)
  })

  it("number 0 devuelve 0", () => {
    expect(parseDurationSec(0)).toBe(0)
  })

  it("string '5:30' se delega a parseDuration", () => {
    expect(parseDurationSec("5:30")).toBe(330)
  })
})

describe("formatTime", () => {
  it("0 segundos devuelve '0:00' (borde exacto)", () => {
    expect(formatTime(0)).toBe("0:00")
  })

  it("1 segundo devuelve '0:01'", () => {
    expect(formatTime(1)).toBe("0:01")
  })

  it("45 segundos devuelve '0:45'", () => {
    expect(formatTime(45)).toBe("0:45")
  })

  it("125 segundos devuelve '2:05'", () => {
    expect(formatTime(125)).toBe("2:05")
  })

  it("3600 segundos devuelve '1:00:00'", () => {
    expect(formatTime(3600)).toBe("1:00:00")
  })

  it("3661 segundos devuelve '1:01:01'", () => {
    expect(formatTime(3661)).toBe("1:01:01")
  })
})

describe("buildProgressBar", () => {
  it("posición 0 con total > 0 no explota", () => {
    const bar = buildProgressBar(0, 200)
    expect(bar).toContain("[")
    expect(bar).toContain("]")
    expect(bar).toContain("0:00")
    expect(bar).toContain("3:20")
  })

  it("posición igual al total muestra barra llena", () => {
    const bar = buildProgressBar(200, 200)
    expect(bar).toContain("3:20")
    expect(bar).toContain("3:20")
  })

  it("total 0 no divide por cero", () => {
    const bar = buildProgressBar(50, 0)
    expect(bar).toContain("?")
  })

  it("total undefined (0) no divide por cero", () => {
    const bar = buildProgressBar(50, 0)
    expect(bar).toContain("?")
  })

  it("ancho personalizado se respeta", () => {
    const bar = buildProgressBar(50, 200, 10)
    const match = bar.match(/\[(.+?)\]/)
    expect(match).not.toBeNull()
    expect(match![1].length).toBe(10)
  })
})
