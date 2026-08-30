import { describe, expect, it } from 'vitest'
import { describeHistoryError } from './historyError'

const apiError = (code: number, message: string) => Object.assign(new Error(message), { code })

describe('describeHistoryError', () => {
  it('explains Missing Access (50001) with how to fix it', () => {
    const text = describeHistoryError(apiError(50001, 'Missing Access'))
    expect(text).toMatch(/bot can't see this channel or thread/i)
    expect(text).toMatch(/View Channel/)
    expect(text).toMatch(/Read Message History/)
    expect(text).toMatch(/private thread/i)
  })
  it('explains Missing Permissions (50013)', () => {
    expect(describeHistoryError(apiError(50013, 'Missing Permissions'))).toMatch(/Read Message History/)
  })
  it('explains Unknown Channel (10003)', () => {
    expect(describeHistoryError(apiError(10003, 'Unknown Channel'))).toMatch(/no longer exists/i)
  })
  it('falls back to the raw message for anything else', () => {
    expect(describeHistoryError(new Error('boom'))).toBe('history load failed: boom')
    expect(describeHistoryError('weird')).toBe('history load failed: weird')
  })
})
