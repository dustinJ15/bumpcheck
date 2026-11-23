/**
 * Integration Billing Config
 *
 * Configure who pays for each integration's API calls.
 *
 * - 'developer': The app owner pays (default).
 * - 'user': The calling user pays.
 *
 * Every integration requires a signed-in caller. Set `anonymous: true` on a
 * 'developer' integration to let signed-out visitors call it too — the owner
 * then pays for anyone who can reach the app.
 *
 * Integrations not listed here default to 'developer' with sign-in required.
 *
 * IMPORTANT: any integration backed by per-user connected accounts (Google,
 * Composio) must be 'user' — the api-worker resolves the account from the
 * JWT subject. With 'developer' the app owner's JWT is forwarded, so every
 * signed-in user connects and acts on the app owner's account. Server code
 * that acts for a user in the background (e.g. a cron job) uses
 * `callComposio(env, ..., { asUser })` from 'deepspace/worker' instead.
 */

export const integrations: Record<
  string,
  { billing: 'developer' | 'user'; anonymous?: boolean }
> = {
  // bumpcheck uses two integrations, both paid by the app owner and both
  // called by server code only. Neither sets `anonymous`, so a signed-out
  // visitor can call nothing.
  github: { billing: 'developer' },
  email: { billing: 'developer' },
  google: { billing: 'user' },
  composio: { billing: 'user' },
}

/**
 * Integrations a signed-in user's browser may call through the
 * `/api/integrations/:name/:endpoint` proxy (src/server/http-routes.ts).
 *
 * None. The proxy bills the app owner for every owner-billed integration,
 * including ones not listed above, so leaving it open would let any signed-in
 * user spend the owner's credits from the browser console (story 58). Server
 * actions and jobs call integrations directly and are not affected.
 */
export const browserCallableIntegrations: readonly string[] = []
