/**
 * Calls a server action (src/actions/) from the browser.
 *
 * Sends the signed-in user's short-lived token; the worker verifies it and
 * derives the caller from it. The answer is the action's own result:
 * `{ success: true, data }` or `{ success: false, error }`, where `error` is
 * a message written to be shown to the user.
 */

import { getAuthToken } from 'deepspace'

export type ActionAnswer<TData> =
  | { success: true; data: TData }
  | { success: false; error: string; code?: string; details?: Record<string, unknown> }

export async function callAction<TData = unknown>(
  name: string,
  params: Record<string, unknown> = {},
): Promise<ActionAnswer<TData>> {
  try {
    const token = await getAuthToken()
    if (!token) return { success: false, error: 'You are signed out. Sign in and try again.' }

    const response = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
    const body = (await response.json()) as Partial<ActionAnswer<TData>> & { error?: string }
    if (body.success === true) return { success: true, data: body.data as TData }
    return {
      success: false,
      error: typeof body.error === 'string' ? body.error : 'Something went wrong. Try again.',
      code: 'code' in body && typeof body.code === 'string' ? body.code : undefined,
      details: 'details' in body && typeof body.details === 'object' && body.details !== null ? body.details : undefined,
    }
  } catch {
    return { success: false, error: 'Could not reach the server. Check your connection and try again.' }
  }
}
