import { describe, expect, it } from 'vitest'
import wranglerToml from '../../wrangler.toml?raw'
import viteConfigSource from '../../vite.config.ts?raw'
import { APP_ORIGIN_SETTING, appOrigin, localOriginWorkerVars } from './app-origin'

describe('appOrigin: where the links in an email point', () => {
  it('is the deployed app: https://<app name>.app.space', () => {
    expect(appOrigin({ APP_NAME: 'bumpcheck' })).toBe('https://bumpcheck.app.space')
    expect(appOrigin({ APP_NAME: 'my-other-app' })).toBe('https://my-other-app.app.space')
  })

  it('uses the local server\'s own address when the setting is there', () => {
    expect(appOrigin({ APP_NAME: 'bumpcheck', BUMPCHECK_APP_ORIGIN: 'http://127.0.0.1:5173' })).toBe('http://127.0.0.1:5173')
  })

  it('keeps only the origin of the setting: no path, query or trailing slash', () => {
    expect(appOrigin({ APP_NAME: 'bumpcheck', BUMPCHECK_APP_ORIGIN: 'https://example.test/some/path?x=1' })).toBe('https://example.test')
    expect(appOrigin({ APP_NAME: 'bumpcheck', BUMPCHECK_APP_ORIGIN: 'https://example.test/' })).toBe('https://example.test')
  })

  it('ignores a setting that is not an http or https address', () => {
    for (const bad of ['', 'not a url', 'javascript:alert(1)', 'ftp://example.test']) {
      expect(appOrigin({ APP_NAME: 'bumpcheck', BUMPCHECK_APP_ORIGIN: bad })).toBe('https://bumpcheck.app.space')
    }
  })

  it('is null when there is no usable app name: the caller must not send links to nowhere', () => {
    for (const name of [undefined, '', 'has space', 'a/b', 'evil.example/x', 'x\r\ny']) {
      expect(appOrigin({ APP_NAME: name })).toBeNull()
    }
  })
})

describe('the local origin never reaches a production build', () => {
  it('is named BUMPCHECK_APP_ORIGIN', () => {
    expect(APP_ORIGIN_SETTING).toBe('BUMPCHECK_APP_ORIGIN')
  })

  it('is forwarded to the worker only when vite is serving, with the port the platform CLI chose', () => {
    expect(localOriginWorkerVars('serve', { DEEPSPACE_PORT: '5199' })).toEqual({ BUMPCHECK_APP_ORIGIN: 'http://127.0.0.1:5199' })
    expect(localOriginWorkerVars('serve', {})).toEqual({ BUMPCHECK_APP_ORIGIN: 'http://127.0.0.1:5173' })
  })

  it('is never forwarded by a build, whatever the shell says', () => {
    expect(localOriginWorkerVars('build', { DEEPSPACE_PORT: '5199', BUMPCHECK_APP_ORIGIN: 'http://127.0.0.1:1' })).toEqual({})
  })

  it('is not declared in wrangler.toml, and reaches the worker from vite.config.ts only through localOriginWorkerVars', () => {
    expect(wranglerToml).not.toContain(APP_ORIGIN_SETTING)
    expect(viteConfigSource).toContain('localOriginWorkerVars(command, process.env)')
    expect(viteConfigSource).not.toContain(APP_ORIGIN_SETTING)
    expect(viteConfigSource).not.toContain('127.0.0.1')
  })
})
