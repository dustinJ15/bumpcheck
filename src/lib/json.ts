/**
 * Reads a JSON column. The record room hands a JSON column back parsed in
 * some paths and as text in others, so every reader goes through this.
 * Null for a missing, empty or unparseable value.
 */
export function readJson<T>(value: unknown): T | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}
