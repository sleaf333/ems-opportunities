import { describe, expect, it } from 'vitest'

// Browser pop-ups (confirm, prompt, alert) are silently blocked by some in-app
// browsers, such as links opened from the Outlook app on iPhone, which made
// "Withdraw" do nothing. Ask on the page instead (see ConfirmAction).
const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('no browser pop-ups', () => {
  it('reads the site source files', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20)
  })

  it('never uses window.confirm, window.prompt or window.alert', () => {
    const offenders = Object.entries(sources)
      .filter(([, text]) => /\b(window\.)?(confirm|prompt|alert)\s*\(/.test(text.replace(/\/\/.*$/gm, '')))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
