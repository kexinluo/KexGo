import { describe, expect, it } from 'vitest'
import { clamp, formatClock } from './time'

describe('time helpers', () => {
  it('clamps values', () => {
    expect(clamp(12, 0, 10)).toBe(10)
    expect(clamp(-1, 0, 10)).toBe(0)
  })

  it('formats clock time safely', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65.9)).toBe('1:05')
    expect(formatClock(Number.NaN)).toBe('0:00')
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
})
