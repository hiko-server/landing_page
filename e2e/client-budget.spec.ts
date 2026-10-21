import { test, expect, isLocalServer } from './fixtures'

/**
 * OPS-1: every test is its own client (e2e/fixtures.ts gives each one a
 * TEST-NET address in cf-connecting-ip), so per-client rate limits — post
 * saves, contact nonces, sign-ins — never carry over from one test to the
 * next. Without that, a full run against one server spends the budgets of
 * the whole suite from one address and the later specs get 429s.
 *
 * Only meaningful against a local server (loopback peer, which the server
 * trusts to name the client); behind Cloudflare the edge replaces the header
 * with the real address, so the check is skipped there.
 */

const remaining = (headers: Record<string, string>) => Number(headers['x-ratelimit-remaining'])

test.describe.serial('per-test client address', () => {
  const seen: { address: string; lastRemaining: number }[] = []

  for (const which of ['first', 'second']) {
    test(`the ${which} test spends its own rate-limit budget`, async ({ page, baseURL, extraHTTPHeaders }) => {
      test.skip(!isLocalServer(baseURL), 'needs a local server that trusts the loopback peer')

      const address = extraHTTPHeaders?.['cf-connecting-ip'] || ''
      expect(address).toMatch(/^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/)
      expect(seen.map((s) => s.address)).not.toContain(address)

      const first = await page.request.get('/api/contact/nonce')
      expect(first.status()).toBe(200)
      const second = await page.request.get('/api/contact/nonce')
      expect(second.status()).toBe(200)
      // Same test, same client: one budget.
      expect(remaining(second.headers())).toBe(remaining(first.headers()) - 1)
      // A new test starts above where the previous one left off.
      const previous = seen.at(-1)
      if (previous) expect(remaining(first.headers())).toBeGreaterThan(previous.lastRemaining)
      seen.push({ address, lastRemaining: remaining(second.headers()) })
    })
  }
})
