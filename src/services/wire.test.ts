/**
 * The alert wiring: which mailer the worker gets, and that the signing key
 * and the app's address reach the alert step from the worker's env as they
 * are, with nothing made up in between. No mail is sent and no integration
 * is called: the services are only built and looked at.
 */

import { describe, expect, it } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { EmailMailer } from './email-mailer'
import { OutboxMailer } from './outbox-mailer'
import { buildAlertServices } from './wire'

/** Tools that fail loudly if anything is called while the services are being built. */
const untouched = new Proxy({}, { get: () => () => Promise.reject(new Error('nothing should be called')) }) as ActionTools

const env = (vars: Partial<Env>) => ({ APP_NAME: 'bumpcheck', ...vars }) as Env

describe('buildAlertServices', () => {
  it('uses the real email integration unless the fake-services setting is on', () => {
    expect(buildAlertServices(env({}), untouched).mailer).toBeInstanceOf(EmailMailer)
    expect(buildAlertServices(env({ BUMPCHECK_FAKE_SERVICES: 'false' }), untouched).mailer).toBeInstanceOf(EmailMailer)
  })

  it('with the fake-services setting on, the mailer sends nothing: it is the outbox', () => {
    expect(buildAlertServices(env({ BUMPCHECK_FAKE_SERVICES: 'true' }), untouched).mailer).toBeInstanceOf(OutboxMailer)
  })

  it('passes the signing key from the env as it is', () => {
    expect(buildAlertServices(env({ UNSUBSCRIBE_SIGNING_KEY: 'throwaway-test-key' }), untouched).signingKey).toBe('throwaway-test-key')
  })

  it('invents no key when the env has none: the alert step then sends nothing', () => {
    expect(buildAlertServices(env({}), untouched).signingKey).toBeUndefined()
    expect(buildAlertServices(env({ UNSUBSCRIBE_SIGNING_KEY: '' }), untouched).signingKey).toBe('')
  })

  it('takes the app\'s address from configuration: the deployed name, or the local server\'s own origin', () => {
    expect(buildAlertServices(env({}), untouched).appOrigin).toBe('https://bumpcheck.app.space')
    expect(buildAlertServices(env({ BUMPCHECK_APP_ORIGIN: 'http://127.0.0.1:5173' }), untouched).appOrigin).toBe('http://127.0.0.1:5173')
    expect(buildAlertServices(env({ APP_NAME: '' }), untouched).appOrigin).toBeNull()
  })
})
