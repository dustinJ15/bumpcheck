import { describe, expect, it } from 'vitest'
import { SCHEDULE } from './config'
import { DAILY_SCANS_TASK, runTask, tasks } from './cron'
import type { Env } from '../worker'

describe('the scheduled task', () => {
  it('is one task, run every hour', () => {
    expect(tasks).toEqual([{ name: DAILY_SCANS_TASK, intervalMinutes: 60 }])
    expect(SCHEDULE.tickIntervalMinutes).toBe(60)
  })

  it('uses a whole number of minutes, which is all the platform accepts', () => {
    expect(Number.isInteger(SCHEDULE.tickIntervalMinutes)).toBe(true)
    expect(SCHEDULE.tickIntervalMinutes).toBeGreaterThanOrEqual(1)
  })

  it('refuses a task name it does not know, before touching anything', async () => {
    await expect(runTask('something-else', {} as Env)).rejects.toThrow('Unknown scheduled task: something-else')
  })
})
