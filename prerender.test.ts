import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { build, type ResolvedConfig } from 'vite'
import { prerender } from './prerender'
import { EXAMPLE_PROJECT_ID } from './src/config'
import { render as renderPublicPage } from './src/prerender-entry'

vi.mock('vite', async (original) => ({
  ...await original<typeof import('vite')>(),
  build: vi.fn(),
}))

// The landing page is static: it may not use a data hook or an auth hook.
// Every export of the SDK's client entry is replaced by a function that
// throws, so calling any of them (useQuery, useUser, useAuth, AuthOverlay...)
// while the landing page renders fails the test below. Importing is allowed:
// src/constants.ts re-exports the role names from it.
vi.mock('deepspace', () => {
  const refuse = (name: string) => () => {
    throw new Error(`the landing page called deepspace.${name}; it must stay static`)
  }
  return new Proxy(
    {},
    {
      has: () => true,
      get: (_target, name) => (typeof name === 'string' && name !== 'then' ? refuse(name) : undefined),
    },
  )
})

const dirs: string[] = []
afterEach(() => {
  vi.clearAllMocks()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function buildPages(noindex: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'scaffold-seo-'))
  dirs.push(root)
  const client = join(root, 'dist/client')
  mkdirSync(client, { recursive: true })
  writeFileSync(join(client, 'index.html'), '<html><head><title>Fallback</title></head><body><div id="root"></div></body></html>')
  // Simulate a prior sitemap, or one copied from public/.
  writeFileSync(join(client, 'sitemap.xml'), '<urlset><loc>https://old.test/</loc></urlset>')
  vi.mocked(build).mockImplementation(async () => {
    const ssrDir = join(root, 'dist/prerender')
    mkdirSync(ssrDir, { recursive: true })
    writeFileSync(join(ssrDir, 'entry.mjs'), `
      export const seo = { origin: 'https://example.test', noindex: ${noindex} };
      export const PRERENDER_ROUTES = ['/', '/excluded'];
      export function render(route) {
        return '<title>Public page</title><meta name="description" content="A real page"/>' +
          (route === '/excluded' ? '<meta content="noindex, nofollow" name="robots"/>' : '') +
          '<div data-testid="app-root"><h1>Page content</h1></div>';
      }
    `)
    return []
  })

  const plugin = prerender()
  // Exercise the real client-output hook, with only the separate SSR compiler
  // replaced by a deterministic entry. Assertions cover shipped HTML/files.
  const configResolved = plugin.configResolved as (config: ResolvedConfig) => void
  configResolved({ command: 'build', root, define: {} } as ResolvedConfig)
  const closeBundle = plugin.closeBundle as (this: unknown) => Promise<void>
  await closeBundle.call({ environment: { config: { build: { outDir: client } } } })
  return client
}

describe('prerender indexing policy', () => {
  it('keeps excluded pages accessible but omits them from the sitemap', async () => {
    const client = await buildPages(false)
    const sitemap = readFileSync(join(client, 'sitemap.xml'), 'utf8')
    expect(sitemap).toContain('<loc>https://example.test/</loc>')
    expect(sitemap).not.toContain('/excluded')
    expect(readFileSync(join(client, 'excluded.html'), 'utf8')).toContain('noindex, nofollow')
    expect(readFileSync(join(client, 'index.html'), 'utf8')).not.toContain('noindex')
    expect(readFileSync(join(client, 'robots.txt'), 'utf8')).toContain('Sitemap: https://example.test/sitemap.xml')
    expect(readFileSync(join(client, '_spa.html'), 'utf8')).not.toContain('Page content')
  })

  it('enforces site noindex even when a page omits it and lets crawlers read it', async () => {
    const client = await buildPages(true)
    for (const file of ['index.html', 'excluded.html', '_spa.html']) {
      const html = readFileSync(join(client, file), 'utf8')
      expect(html).toContain('noindex, nofollow')
      expect(html.match(/name="robots"/g)).toHaveLength(1)
    }
    expect(readFileSync(join(client, 'robots.txt'), 'utf8')).toBe('User-agent: *\nAllow: /\n')
    expect(existsSync(join(client, 'sitemap.xml'))).toBe(false)
  })
})

describe('landing page', () => {
  // The real page through the real prerender entry: no build, no browser, no providers.
  const html = renderPublicPage('/')

  it('renders without a data hook or an auth hook, and says what bumpcheck does in one sentence', () => {
    expect(html).toContain('data-testid="static-landing"')
    const sentences = html.match(/<p data-testid="landing-pitch"[^>]*>([^<]+)<\/p>/)
    expect(sentences, 'the landing page has one pitch sentence').not.toBeNull()
    const pitch = sentences![1]
    expect(pitch).toMatch(/dependenc/i)
    expect(pitch).toMatch(/break/i)
    // One sentence: a single full stop, at the end.
    expect(pitch.trim().endsWith('.')).toBe(true)
    expect(pitch.trim().slice(0, -1)).not.toContain('. ')
  })

  it('is bumpcheck, not the scaffold placeholder', () => {
    expect(html).not.toContain('A DeepSpace app with a static front door')
    expect(html).not.toContain('real-time collaborative app')
  })

  it('links to the public example report, whose id comes from the one constant', () => {
    expect(EXAMPLE_PROJECT_ID).toMatch(/\S/)
    expect(html).toContain(`href="/share/${EXAMPLE_PROJECT_ID}"`)
  })

  it('offers sign-in with GitHub and with Google as plain links, so nothing runs until one is pressed', () => {
    expect(html).toContain('href="/api/auth/social-redirect?provider=github"')
    expect(html).toContain('href="/api/auth/social-redirect?provider=google"')
  })
})
