/**
 * The sample alert email kept as evidence for ticket 06
 * (specs/bumpcheck/evidence/06/sample-alert.html and .txt) is exactly what
 * the composer produces for the fixture below. If the composer changes,
 * this fails until the files are written again (they are vitest file
 * snapshots):
 *
 *   npx vitest run src/core/alert-email.sample.test.ts -u
 *
 * The unsubscribe link in it is signed with a throwaway key made up here,
 * for a project id that does not exist. It unsubscribes nobody.
 */

import { describe, expect, it } from 'vitest'
import { composeAlertEmail, type AlertItem } from './alert-email'
import { signUnsubscribeToken, unsubscribeUrl } from './unsubscribe-token'

/** Relative to this file. */
const FOLDER = '../../specs/bumpcheck/evidence/06'
const ORIGIN = 'https://bumpcheck.app.space'
const PROJECT_ID = 'sample-project-id'
const THROWAWAY_KEY = 'throwaway-sample-key-not-a-secret'

const items: AlertItem[] = [
  {
    verdictKey: 'express@4->5.1',
    packageName: 'express',
    group: 'runtime',
    fromVersion: '4.18.2',
    toVersion: '5.1.0',
    summary: 'Express 5 removes several long-deprecated request and response helpers and changes how route paths are matched.',
    changeCount: 4,
    firstWhatToDo: 'Replace `app.del()` with `app.delete()`, and `req.param(name)` with `req.params`, `req.body` or `req.query`.',
    sourceUrl: 'https://github.com/expressjs/express/blob/HEAD/History.md',
  },
  {
    verdictKey: 'zod@3->4.1',
    packageName: 'zod',
    group: 'runtime',
    fromVersion: '3.22.4',
    toVersion: '4.1.5',
    summary: 'Zod 4 changes error customisation: the `message`, `invalid_type_error` and `required_error` options are replaced by a single `error` option.',
    changeCount: 2,
    firstWhatToDo: 'Replace `{ message: "..." }` with `{ error: "..." }` in schema definitions.',
    sourceUrl: 'https://github.com/colinhacks/zod/releases',
  },
  {
    verdictKey: '@types/node@18->24.0',
    packageName: '@types/node',
    group: 'dev',
    fromVersion: '18.19.0',
    toVersion: '24.0.3',
    summary: 'The types now describe Node 24: APIs removed since Node 18 are gone from the typings.',
    changeCount: 1,
    firstWhatToDo: 'Run the type checker and replace any API it no longer finds, such as `url.parse()` with `new URL()`.',
    sourceUrl: null,
  },
]

describe('the sample alert email in the evidence folder', () => {
  it('is what the composer produces for the fixture', async () => {
    const token = await signUnsubscribeToken(PROJECT_ID, THROWAWAY_KEY)
    const email = composeAlertEmail({
      kind: 'alert',
      project: { id: PROJECT_ID, repoOwner: 'dustinj15', repoName: 'bumpcheck-example' },
      items,
      appOrigin: ORIGIN,
      unsubscribeUrl: unsubscribeUrl(ORIGIN, token),
    })
    if (email === null) throw new Error('expected an email')

    const headers = [`Subject: ${email.subject}`, ...Object.entries(email.headers).map(([name, value]) => `${name}: ${value}`)].join('\n')
    await expect(email.html).toMatchFileSnapshot(`${FOLDER}/sample-alert.html`)
    await expect(email.text).toMatchFileSnapshot(`${FOLDER}/sample-alert.txt`)
    await expect(`${headers}\n`).toMatchFileSnapshot(`${FOLDER}/sample-alert.headers.txt`)
  })
})
