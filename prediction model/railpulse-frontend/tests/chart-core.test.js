/**
 * Unit tests for the pure chart layer.
 *
 * Only DOM-free code is tested here, because the repo has no DOM test harness
 * and adding jsdom would need approval at gate D2. The rendering layer in
 * charts.js is exercised in a real browser by the Phase 5 Playwright smoke run.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    MAX_DRAWN_POINTS, bandFor, bandPath, downsample, extent, histogram, linePath,
    finite, linearScale, markerPath, nearestIndex, niceTicks, padDomain, styleFor,
    summaryText, tableFromSeries,
} from '../js/chart-core.js';

describe('extent', () => {
    it('ignores non-finite values rather than poisoning the domain', () => {
        assert.deepEqual(extent([3, NaN, 1, null, 9, undefined, Infinity]), [1, 9]);
    });

    it('returns null when there is nothing finite, so callers can show empty', () => {
        assert.equal(extent([]), null);
        assert.equal(extent([NaN, null, 'abc']), null);
    });

    it('handles negative-only data (residuals can be all-negative)', () => {
        assert.deepEqual(extent([-9, -2, -30]), [-30, -2]);
    });
});

describe('padDomain', () => {
    it('gives a flat series a usable domain instead of zero width', () => {
        const [lo, hi] = padDomain([15, 15]);
        assert.ok(hi > lo, 'a flat series must still produce a drawable domain');
        assert.ok(lo < 15 && hi > 15);
    });

    it('includes zero when asked, so bar baselines are honest', () => {
        const [lo] = padDomain([12, 40], { includeZero: true });
        assert.ok(lo <= 0, 'a bar chart domain must reach zero');
    });

    it('does not force zero when not asked', () => {
        const [lo] = padDomain([12, 40], { includeZero: false });
        assert.ok(lo > 0);
    });

    it('survives a null domain', () => {
        assert.deepEqual(padDomain(null), [0, 1]);
    });
});

describe('linearScale', () => {
    it('maps the domain onto the range and inverts round-trip', () => {
        const scale = linearScale([0, 100], [0, 400]);
        assert.equal(scale(0), 0);
        assert.equal(scale(50), 200);
        assert.equal(scale(100), 400);
        assert.equal(scale.invert(200), 50);
    });

    it('supports an inverted range, which is how y axes are drawn', () => {
        const y = linearScale([0, 10], [240, 0]);
        assert.equal(y(0), 240);
        assert.equal(y(10), 0);
    });

    it('does not divide by zero on a degenerate domain', () => {
        const scale = linearScale([5, 5], [0, 100]);
        assert.ok(Number.isFinite(scale(5)));
    });
});

describe('niceTicks', () => {
    it('produces round steps inside the domain', () => {
        const ticks = niceTicks(0, 100, 5);
        assert.deepEqual(ticks, [0, 20, 40, 60, 80, 100]);
    });

    it('never emits a tick outside the domain', () => {
        const ticks = niceTicks(3, 97, 5);
        assert.ok(ticks.every((t) => t >= 3 && t <= 97), `got ${ticks}`);
    });

    it('kills floating-point drift', () => {
        for (const tick of niceTicks(0, 1, 5)) {
            assert.equal(String(tick).length <= 4, true, `ugly tick ${tick}`);
        }
    });

    it('returns a single tick for a flat domain and nothing for garbage', () => {
        assert.deepEqual(niceTicks(7, 7), [7]);
        assert.deepEqual(niceTicks(NaN, 5), []);
    });
});

describe('downsample', () => {
    const ramp = (n) => Array.from({ length: n }, (unused, i) => ({ x: i, y: i }));

    it('leaves a short series untouched', () => {
        const result = downsample(ramp(50), 600);
        assert.equal(result.drawn, 50);
        assert.equal(result.total, 50);
        assert.equal(result.points.length, 50);
    });

    it('brings 5,000 points under the drawing budget', () => {
        const result = downsample(ramp(5000), MAX_DRAWN_POINTS);
        assert.equal(result.total, 5000);
        assert.ok(result.drawn <= MAX_DRAWN_POINTS, `drew ${result.drawn}`);
        assert.ok(result.drawn > 100, 'should not over-reduce');
    });

    it('keeps the real first and last point so the domain is not truncated', () => {
        const points = ramp(5000);
        const result = downsample(points, MAX_DRAWN_POINTS);
        assert.deepEqual(result.points[0], points[0]);
        assert.deepEqual(result.points[result.points.length - 1], points[4999]);
    });

    it('preserves a lone spike instead of averaging it away', () => {
        const points = ramp(5000).map((p) => ({ ...p, y: 1 }));
        points[2500] = { x: 2500, y: 9999 };
        const result = downsample(points, MAX_DRAWN_POINTS);
        assert.ok(result.points.some((p) => p.y === 9999), 'the spike must survive downsampling');
    });

    it('keeps x in ascending order', () => {
        const result = downsample(ramp(5000), MAX_DRAWN_POINTS);
        for (let i = 1; i < result.points.length; i += 1) {
            assert.ok(result.points[i].x >= result.points[i - 1].x, `x went backwards at ${i}`);
        }
    });

    it('is deterministic: no sampling, same input gives the same output', () => {
        const a = downsample(ramp(3000), 200);
        const b = downsample(ramp(3000), 200);
        assert.deepEqual(a.points, b.points);
    });

    it('tolerates null and empty input', () => {
        assert.deepEqual(downsample(null).points, []);
        assert.equal(downsample([]).total, 0);
    });
});

describe('histogram', () => {
    it('counts every value exactly once', () => {
        const values = [1, 2, 2, 3, 8, 9, 9, 9];
        const result = histogram(values, 4);
        assert.equal(result.bins.reduce((sum, b) => sum + b.count, 0), values.length);
    });

    it('puts the maximum in the last bin rather than off the end', () => {
        const result = histogram([0, 5, 10], 5);
        assert.equal(result.bins[result.bins.length - 1].count >= 1, true);
    });

    it('collapses a single-value set to one bin instead of dividing by zero', () => {
        const result = histogram([4, 4, 4], 10);
        assert.equal(result.bins.length, 1);
        assert.equal(result.bins[0].count, 3);
    });

    it('spans negative to positive, which residuals require', () => {
        const result = histogram([-20, -5, 0, 5, 25], 5);
        assert.equal(result.min, -20);
        assert.equal(result.max, 25);
    });

    it('returns an empty result for no finite data', () => {
        const result = histogram([NaN, null], 5);
        assert.deepEqual(result.bins, []);
        assert.equal(result.count, 0);
    });
});

describe('bandFor', () => {
    // Exactly as the trainer writes metadata.delay_bands.
    const bands = [[0, 5, 'ON_TIME'], [5, 15, 'MINOR'], [15, 30, 'MODERATE'], [30, 60, 'MAJOR'], [60, null, 'SEVERE']];

    it('maps values to the model\'s own band labels', () => {
        assert.equal(bandFor(0, bands), 'ON_TIME');
        assert.equal(bandFor(4.9, bands), 'ON_TIME');
        assert.equal(bandFor(5, bands), 'MINOR');
        assert.equal(bandFor(15.7, bands), 'MODERATE');
        assert.equal(bandFor(45, bands), 'MAJOR');
        assert.equal(bandFor(600, bands), 'SEVERE');
    });

    it('treats an open upper bound as unbounded', () => {
        assert.equal(bandFor(1e9, bands), 'SEVERE');
    });

    it('invents no "early" band for a negative delay, because the dataset has none', () => {
        assert.equal(bandFor(-5, bands), null);
    });

    it('returns null rather than guessing when there are no bands', () => {
        assert.equal(bandFor(10, []), null);
        assert.equal(bandFor(10, undefined), null);
        assert.equal(bandFor(NaN, bands), null);
    });
});

describe('tableFromSeries', () => {
    it('produces one row per x with a column per series', () => {
        const { columns, rows } = tableFromSeries([
            { label: 'Predicted', points: [{ x: 1, y: 10 }, { x: 2, y: 20 }] },
            { label: 'Scheduled', points: [{ x: 1, y: 5 }, { x: 2, y: 5 }] },
        ]);
        assert.deepEqual(columns, ['x', 'Predicted', 'Scheduled']);
        assert.equal(rows.length, 2);
        assert.deepEqual(rows[0], ['1', '10', '5']);
    });

    it('marks a missing value rather than inventing one', () => {
        const { rows } = tableFromSeries([
            { label: 'A', points: [{ x: 1, y: 10 }, { x: 2, y: 20 }] },
            { label: 'B', points: [{ x: 1, y: 5 }] },
        ]);
        assert.deepEqual(rows[1], ['2', '20', '--']);
    });

    it('applies the caller\'s formatters so the table matches the chart', () => {
        const { rows } = tableFromSeries(
            [{ label: 'A', points: [{ x: 0, y: 1.234 }] }],
            { xLabel: 'When', formatX: () => 'noon', formatY: (v) => v.toFixed(1) },
        );
        assert.deepEqual(rows[0], ['noon', '1.2']);
    });
});

describe('summaryText', () => {
    it('states real ranges, not a description of the chart type', () => {
        const text = summaryText({
            title: 'Predicted delay',
            series: [{ label: 'P50', points: [{ x: 0, y: 10 }, { x: 1, y: 22.5 }] }],
            yLabel: 'minutes',
        });
        assert.match(text, /Predicted delay/);
        assert.match(text, /2 points/);
        assert.match(text, /10\.0 to 22\.5 minutes/);
        assert.match(text, /latest 22\.5/);
    });

    it('says so when a series is empty instead of claiming a range', () => {
        const text = summaryText({ title: 'T', series: [{ label: 'Empty', points: [] }] });
        assert.match(text, /Empty: no data\./);
    });

    it('carries a caller note, which is how limitations reach screen readers', () => {
        const text = summaryText({ title: 'T', series: [], note: 'Synthetic data.' });
        assert.match(text, /Synthetic data\./);
    });
});

describe('path builders', () => {
    const sx = linearScale([0, 2], [0, 100]);
    const sy = linearScale([0, 20], [100, 0]);

    it('starts a new subpath across a gap instead of drawing through it', () => {
        const path = linePath([{ x: 0, y: 10 }, { x: 1, y: NaN }, { x: 2, y: 20 }], sx, sy);
        assert.equal((path.match(/M/g) || []).length, 2, 'a gap must break the line');
    });

    it('closes an interval band only when there are at least two usable points', () => {
        assert.equal(bandPath([{ x: 0, lower: 1, upper: 2 }], sx, sy), '');
        const path = bandPath([{ x: 0, lower: 1, upper: 2 }, { x: 2, lower: 3, upper: 9 }], sx, sy);
        assert.match(path, /^M/);
        assert.match(path, /Z$/);
    });

    it('emits a distinct marker shape per series, which is the non-colour encoding', () => {
        const shapes = ['circle', 'square', 'triangle', 'diamond', 'cross'];
        const paths = shapes.map((shape) => markerPath(shape, 10, 10));
        assert.equal(new Set(paths).size, shapes.length, 'every marker must be visually distinct');
        for (const path of paths) assert.ok(path.length > 4);
    });
});

describe('nearestIndex', () => {
    const sx = linearScale([0, 10], [0, 100]);
    const points = Array.from({ length: 11 }, (unused, i) => ({ x: i, y: 0 }));

    it('finds the closest point to a pixel', () => {
        assert.equal(nearestIndex(points, sx, 0), 0);
        assert.equal(nearestIndex(points, sx, 52), 5);
        assert.equal(nearestIndex(points, sx, 100), 10);
    });

    it('clamps outside the plot rather than returning nothing', () => {
        assert.equal(nearestIndex(points, sx, -400), 0);
        assert.equal(nearestIndex(points, sx, 9999), 10);
    });

    it('returns -1 for an empty series', () => {
        assert.equal(nearestIndex([], sx, 10), -1);
    });
});

describe('styleFor', () => {
    it('gives every series a dash and a marker, not just a colour', () => {
        for (const role of ['predicted', 'scheduled', 'observed', 'baseline', 'warning']) {
            const style = styleFor(role);
            assert.ok(style.stroke, `${role} needs a stroke`);
            assert.ok(style.text, `${role} needs an AA-contrast text colour`);
            assert.ok(style.marker, `${role} needs a marker shape`);
        }
    });

    it('distinguishes the marks of any two series without colour', () => {
        const roles = ['predicted', 'scheduled', 'observed', 'baseline', 'warning'];
        const encodings = roles.map((role) => {
            const style = styleFor(role);
            return `${style.dash}|${style.marker}`;
        });
        assert.equal(new Set(encodings).size, roles.length, 'dash+marker must be unique per series');
    });

    it('falls back by index for an unknown role instead of returning undefined', () => {
        assert.ok(styleFor('nonsense', 1).stroke);
        assert.ok(styleFor(undefined, 7).stroke);
    });
});

describe('finite', () => {
    // Number(null) === 0 and Number('') === 0, which would chart a missing API
    // field as a real zero. These cases are the reason this guard exists.
    it('rejects the values that Number() silently turns into zero', () => {
        assert.equal(finite(null), null);
        assert.equal(finite(undefined), null);
        assert.equal(finite(''), null);
        assert.equal(finite(false), null);
        assert.equal(finite([]), null);
    });

    it('accepts real numbers, including negative and numeric strings', () => {
        assert.equal(finite(0), 0);
        assert.equal(finite(-12.5), -12.5);
        assert.equal(finite('21.8'), 21.8);
    });

    it('rejects non-finite numbers', () => {
        assert.equal(finite(NaN), null);
        assert.equal(finite(Infinity), null);
        assert.equal(finite('abc'), null);
    });

    it('means a null y is a gap in a line, not a zero', () => {
        const sx = linearScale([0, 2], [0, 100]);
        const sy = linearScale([0, 20], [100, 0]);
        const path = linePath([{ x: 0, y: 10 }, { x: 1, y: null }, { x: 2, y: 20 }], sx, sy);
        assert.equal((path.match(/M/g) || []).length, 2, 'a null must break the line, not plot at zero');
    });
});
