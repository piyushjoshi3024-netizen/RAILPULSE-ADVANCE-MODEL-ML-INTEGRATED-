/**
 * Unit tests for the PASSENGER welcome dashboard.
 *
 * The page's whole contract is negative as much as positive: it must name the
 * signed-in user, state the uncertainty honestly, link only to pages that
 * exist, and -- the part that is easy to regress -- call no endpoint and print
 * no number. `fetch` is therefore replaced with a throwing stub: if the render
 * ever reaches the API again, this test fails rather than silently passing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// The module's import chain reaches config.js, which reads `window` at load
// time, so a minimal browser stub has to exist before the dynamic import.
globalThis.window = { matchMedia: () => ({ matches: false }) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.localStorage = globalThis.sessionStorage;
globalThis.fetch = () => {
    throw new Error('the passenger dashboard must not call the API');
};

const { renderPassengerDashboard } = await import('../js/pages/passenger.js');
const { setSession, clearSession } = await import('../js/state.js');

/** The render only assigns innerHTML, so a plain sink is enough of a mount. */
async function renderFor(user) {
    const mount = { innerHTML: '' };
    setSession({ accessToken: 'test-token', user });
    try {
        await renderPassengerDashboard(mount);
    } finally {
        clearSession();
    }
    return mount.innerHTML;
}

describe('renderPassengerDashboard', () => {
    it('welcomes the user by their full name', async () => {
        const html = await renderFor({ username: 'ritik', role: 'PASSENGER', full_name: 'Ritik Gupta' });
        assert.match(html, /Welcome to RailPulse, Ritik Gupta\./);
    });

    it('falls back to the username, and then to a neutral word', async () => {
        assert.match(await renderFor({ username: 'ritik', role: 'PASSENGER' }), /Welcome to RailPulse, ritik\./);
        assert.match(await renderFor({ username: '', role: 'PASSENGER' }), /Welcome to RailPulse, traveller\./);
    });

    it('escapes the name instead of letting it become markup', async () => {
        const html = await renderFor({
            username: 'x', role: 'PASSENGER', full_name: '<img src=x onerror="alert(1)">',
        });
        assert.ok(!html.includes('<img'), html);
        assert.ok(html.includes('&lt;img'), html);
    });

    it('says the arrival is an estimate with a range, not a guarantee', async () => {
        const html = await renderFor({ username: 'ritik', role: 'PASSENGER' });
        assert.match(html, /not a\s+guarantee/);
        assert.match(html, /not tracked live|not live tracking/);
    });

    it('links to the three passenger pages that exist, and nothing else', async () => {
        const html = await renderFor({ username: 'ritik', role: 'PASSENGER' });
        const targets = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
        assert.deepEqual(
            [...new Set(targets)].sort(),
            ['#/passenger/alerts', '#/passenger/history', '#/passenger/train'],
        );
    });

    it('offers exactly one primary call to action, to the train page', async () => {
        const html = await renderFor({ username: 'ritik', role: 'PASSENGER' });
        const primary = [...html.matchAll(/class="button button-primary" href="([^"]+)"/g)];
        assert.equal(primary.length, 1);
        assert.equal(primary[0][1], '#/passenger/train');
    });

    it('carries no lookup form and no "no train selected" panel', async () => {
        const html = await renderFor({ username: 'ritik', role: 'PASSENGER' });
        assert.ok(!html.includes('lookup-form'), 'the lookup form belongs to the Track page only');
        assert.ok(!html.includes('<input'), 'the welcome page takes no input');
        assert.ok(!/No train selected/i.test(html), html);
    });

    it('shows no live-data claim and no metric value', async () => {
        const html = await renderFor({ username: 'ritik', role: 'PASSENGER' });
        assert.ok(!/LIVE\s*(<br>)?\s*SIGNAL/i.test(html), html);
        assert.ok(!html.includes('signal-mark'), html);
        assert.ok(!html.includes('rp-tile-value'), html);
        assert.ok(!html.includes('metric-card'), html);
    });

    it('keeps the reveal class so the reduced-motion rules still apply', async () => {
        const html = await renderFor({ username: 'ritik', role: 'PASSENGER' });
        assert.match(html, /class="welcome reveal"/);
    });
});
