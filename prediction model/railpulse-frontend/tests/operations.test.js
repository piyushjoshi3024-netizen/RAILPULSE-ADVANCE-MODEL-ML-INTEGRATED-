/**
 * Unit tests for the scenario tool's pure helper.
 *
 * `shiftWallClock` moves a scheduled arrival by whole minutes. It must stay in
 * the naive wall-clock shape the API expects: converting to an instant and back
 * would re-introduce the offset confusion the formatter exists to avoid, and a
 * silent 5h30m shift here would corrupt the stored state the scenario writes to.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// The module's import chain reaches config.js, which reads `window` at load
// time, so a minimal browser stub has to exist before the dynamic import. Only
// the pure helper below is exercised; nothing here touches the DOM.
globalThis.window = { matchMedia: () => ({ matches: false }) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.localStorage = globalThis.sessionStorage;

const { shiftWallClock } = await import('../js/pages/operations.js');

describe('shiftWallClock', () => {
    const SCHEDULED = '2026-10-21T06:00:00';

    it('returns the value unchanged for a zero shift', () => {
        assert.equal(shiftWallClock(SCHEDULED, 0), '2026-10-21T06:00:00');
    });

    it('shifts hours within the same day', () => {
        assert.equal(shiftWallClock(SCHEDULED, 360), '2026-10-21T12:00:00');
        assert.equal(shiftWallClock(SCHEDULED, -360), '2026-10-21T00:00:00');
    });

    it('crosses midnight backwards into the previous day', () => {
        assert.equal(shiftWallClock(SCHEDULED, -420), '2026-10-20T23:00:00');
    });

    it('crosses midnight forwards into the next day', () => {
        assert.equal(shiftWallClock('2026-10-21T23:30:00', 60), '2026-10-22T00:30:00');
    });

    it('moves whole days and weeks, which is what changes day_of_week', () => {
        assert.equal(shiftWallClock(SCHEDULED, 1440), '2026-10-22T06:00:00');
        assert.equal(shiftWallClock(SCHEDULED, 10080), '2026-10-28T06:00:00');
    });

    it('crosses a month and a year boundary', () => {
        assert.equal(shiftWallClock('2026-10-31T23:00:00', 120), '2026-11-01T01:00:00');
        assert.equal(shiftWallClock('2026-12-31T23:00:00', 120), '2027-01-01T01:00:00');
    });

    it('handles a leap day without inventing one', () => {
        assert.equal(shiftWallClock('2028-02-28T12:00:00', 1440), '2028-02-29T12:00:00');
        assert.equal(shiftWallClock('2027-02-28T12:00:00', 1440), '2027-03-01T12:00:00');
    });

    it('never applies a timezone offset', () => {
        // The digits must move by exactly the requested minutes. A 5h30m slip
        // here would write a wrong schedule into the train's stored state.
        assert.equal(shiftWallClock(SCHEDULED, 1), '2026-10-21T06:01:00');
        assert.ok(!shiftWallClock(SCHEDULED, 0).endsWith('Z'), 'must stay naive');
        assert.ok(!/[+-]\d{2}:\d{2}$/.test(shiftWallClock(SCHEDULED, 0)), 'must carry no offset');
    });

    it('keeps the naive ISO shape the backend expects', () => {
        assert.match(shiftWallClock(SCHEDULED, 95), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    });

    it('preserves seconds through a shift', () => {
        assert.equal(shiftWallClock('2026-10-21T06:00:45', 60), '2026-10-21T07:00:45');
    });

    it('tolerates a value carrying microseconds, as Mongo returns', () => {
        assert.equal(shiftWallClock('2026-10-21T06:00:00.123456', 60), '2026-10-21T07:00:00');
    });

    it('returns unparseable input untouched rather than guessing a date', () => {
        assert.equal(shiftWallClock('nonsense', 60), 'nonsense');
        assert.equal(shiftWallClock(null, 60), null);
        assert.equal(shiftWallClock(undefined, 60), undefined);
    });
});
