/**
 * Pure geometry and data helpers for the RailPulse chart module.
 *
 * Nothing here touches the DOM, so it is unit-testable under `node --test`.
 * charts.js holds the rendering layer that consumes these.
 */

import { finite } from './format.js';

// Re-exported so chart consumers have one import for the numeric guard.
export { finite };

/** Largest number of points actually drawn. Above this we downsample. */
export const MAX_DRAWN_POINTS = 600;

/** Above this many points, per-point focusable nodes are dropped (see charts.js). */
export const MAX_FOCUSABLE_POINTS = 60;

/**
 * Series styling. Colour is never the only encoding: every series also carries a
 * dash pattern and a marker shape, and charts label series directly where room allows.
 *
 * `stroke` is a graphical mark, so WCAG 1.4.11 (3:1) applies -- measured on --paper:
 * orange 3.31. `text` is used for legend and tooltip copy, where WCAG 1.4.3 (4.5:1)
 * applies -- measured on --paper: orange-dark 5.19, slate 5.66, green 5.05,
 * plum 7.00, red 5.48.
 */
export const SERIES_STYLES = Object.freeze({
    predicted: { stroke: 'var(--chart-predicted)', text: 'var(--chart-predicted-text)', dash: '', marker: 'circle' },
    scheduled: { stroke: 'var(--chart-scheduled)', text: 'var(--chart-scheduled)', dash: '6 4', marker: 'square' },
    observed: { stroke: 'var(--chart-observed)', text: 'var(--chart-observed)', dash: '2 3', marker: 'triangle' },
    baseline: { stroke: 'var(--chart-baseline)', text: 'var(--chart-baseline)', dash: '10 3 2 3', marker: 'diamond' },
    warning: { stroke: 'var(--chart-warning)', text: 'var(--chart-warning)', dash: '1 4', marker: 'cross' },
});

export const SERIES_ORDER = Object.freeze(['predicted', 'scheduled', 'observed', 'baseline', 'warning']);

export function styleFor(role, index = 0) {
    return SERIES_STYLES[role] || SERIES_STYLES[SERIES_ORDER[index % SERIES_ORDER.length]];
}

/** [min, max] of the finite values, or null when there are none. */
export function extent(values) {
    let min = Infinity;
    let max = -Infinity;
    for (const value of values) {
        const n = finite(value);
        if (n === null) continue;
        if (n < min) min = n;
        if (n > max) max = n;
    }
    return min === Infinity ? null : [min, max];
}

/**
 * Widen a domain so marks are not flush against the frame, and so a flat
 * series still gets a usable axis instead of a zero-width domain.
 */
export function padDomain(domain, { pad = 0.08, includeZero = false } = {}) {
    if (!domain) return [0, 1];
    let [min, max] = domain;
    if (includeZero) {
        min = Math.min(min, 0);
        max = Math.max(max, 0);
    }
    if (min === max) {
        const nudge = Math.abs(min) > 1 ? Math.abs(min) * 0.1 : 1;
        return [min - nudge, max + nudge];
    }
    const span = (max - min) * pad;
    return [min - span, max + span];
}

/** A linear scale with an `invert` for pointer and keyboard hit-testing. */
export function linearScale(domain, range) {
    const [d0, d1] = domain;
    const [r0, r1] = range;
    const span = d1 - d0 || 1;
    const scale = (value) => r0 + ((Number(value) - d0) / span) * (r1 - r0);
    scale.invert = (pixel) => d0 + ((pixel - r0) / ((r1 - r0) || 1)) * span;
    scale.domain = [d0, d1];
    scale.range = [r0, r1];
    return scale;
}

/**
 * Human-readable tick values covering [min, max] on a 1/2/5 x 10^n step.
 * Returns ticks inside the domain only, so no tick is drawn off-frame.
 */
export function niceTicks(min, max, count = 5) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    if (min === max) return [min];
    const rawStep = (max - min) / Math.max(1, count);
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const normalised = rawStep / magnitude;
    const step = (normalised >= 5 ? 5 : normalised >= 2 ? 2 : 1) * magnitude;
    const ticks = [];
    const start = Math.ceil(min / step) * step;
    for (let value = start; value <= max + step * 1e-9; value += step) {
        // Re-round to kill float drift such as 0.30000000000000004.
        ticks.push(Number(value.toPrecision(12)));
    }
    return ticks;
}

/**
 * Reduce a series to at most `maxPoints` for drawing.
 *
 * Buckets the points and keeps each bucket's minimum and maximum y, so spikes
 * survive instead of being averaged away, and always keeps the first and last
 * point so the line still spans the real domain. Deterministic: no sampling.
 */
export function downsample(points, maxPoints = MAX_DRAWN_POINTS) {
    if (!Array.isArray(points) || points.length <= maxPoints || maxPoints < 4) {
        return { points: points || [], drawn: points ? points.length : 0, total: points ? points.length : 0 };
    }
    const total = points.length;
    const inner = points.slice(1, -1);
    const buckets = Math.max(1, Math.floor((maxPoints - 2) / 2));
    const size = inner.length / buckets;
    const kept = [points[0]];
    for (let b = 0; b < buckets; b += 1) {
        const slice = inner.slice(Math.floor(b * size), Math.floor((b + 1) * size));
        if (!slice.length) continue;
        let lo = slice[0];
        let hi = slice[0];
        for (const point of slice) {
            if (point.y < lo.y) lo = point;
            if (point.y > hi.y) hi = point;
        }
        // Preserve x order within the bucket.
        if (lo === hi) kept.push(lo);
        else kept.push(...(lo.x <= hi.x ? [lo, hi] : [hi, lo]));
    }
    kept.push(points[total - 1]);
    return { points: kept, drawn: kept.length, total };
}

/**
 * Equal-width bins over the finite values. `binCount` is a request, not a
 * promise: a degenerate range collapses to one bin rather than dividing by zero.
 */
export function histogram(values, binCount = 12) {
    const usable = values.map(finite).filter((n) => n !== null);
    if (!usable.length) return { bins: [], min: null, max: null, count: 0 };
    const [min, max] = extent(usable);
    if (min === max) {
        return { bins: [{ from: min, to: min, count: usable.length }], min, max, count: usable.length };
    }
    const bins = Math.max(1, Math.floor(binCount));
    const width = (max - min) / bins;
    const out = Array.from({ length: bins }, (unused, i) => ({
        from: min + i * width,
        to: min + (i + 1) * width,
        count: 0,
    }));
    for (const value of usable) {
        const index = Math.min(bins - 1, Math.floor((value - min) / width));
        out[index].count += 1;
    }
    return { bins: out, min, max, count: usable.length };
}

/**
 * Delay band for a value, from the model's own band table
 * (metadata.delay_bands, served as [[lower, upper, label], ...]).
 *
 * The training dataset contains no negative delays, so there is no "early"
 * band and none is invented here.
 */
export function bandFor(minutes, bands) {
    const n = finite(minutes);
    if (n === null || !Array.isArray(bands) || !bands.length) return null;
    for (const entry of bands) {
        const [lower, upper, label] = entry;
        const hi = upper === null || upper === undefined ? Infinity : Number(upper);
        if (n >= Number(lower) && n < hi) return label;
    }
    // Above a closed top band, the top band is still the honest answer. Below
    // the lowest band there is no answer: the dataset contains no negative
    // delays, so no "early" band exists and none is invented here.
    const last = bands[bands.length - 1];
    if (Array.isArray(last) && n >= Number(last[0])) return last[2];
    return null;
}

/**
 * Rows for the "View as table" panel, derived from the same series the chart
 * drew, so the table can never disagree with the picture.
 */
export function tableFromSeries(series, { xLabel = 'x', formatX = String, formatY = String } = {}) {
    const keys = [];
    const byX = new Map();
    for (const one of series) {
        keys.push(one.label);
        for (const point of one.points || []) {
            const key = String(point.x);
            if (!byX.has(key)) byX.set(key, { x: point.x, values: {} });
            byX.get(key).values[one.label] = point.y;
        }
    }
    const rows = [...byX.values()]
        .sort((a, b) => (a.x > b.x ? 1 : a.x < b.x ? -1 : 0))
        .map((row) => [formatX(row.x), ...keys.map((key) => (
            row.values[key] === undefined ? '--' : formatY(row.values[key])
        ))]);
    return { columns: [xLabel, ...keys], rows };
}

/**
 * The sentence a screen reader hears instead of the picture. Built from the
 * drawn data, so it states real ranges rather than describing the chart type.
 */
export function summaryText({ title, series = [], xLabel = '', yLabel = '', note = '' }) {
    const parts = [title].filter(Boolean);
    for (const one of series) {
        const ys = (one.points || []).map((p) => p.y);
        const range = extent(ys);
        if (!range) {
            parts.push(`${one.label}: no data.`);
            continue;
        }
        const [min, max] = range;
        const last = ys[ys.length - 1];
        parts.push(
            `${one.label}: ${ys.length} point${ys.length === 1 ? '' : 's'}, `
            + `from ${round(min)} to ${round(max)}${yLabel ? ` ${yLabel}` : ''}, `
            + `latest ${round(last)}.`,
        );
    }
    if (xLabel) parts.push(`Horizontal axis: ${xLabel}.`);
    if (note) parts.push(note);
    return parts.join(' ');
}

function round(value) {
    const n = finite(value);
    if (n === null) return 'no value';
    return Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1);
}

/** SVG path for a polyline, skipping gaps rather than drawing through them. */
export function linePath(points, sx, sy) {
    let path = '';
    let open = false;
    for (const point of points) {
        if (finite(point.y) === null) {
            open = false;
            continue;
        }
        const command = open ? 'L' : 'M';
        path += `${command}${sx(point.x).toFixed(2)} ${sy(point.y).toFixed(2)}`;
        open = true;
    }
    return path;
}

/** Closed path for an uncertainty band: lower edge forward, upper edge back. */
export function bandPath(points, sx, sy) {
    const usable = points.filter((p) => finite(p.lower) !== null && finite(p.upper) !== null);
    if (usable.length < 2) return '';
    const forward = usable.map((p) => `${sx(p.x).toFixed(2)} ${sy(p.lower).toFixed(2)}`);
    const back = [...usable].reverse().map((p) => `${sx(p.x).toFixed(2)} ${sy(p.upper).toFixed(2)}`);
    return `M${forward.join('L')}L${back.join('L')}Z`;
}

/** Marker path centred on (x, y), one shape per series. */
export function markerPath(shape, x, y, r = 3.4) {
    switch (shape) {
        case 'square':
            return `M${x - r} ${y - r}h${r * 2}v${r * 2}h${-r * 2}Z`;
        case 'triangle':
            return `M${x} ${y - r * 1.2}L${x + r * 1.1} ${y + r * 0.8}L${x - r * 1.1} ${y + r * 0.8}Z`;
        case 'diamond':
            return `M${x} ${y - r * 1.3}L${x + r * 1.1} ${y}L${x} ${y + r * 1.3}L${x - r * 1.1} ${y}Z`;
        case 'cross':
            return `M${x - r} ${y - r}L${x + r} ${y + r}M${x - r} ${y + r}L${x + r} ${y - r}`;
        case 'circle':
        default:
            return `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
    }
}

/** Index of the point nearest an x pixel, for tooltips. -1 when empty. */
export function nearestIndex(points, sx, pixelX) {
    let best = -1;
    let bestDistance = Infinity;
    points.forEach((point, index) => {
        const distance = Math.abs(sx(point.x) - pixelX);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = index;
        }
    });
    return best;
}
