/**
 * Unit tests for the honest-state and badge layer.
 *
 * Two things matter here. First, escaping: these functions build HTML strings
 * for innerHTML, so a hostile or merely odd value arriving from the API must
 * never become markup. Second, truthfulness: the baseline verdict and the
 * coverage note must say the uncomfortable thing when the numbers are
 * uncomfortable, and must refuse to claim anything when a field is absent.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    badge, baselineVerdict, coverageNote, degradedBanner, emptyState, errorState, escapeHtml,
    metaList, metricTile, notAvailable, panel, provenanceBadges, raw, skeleton, sourceFooter,
    staleBanner, timeNotice,
} from '../js/ui.js';

const XSS = '<img src=x onerror="alert(1)">';

describe('escapeHtml', () => {
    it('neutralises every character that can open a tag or break an attribute', () => {
        assert.equal(escapeHtml('<a>'), '&lt;a&gt;');
        assert.equal(escapeHtml('a & b'), 'a &amp; b');
        assert.equal(escapeHtml('it\'s'), 'it&#39;s');
        assert.equal(escapeHtml('say "hi"'), 'say &quot;hi&quot;');
    });

    it('renders null and undefined as empty, not as the words', () => {
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(undefined), '');
    });

    it('escapes an injection attempt completely', () => {
        const out = escapeHtml(XSS);
        assert.ok(!out.includes('<'), out);
        assert.ok(!out.includes('"'), out);
    });
});

describe('every string builder escapes its dynamic input', () => {
    // A single sweep: anything that takes API-derived text must not emit a tag.
    const cases = {
        'badge detail': () => badge('synthetic', XSS),
        'sourceFooter source': () => sourceFooter(XSS),
        'sourceFooter extra': () => sourceFooter('/api/v1/health/', XSS),
        'emptyState title': () => emptyState(XSS, 'copy'),
        'emptyState copy': () => emptyState('title', XSS),
        'errorState message': () => errorState({ status: 500, message: XSS }),
        'errorState retry action': () => errorState({ status: 0 }, { retryAction: XSS }),
        'errorState what': () => errorState({ status: 0 }, { what: XSS }),
        'notAvailable title': () => notAvailable(XSS, 'reason'),
        'notAvailable reason': () => notAvailable('title', XSS),
        'notAvailable missing': () => notAvailable('t', 'r', { missing: XSS }),
        'panel title': () => panel({ title: XSS }),
        'panel caption': () => panel({ title: 't', caption: XSS }),
        'panel id': () => panel({ title: 't', id: XSS }),
        'metaList key': () => metaList([[XSS, 'v']]),
        'metaList value': () => metaList([['k', XSS]]),
        'metricTile label': () => metricTile({ label: XSS, value: '1' }),
        'metricTile value': () => metricTile({ label: 'l', value: XSS }),
        'metricTile unit': () => metricTile({ label: 'l', value: '1', unit: XSS }),
        'metricTile note': () => metricTile({ label: 'l', value: '1', note: XSS }),
        'metricTile countUpId': () => metricTile({ label: 'l', value: '1', countUpId: XSS }),
        'skeleton label': () => skeleton({ label: XSS }),
        'staleBanner what': () => staleBanner('2020-01-01T00:00:00Z', { what: XSS }),
        'degradedBanner load_error': () => degradedBanner({ model_details: { load_error: XSS } }),
        'baselineVerdict numbers': () => baselineVerdict({ beats_baseline: false, test_mae_minutes: XSS, baseline_mae_minutes: 1 }),
        'provenanceBadges rows': () => provenanceBadges({ data_provenance: 'synthetic', dataset_rows: XSS }),
    };

    for (const [name, build] of Object.entries(cases)) {
        it(`escapes: ${name}`, () => {
            const html = build();
            assert.ok(!html.includes('<img'), `${name} leaked a tag: ${html}`);
            assert.ok(!html.includes('onerror="'), `${name} leaked an attribute: ${html}`);
        });
    }
});

describe('raw', () => {
    it('is the only way to nest already-built markup', () => {
        const html = panel({ title: 't', body: raw('<p class="mine">ok</p>') });
        assert.ok(html.includes('<p class="mine">ok</p>'));
    });

    it('escapes a plain body, so raw must be opted into', () => {
        const html = panel({ title: 't', body: XSS });
        assert.ok(!html.includes('<img'));
    });
});

describe('badge', () => {
    it('carries the three provenance labels rule 3 requires', () => {
        assert.match(badge('live'), /Live prediction/);
        assert.match(badge('historical'), /Historical evaluation/);
        assert.match(badge('synthetic'), /Synthetic data/);
    });

    it('appends a detail, which is how row counts reach the label', () => {
        assert.match(badge('synthetic', '552 rows'), /Synthetic data - 552 rows/);
    });

    it('returns nothing for an unknown kind rather than an empty chip', () => {
        assert.equal(badge('nonsense'), '');
    });
});

describe('provenanceBadges', () => {
    // The real model_quality block from POST /predict/eta in this repo.
    const quality = {
        dataset_name: 'indian_railway_delay_synthetic_552',
        dataset_rows: 552,
        data_provenance: 'synthetic',
        beats_baseline: true,
    };

    it('shouts "synthetic" for a synthetic-trained model', () => {
        const html = provenanceBadges(quality);
        assert.match(html, /Synthetic data - 552 rows/);
        assert.match(html, /Live prediction/);
    });

    it('does not claim synthetic when the backend says otherwise', () => {
        const html = provenanceBadges({ ...quality, data_provenance: 'real' });
        assert.ok(!html.includes('Synthetic data'));
    });

    it('reports a missing model as degraded instead of silently showing nothing', () => {
        assert.match(provenanceBadges(null), /Model unavailable/);
    });

    it('labels a historical context as historical, not live', () => {
        const html = provenanceBadges(quality, { context: 'historical' });
        assert.match(html, /Historical evaluation/);
        assert.ok(!html.includes('Live prediction'));
    });
});

describe('baselineVerdict', () => {
    it('states the win in plain words with the real margin', () => {
        const html = baselineVerdict({ beats_baseline: true, test_mae_minutes: 21.822737, baseline_mae_minutes: 24.735613 });
        assert.match(html, /beats its baseline by 2\.9 minutes/);
        assert.match(html, /rp-verdict-ok/);
    });

    it('says plainly that the model LOST when it lost -- rule 4', () => {
        const html = baselineVerdict({ beats_baseline: false, test_mae_minutes: 30, baseline_mae_minutes: 24.7 });
        assert.match(html, /does <strong>not<\/strong> beat its baseline/);
        assert.match(html, /5\.3 minutes worse/);
        assert.match(html, /prototype result, not a forecast/);
        assert.match(html, /rp-verdict-bad/);
    });

    it('claims nothing when the field is absent', () => {
        for (const quality of [null, {}, { beats_baseline: null }]) {
            assert.match(baselineVerdict(quality), /is not reported/);
        }
    });

    it('omits the margin rather than computing one from a missing number', () => {
        const html = baselineVerdict({ beats_baseline: true, test_mae_minutes: null, baseline_mae_minutes: 24.7 });
        assert.match(html, /beats its baseline on the held-out test split/);
        assert.ok(!/minutes of average error/.test(html));
    });
});

describe('coverageNote', () => {
    it('calls the number measured coverage, not per-prediction confidence', () => {
        const html = coverageNote(0.7027027027027027);
        assert.match(html, /70\.1%|70\.3%/);
        assert.match(html, /measured coverage across that split, not a confidence score/);
    });

    it('states the shortfall when the interval under-covers, as this model does', () => {
        const html = coverageNote(0.7027027027027027, 0.8);
        assert.match(html, /below the 80% it aims for/);
        assert.match(html, /wider than shown more often than it should be/);
    });

    it('does not manufacture a shortfall when coverage is met', () => {
        const html = coverageNote(0.82, 0.8);
        assert.ok(!html.includes('below the'));
    });

    it('says it was not measured rather than printing 0%', () => {
        assert.match(coverageNote(null), /was not measured/);
        assert.match(coverageNote(undefined), /was not measured/);
    });
});

describe('errorState', () => {
    it('keeps the API message, which is usually the actionable part', () => {
        assert.match(errorState({ status: 503, message: 'model missing' }), /model missing/);
    });

    it('gives status-specific guidance, including the training command for 503', () => {
        assert.match(errorState({ status: 503 }), /training\.pipeline/);
        assert.match(errorState({ status: 0 }), /could not be reached/);
        assert.match(errorState({ status: 401 }), /Sign in again/);
        assert.match(errorState({ status: 408 }), /timed out/);
    });

    it('describes 403 as server-enforced, not as a hidden button', () => {
        assert.match(errorState({ status: 403 }), /enforced by the server, not hidden by the page/);
    });

    it('offers no retry control unless a caller wired one up -- no dead buttons', () => {
        assert.ok(!errorState({ status: 500 }).includes('<button'));
        assert.ok(errorState({ status: 500 }, { retryAction: 'reload-health' }).includes('<button'));
    });
});

describe('staleBanner', () => {
    const now = Date.parse('2026-10-20T06:00:00Z');

    it('says nothing at all when the data is fresh', () => {
        assert.equal(staleBanner('2026-10-20T05:59:00Z', { now }), '');
    });

    it('states the age and the timestamp for stale data', () => {
        const html = staleBanner('2026-09-28T15:53:46.587000', { now, what: 'This train state' });
        assert.match(html, /21 days ago/);
        assert.match(html, /28 Sep 2026, 15:53 UTC/);
        assert.match(html, /Everything derived from it is that old too/);
    });

    it('treats an unparseable timestamp as stale', () => {
        assert.match(staleBanner(null, { now }), /unknown age/);
    });
});

describe('degradedBanner', () => {
    it('names the command that fixes it instead of just saying error', () => {
        const html = degradedBanner({ model_details: { load_error: null } });
        assert.match(html, /No prediction model is loaded/);
        assert.match(html, /training\.pipeline --config configs\/dataset\.synthetic552\.json/);
    });

    it('relays the service\'s own load error when there is one', () => {
        assert.match(degradedBanner({ model_details: { load_error: 'no artifact at models/latest.json' } }),
            /no artifact at models\/latest\.json/);
    });
});

describe('notAvailable', () => {
    it('shows the reason and no control at all -- rule 7', () => {
        const html = notAvailable('Feature importance', 'The trainer exports none.');
        assert.match(html, /Not available/);
        assert.match(html, /The trainer exports none\./);
        assert.ok(!html.includes('<button'), 'an unavailable feature must not render a dead control');
        assert.ok(!html.includes('disabled'), 'nor a disabled one that looks live');
    });

    it('names what is missing when the caller knows', () => {
        assert.match(notAvailable('t', 'r', { missing: 'a station-level arrival feed' }),
            /Needs: a station-level arrival feed/);
    });
});

describe('panel and tiles', () => {
    it('renders a source footer when given one -- rule 2', () => {
        assert.match(panel({ title: 't', source: '/api/v1/health/' }), /Source: <code>\/api\/v1\/health\/<\/code>/);
    });

    it('omits the footer rather than inventing a source', () => {
        assert.ok(!panel({ title: 't' }).includes('Source:'));
    });

    it('lets a tile show a placeholder instead of a number', () => {
        assert.match(metricTile({ label: 'MAE', value: 'Not available' }), /Not available/);
    });

    it('drops empty entries from a meta list rather than printing blanks', () => {
        const html = metaList([['Dataset', 'synthetic_552'], ['Missing', null], ['Blank', '']]);
        assert.match(html, /synthetic_552/);
        assert.ok(!html.includes('Missing'));
        assert.ok(!html.includes('Blank'));
    });

    it('trims whitespace in meta values, matching the real feed', () => {
        assert.match(metaList([['Destination', 'RANI KAMLAPATI ']]), /<dd>RANI KAMLAPATI<\/dd>/);
    });
});

describe('timeNotice', () => {
    it('puts the timezone caveat on screen, not just in a code comment', () => {
        const html = timeNotice();
        assert.match(html, /UTC/);
        assert.match(html, /not timetable-accurate/);
    });
});
