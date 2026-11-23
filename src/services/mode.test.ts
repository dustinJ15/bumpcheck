import { describe, expect, it } from 'vitest'
import wranglerToml from '../../wrangler.toml?raw'
import viteConfigSource from '../../vite.config.ts?raw'
import { FAKE_SERVICES_SETTING, fakeServicesWorkerVars, servicesMode } from './mode'

describe('servicesMode: one setting decides real or fake', () => {
  it('is named BUMPCHECK_FAKE_SERVICES', () => {
    expect(FAKE_SERVICES_SETTING).toBe('BUMPCHECK_FAKE_SERVICES')
  })

  it('defaults to real', () => {
    expect(servicesMode({})).toBe('real')
  })

  it('is fake only for exactly "true"', () => {
    expect(servicesMode({ BUMPCHECK_FAKE_SERVICES: 'true' })).toBe('fake')
    for (const value of ['', 'false', '1', 'TRUE', 'yes', ' true']) {
      expect(servicesMode({ BUMPCHECK_FAKE_SERVICES: value })).toBe('real')
    }
  })
})

describe('a production build has fake services off', () => {
  // A deployed worker's env comes from the build: `deepspace deploy` runs
  // `vite build`, whose worker config is wrangler.toml plus what
  // vite.config.ts adds through fakeServicesWorkerVars. These three checks
  // cover every way the setting could reach a production build.

  it('is never forwarded to the worker by a build, even when the shell has it set', () => {
    expect(fakeServicesWorkerVars('build', { BUMPCHECK_FAKE_SERVICES: 'true' })).toEqual({})
  })

  it('is not declared in wrangler.toml, the deployed worker config', () => {
    expect(wranglerToml).not.toContain(FAKE_SERVICES_SETTING)
  })

  it('reaches the worker from vite.config.ts only through fakeServicesWorkerVars, keyed on the vite command', () => {
    expect(viteConfigSource).toContain('fakeServicesWorkerVars(command, process.env)')
    expect(viteConfigSource).not.toContain(FAKE_SERVICES_SETTING)
  })

  it('is forwarded to the local dev/test server only when the shell sets it', () => {
    expect(fakeServicesWorkerVars('serve', { BUMPCHECK_FAKE_SERVICES: 'true' })).toEqual({
      BUMPCHECK_FAKE_SERVICES: 'true',
    })
    expect(fakeServicesWorkerVars('serve', {})).toEqual({})
    expect(fakeServicesWorkerVars('serve', { BUMPCHECK_FAKE_SERVICES: 'false' })).toEqual({})
  })
})
