/**
 * Unit tests for the formatting, time and motion helpers.
 *
 * The timezone tests are the important ones. They pin a policy that is not
 * uniform across the API, and a regression here moves every arrival time on
 * screen by 5h30m without anything crashing.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
    DISPLAY_ZONE, FIELD_TIME_KIND, INSTANT, IST_OFFSET_MINUTES, STALE_AFTER_MS, TIME_NOTICE,
    WALL_CLOCK, age, cleanLabel, countUp, describeSpan, finite, formatClock, formatDay,
    formatDelayMinutes, formatDuration, formatInstant, formatNumber, formatPercent,
    parseInstant, prefersReducedMotion, timeKindFor,
} from '../js/format.js';

/*
 * Every literal below was captured from this repo's running FastAPI backend on
 * 2026-10-20, not invented. The DEMO state and the prediction it produced:
 *
 *   GET  /api/v1/trains/12002/state -> scheduled_arrival 2026-10-21T06:00:00
 *                                      current_timestamp 2026-10-20T08:24:51.409000
 *   POST /api/v1/predict/eta        -> predicted_eta     2026-10-21T06:06:55.306953Z
 *                                      predicted_delay_minutes 6.921782546
 */
const SCHEDULED = '2026-10-21T06:00:00';              // naive, Indian wall-clock
const PREDICTED_ETA = '2026-10-21T06:06:55.306953Z';  // "Z" is synthetic
const CURRENT_TS = '2026-10-20T08:24:51.409000';      // naive, a true UTC instant
const PREDICTED_DELAY_MINUTES = 6.921782546;

afterEach(() => {
    delete globalThis.window;
    delete globalThis.requestAnimationFrame;
    delete globalThis.performance;
});

describe('timezone policy', () => {
    it('displays India Standard Time', () => {
        assert.equal(DISPLAY_ZONE.timeZone, 'Asia/Kolkata');
        assert.equal(DISPLAY_ZONE.label, 'IST');
        assert.equal(IST_OFFSET_MINUTES, 330);
    });

    it('classifies each field by what it provably is', () => {
        assert.equal(timeKindFor('scheduled_arrival'), WALL_CLOCK);
        assert.equal(timeKindFor('predicted_eta'), WALL_CLOCK);
        assert.equal(timeKindFor('eta_lower'), WALL_CLOCK);
        assert.equal(timeKindFor('eta_upper'), WALL_CLOCK);
        assert.equal(timeKindFor('current_timestamp'), INSTANT);
        assert.equal(timeKindFor('updated_at'), INSTANT);
        assert.equal(timeKindFor('timestamp'), INSTANT);
    });

    it('covers the Node camelCase mirrors as well as the FastAPI names', () => {
        assert.equal(timeKindFor('scheduledEta'), WALL_CLOCK);
        assert.equal(timeKindFor('predictedEta'), WALL_CLOCK);
        assert.equal(timeKindFor('predictionTimestamp'), INSTANT);
    });

    it('defaults an unknown field to INSTANT, the safe direction', () => {
        // Treating a true instant as wall-clock silently shifts it 5h30m;
        // rendering a true instant in IST is simply correct.
        assert.equal(timeKindFor('some_new_field'), INSTANT);
        assert.equal(timeKindFor(undefined), INSTANT);
        assert.ok(Object.values(FIELD_TIME_KIND).every((k) => k === WALL_CLOCK || k === INSTANT));
    });

    it('states the assumption on screen rather than only in a comment', () => {
        assert.match(TIME_NOTICE, /India Standard Time/);
        assert.match(TIME_NOTICE, /UTC\+5:30/);
        assert.match(TIME_NOTICE, /records no timezone/);
        assert.match(TIME_NOTICE, /is an assumption/);
    });
});

describe('WALL_CLOCK fields: Indian local digits, read as IST', () => {
    it('renders a naive schedule at its face value in IST', () => {
        // 06:00:00 in the CSV must read 06:00 IST, not 11:30 IST.
        assert.equal(formatInstant(SCHEDULED, { kind: WALL_CLOCK }), '21 Oct 2026, 06:00 IST');
        assert.equal(formatClock(SCHEDULED, { kind: WALL_CLOCK }), '06:00 IST');
        assert.equal(formatDay(SCHEDULED, { kind: WALL_CLOCK }), '21 Oct 2026');
    });

    it('does not read a naive Indian local time as UTC', () => {
        const { date } = parseInstant(SCHEDULED, WALL_CLOCK);
        // 06:00 IST is 00:30 UTC. If this were read as UTC it would be 06:00 UTC.
        assert.equal(date.toISOString(), '2026-10-21T00:30:00.000Z');
    });

    it('reports that the backend stated no zone, so a caller can disclose it', () => {
        assert.equal(parseInstant(SCHEDULED, WALL_CLOCK).naive, true);
        assert.equal(parseInstant(PREDICTED_ETA, WALL_CLOCK).naive, false);
    });

    it('ignores the synthetic Z on predicted_eta', () => {
        // predictor.py stamps UTC onto a naive anchor, so the Z is a label the
        // value never earned. Honouring it would move the ETA 5h30m.
        assert.equal(formatInstant(PREDICTED_ETA, { kind: WALL_CLOCK }), '21 Oct 2026, 06:06 IST');
    });

    it('keeps the ETA consistent with the schedule it was derived from', () => {
        const scheduled = parseInstant(SCHEDULED, WALL_CLOCK).date;
        const predicted = parseInstant(PREDICTED_ETA, WALL_CLOCK).date;
        const gapMinutes = (predicted - scheduled) / 60000;
        // The gap on screen must equal the delay the model actually produced.
        // Tolerance is one millisecond expressed in minutes: the API sends
        // microseconds (.306953) and a JS Date holds milliseconds (.306), so a
        // sub-millisecond difference is a representation limit, not a drift.
        const oneMillisecondInMinutes = 1 / 60000;
        assert.ok(Math.abs(gapMinutes - PREDICTED_DELAY_MINUTES) < oneMillisecondInMinutes,
            `displayed gap ${gapMinutes} should match predicted_delay_minutes ${PREDICTED_DELAY_MINUTES}`);
        // And it must certainly be minutes, not hours.
        assert.ok(gapMinutes > 6 && gapMinutes < 7, `gap was ${gapMinutes} minutes`);
    });

    it('would have shown a 337-minute delay had the Z been honoured -- the regression this guards', () => {
        const scheduled = parseInstant(SCHEDULED, WALL_CLOCK).date;
        const wrong = parseInstant(PREDICTED_ETA, INSTANT).date;
        const wrongGap = (wrong - scheduled) / 60000;
        assert.ok(wrongGap > 300, 'misreading the ETA family inflates the delay by about 5h30m');
        assert.equal(formatInstant(PREDICTED_ETA, { kind: INSTANT }), '21 Oct 2026, 11:36 IST');
    });
});

describe('INSTANT fields: true points in time, converted to IST', () => {
    it('converts a naive backend instant from UTC to IST', () => {
        // datetime.now(timezone.utc) stored naive: 08:24 UTC is 13:54 IST.
        assert.equal(formatInstant(CURRENT_TS, { kind: INSTANT }), '20 Oct 2026, 13:54 IST');
    });

    it('does not read a true instant as Indian local', () => {
        const { date } = parseInstant(CURRENT_TS, INSTANT);
        assert.equal(date.toISOString(), '2026-10-20T08:24:51.409Z');
    });

    it('preserves and converts an explicit UTC offset', () => {
        const { date, naive } = parseInstant('2026-09-28T15:53:46Z', INSTANT);
        assert.equal(naive, false);
        assert.equal(date.toISOString(), '2026-09-28T15:53:46.000Z');
        assert.equal(formatInstant('2026-09-28T15:53:46Z'), '28 Sep 2026, 21:23 IST');
    });

    it('preserves and converts a non-UTC offset without re-interpreting it', () => {
        assert.equal(formatInstant('2026-09-28T21:23:46+05:30'), '28 Sep 2026, 21:23 IST');
        assert.equal(formatInstant('2026-09-28T10:53:46-05:00'), '28 Sep 2026, 21:23 IST');
        // All three spellings are the same instant and must render identically.
        assert.equal(formatInstant('2026-09-28T15:53:46Z'), formatInstant('2026-09-28T21:23:46+05:30'));
    });

    it('handles an offset written without a colon', () => {
        assert.equal(formatInstant('2026-09-28T21:23:46+0530'), '28 Sep 2026, 21:23 IST');
    });

    it('is the default kind when none is given', () => {
        assert.equal(formatInstant(CURRENT_TS), formatInstant(CURRENT_TS, { kind: INSTANT }));
    });
});

describe('parseInstant edge cases', () => {
    it('returns null for junk instead of an Invalid Date, in both kinds', () => {
        for (const value of ['', '   ', null, undefined, 'tomorrow', 42, {}]) {
            assert.equal(parseInstant(value, INSTANT).date, null, `INSTANT ${JSON.stringify(value)}`);
            assert.equal(parseInstant(value, WALL_CLOCK).date, null, `WALL_CLOCK ${JSON.stringify(value)}`);
        }
    });

    it('passes a Date through and rejects an invalid one', () => {
        const date = new Date(CURRENT_TS + 'Z');
        assert.equal(parseInstant(date).date, date);
        assert.equal(parseInstant(new Date('nope')).date, null);
    });

    it('crosses a date boundary correctly when converting into IST', () => {
        // 22:00 UTC is 03:30 IST the following day.
        assert.equal(formatInstant('2026-10-20T22:00:00Z'), '21 Oct 2026, 03:30 IST');
        // And 00:15 IST is the previous day in UTC.
        assert.equal(parseInstant('2026-10-21T00:15:00', WALL_CLOCK).date.toISOString(),
            '2026-10-20T18:45:00.000Z');
    });

    it('uses a 24-hour clock, so 00:xx is never printed as 12:xx', () => {
        assert.equal(formatClock('2026-01-01T00:30:00', { kind: WALL_CLOCK }), '00:30 IST');
        assert.equal(formatClock('2026-01-01T13:05:00', { kind: WALL_CLOCK }), '13:05 IST');
    });

    it('labels the zone on every rendered time', () => {
        assert.match(formatInstant(CURRENT_TS), /IST$/);
        assert.match(formatClock(CURRENT_TS), /IST$/);
        assert.match(formatInstant(SCHEDULED, { kind: WALL_CLOCK }), /IST$/);
    });

    it('shows a placeholder rather than a fabricated time', () => {
        assert.equal(formatInstant(null), 'Not available');
        assert.equal(formatClock(null), '--:--');
        assert.equal(formatInstant(null, { placeholder: 'No ETA' }), 'No ETA');
        assert.equal(formatInstant(null, { kind: WALL_CLOCK }), 'Not available');
    });
});

describe('age', () => {
    const now = Date.parse('2026-10-20T06:00:00Z');

    it('ages a value and calls it fresh below the threshold', () => {
        const result = age('2026-10-20T05:58:00Z', now);
        assert.equal(result.stale, false);
        assert.equal(result.text, '2 minutes ago');
    });

    it('ages a naive backend instant as UTC, not as Indian local', () => {
        // CURRENT_TS is 08:24:51 UTC. Against 2026-10-20T06:00Z it is in the
        // future; misreading it as IST would make a just-written state look
        // 5h30m old instead, inverting the staleness verdict.
        assert.equal(age(CURRENT_TS, Date.parse('2026-10-20T09:00:00Z')).text, '35 minutes ago');
        assert.equal(age(CURRENT_TS, Date.parse('2026-10-20T08:25:00Z')).stale, false);
    });

    it('calls a genuinely old state stale', () => {
        const result = age('2026-09-28T13:20:50.842000', now);
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
