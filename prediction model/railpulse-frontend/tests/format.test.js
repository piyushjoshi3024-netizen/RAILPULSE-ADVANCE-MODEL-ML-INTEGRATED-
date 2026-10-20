/**
 * Unit tests for the formatting, time and motion helpers.
 *
 * The timezone tests are the important ones: they pin the documented decision
 * that a naive backend datetime is read as UTC, matching app/ml/predictor.py,
 * so a later change cannot silently shift every displayed time by 5h30m.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
    DISPLAY_ZONE, STALE_AFTER_MS, TIME_NOTICE, age, cleanLabel, countUp, describeSpan,
    formatClock, formatDay, formatDelayMinutes, formatDuration, formatInstant, formatNumber,
    formatPercent, parseInstant, prefersReducedMotion,
} from '../js/format.js';

/* Real values taken from this repo's live API responses, not invented. */
const AWARE = '2026-09-28T16:09:30.149691Z';   // PredictionResponse.predicted_eta
const NAIVE = '2026-09-28T15:53:46.587000';    // trains/{n}/state.scheduled_arrival

afterEach(() => {
    delete globalThis.window;
    delete globalThis.requestAnimationFrame;
    delete globalThis.performance;
});

describe('parseInstant', () => {
    it('reads an aware value as sent and reports it was not naive', () => {
        const { date, naive } = parseInstant(AWARE);
        assert.equal(naive, false);
        assert.equal(date.toISOString(), '2026-09-28T16:09:30.149Z');
    });

    it('reads a naive value as UTC, matching app/ml/predictor.py', () => {
        const { date, naive } = parseInstant(NAIVE);
        assert.equal(naive, true, 'callers must be able to disclose that the zone was assumed');
        assert.equal(date.toISOString(), '2026-09-28T15:53:46.587Z');
    });

    it('does not shift a naive value into or out of IST', () => {
        const { date } = parseInstant(NAIVE);
        assert.equal(date.getUTCHours(), 15, 'a +5:30 shift here would misreport every time on screen');
        assert.equal(date.getUTCMinutes(), 53);
    });

    it('accepts an explicit offset without re-interpreting it', () => {
        const { date, naive } = parseInstant('2026-09-28T21:23:46+05:30');
        assert.equal(naive, false);
        assert.equal(date.toISOString(), '2026-09-28T15:53:46.000Z');
    });

    it('returns null for junk instead of an Invalid Date', () => {
        for (const value of ['', '   ', null, undefined, 'tomorrow', 42, {}]) {
            assert.equal(parseInstant(value).date, null, `${JSON.stringify(value)} should not parse`);
        }
    });

    it('passes a Date through and rejects an invalid one', () => {
        const date = new Date(AWARE);
        assert.equal(parseInstant(date).date, date);
        assert.equal(parseInstant(new Date('nope')).date, null);
    });
});

describe('formatInstant / formatClock / formatDay', () => {
    it('labels the zone on every rendered time', () => {
        assert.equal(DISPLAY_ZONE.label, 'UTC');
        assert.match(formatInstant(AWARE), /UTC$/);
        assert.match(formatClock(AWARE), /UTC$/);
    });

    it('renders an aware instant in the display zone', () => {
        assert.equal(formatInstant(AWARE), '28 Sep 2026, 16:09 UTC');
        assert.equal(formatClock(AWARE), '16:09 UTC');
        assert.equal(formatDay(AWARE), '28 Sep 2026');
    });

    it('renders a naive instant at its face value, not shifted', () => {
        assert.equal(formatInstant(NAIVE), '28 Sep 2026, 15:53 UTC');
    });

    it('uses a 24-hour clock, so 00:xx is never printed as 12:xx', () => {
        assert.equal(formatClock('2026-01-01T00:30:00Z'), '00:30 UTC');
        assert.equal(formatClock('2026-01-01T13:05:00Z'), '13:05 UTC');
    });

    it('shows a placeholder rather than a fabricated time', () => {
        assert.equal(formatInstant(null), 'Not available');
        assert.equal(formatClock(null), '--:--');
        assert.equal(formatInstant(null, { placeholder: 'No ETA' }), 'No ETA');
    });

    it('states the provenance caveat the formatter cannot fix', () => {
        assert.match(TIME_NOTICE, /UTC/);
        assert.match(TIME_NOTICE, /not timetable-accurate/);
    });
});

describe('age', () => {
    const now = Date.parse('2026-10-20T06:00:00Z');

    it('ages a value and calls it fresh below the threshold', () => {
        const result = age('2026-10-20T05:58:00Z', now);
        assert.equal(result.stale, false);
        assert.equal(result.text, '2 minutes ago');
    });

    it('calls the real demo data stale, because it is', () => {
        // The seeded demo state in this repo is dated 2026-09-28.
        const result = age(NAIVE, now);
        assert.equal(result.stale, true);
        assert.equal(result.text, '21 days ago');
    });

    it('treats an unparseable timestamp as stale rather than fresh', () => {
        const result = age(null, now);
        assert.equal(result.stale, true);
        assert.equal(result.ms, null);
        assert.equal(result.text, 'unknown age');
    });

    it('flags a future timestamp instead of printing a negative age', () => {
        const result = age('2026-10-20T07:00:00Z', now);
        assert.equal(result.stale, true);
        assert.equal(result.text, 'dated in the future');
    });

    it('honours a caller threshold', () => {
        assert.equal(age('2026-10-20T05:58:00Z', now, 60 * 1000).stale, true);
        assert.equal(STALE_AFTER_MS, 10 * 60 * 1000);
    });
});

describe('describeSpan', () => {
    it('is singular-aware', () => {
        assert.equal(describeSpan(1000), '1 second');
        assert.equal(describeSpan(2000), '2 seconds');
        assert.equal(describeSpan(60000), '1 minute');
        assert.equal(describeSpan(3600000), '1 hour');
        assert.equal(describeSpan(86400000), '1 day');
    });

    it('picks the largest fitting unit', () => {
        assert.equal(describeSpan(90 * 60 * 1000), '1 hour');
        assert.equal(describeSpan(21 * 86400000), '21 days');
    });

    it('does not claim a duration it cannot express', () => {
        assert.equal(describeSpan(10), 'moments');
    });
});

describe('number formatting', () => {
    it('signs a delay and names "on time" rather than printing +0.0', () => {
        assert.equal(formatDelayMinutes(15.726), '+15.7 min');
        assert.equal(formatDelayMinutes(-3), '-3.0 min');
        assert.equal(formatDelayMinutes(0), 'on time');
        assert.equal(formatDelayMinutes(0.01), 'on time');
    });

    it('never prints a number for a missing value', () => {
        assert.equal(formatDelayMinutes(null), 'Not available');
        assert.equal(formatDelayMinutes(undefined), 'Not available');
        assert.equal(formatNumber('abc'), 'Not available');
        assert.equal(formatPercent(null), 'Not available');
    });

    it('formats durations in hours and minutes', () => {
        assert.equal(formatDuration(175.7), '2 h 56 min');
        assert.equal(formatDuration(47), '47 min');
        assert.equal(formatDuration(120), '2 h');
        assert.equal(formatDuration(-5), '0 min');
    });

    it('formats fractions as percentages without inventing precision', () => {
        assert.equal(formatPercent(0.7027027027027027), '70%');
        assert.equal(formatPercent(0.7027027027027027, 1), '70.3%');
        assert.equal(formatNumber(21.822737227076228), '21.8');
        assert.equal(formatNumber(21.822737227076228, 3), '21.823');
    });
});

describe('cleanLabel', () => {
    it('trims display whitespace, which the real feed needs', () => {
        // Real values from GET /trains/{n}/state in this repo.
        assert.equal(cleanLabel('RANI KAMLAPATI '), 'RANI KAMLAPATI');
        assert.equal(cleanLabel(' New Delhi'), 'New Delhi');
    });

    it('does not silently correct a source defect, only whitespace', () => {
        // "Daliy" is a typo in the source CSV. It must still read "Daliy".
        assert.equal(cleanLabel('Daliy'), 'Daliy');
    });

    it('collapses internal runs of whitespace', () => {
        assert.equal(cleanLabel('New   Delhi\n'), 'New Delhi');
    });

    it('falls back to a placeholder for nothing at all', () => {
        assert.equal(cleanLabel(''), 'Unknown');
        assert.equal(cleanLabel(null), 'Unknown');
        assert.equal(cleanLabel('   ', { placeholder: 'No station' }), 'No station');
    });
});

describe('prefersReducedMotion', () => {
    it('defaults to reduced motion when there is no browser to ask', () => {
        assert.equal(prefersReducedMotion(), true, 'the safe default is no motion');
    });

    it('reports what the media query says', () => {
        globalThis.window = { matchMedia: (q) => ({ matches: q.includes('reduce') }) };
        assert.equal(prefersReducedMotion(), true);
        globalThis.window = { matchMedia: () => ({ matches: false }) };
        assert.equal(prefersReducedMotion(), false);
    });
});

describe('countUp', () => {
    const makeElement = () => ({ textContent: '', dataset: {} });

    const allowMotion = () => {
        globalThis.window = { matchMedia: () => ({ matches: false }) };
        globalThis.performance = { now: () => 0 };
        const frames = [];
        globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
        return frames;
    };

    it('writes the real number before any animation decision', () => {
        const element = makeElement();
        allowMotion();
        countUp(element, 21.822737227076228);
        // Synchronously, before a single frame has run.
        assert.equal(element.textContent, '21.8');
    });

    it('still shows the number when motion is reduced', () => {
        const element = makeElement();
        const animated = countUp(element, 42);
        assert.equal(animated, false);
        assert.equal(element.textContent, '42.0');
    });

    it('does not animate when a poll returns the same value', () => {
        const element = makeElement();
        allowMotion();
        assert.equal(countUp(element, 21.8), true, 'first paint animates');
        assert.equal(countUp(element, 21.8), false, 'an unchanged poll must not animate');
        assert.equal(countUp(element, 21.8), false);
    });

    it('animates again when the value really changes', () => {
        const element = makeElement();
        allowMotion();
        countUp(element, 10);
        assert.equal(countUp(element, 12), true);
    });

    it('shows a placeholder and forgets the value for a non-number', () => {
        const element = makeElement();
        element.dataset.countUpValue = '10';
        countUp(element, null, { format: () => 'Not available' });
        assert.equal(element.textContent, 'Not available');
        assert.equal(element.dataset.countUpValue, undefined);
    });

    it('lands exactly on the target when the frames run', () => {
        const element = makeElement();
        const frames = allowMotion();
        countUp(element, 100, { format: (n) => n.toFixed(0), durationMs: 400 });
        globalThis.performance.now = () => 400;
        frames.forEach((frame) => frame(400));
        assert.equal(element.textContent, '100');
    });

    it('abandons a superseded animation instead of fighting the newer value', () => {
        const element = makeElement();
        const frames = allowMotion();
        countUp(element, 100, { format: (n) => n.toFixed(0) });
        countUp(element, 5, { format: (n) => n.toFixed(0) });
        // Run the first animation's pending frame; it must not overwrite 5.
        frames[0](100);
        assert.equal(element.dataset.countUpValue, '5');
    });

    it('tolerates a missing element', () => {
        assert.equal(countUp(null, 5), false);
    });
});
