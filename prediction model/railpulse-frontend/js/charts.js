/**
 * Dependency-free SVG charts for RailPulse (gate D2: in-house, no library, no CDN).
 *
 * Safety: every chart is built with createElement / createElementNS and all text
 * is assigned through textContent or an SVG text node. No API-derived string is
 * ever concatenated into innerHTML, so the string-template style used elsewhere
 * in app.js cannot leak markup through a chart label.
 *
 * Accessibility
 *  - colour is never the only encoding: each series also has a dash pattern and
 *    a marker shape, and series are labelled directly in the legend
 *  - every chart carries an aria-label summary built from the drawn data
 *  - every chart has a "View as table" panel holding the same numbers
 *  - the plot is one focusable element; arrow keys step the read-out across
 *    points and announce it through a polite live region, which keeps tooltips
 *    keyboard-reachable without adding thousands of focusable nodes
 *
 * Motion: a draw-in reveal of <=400ms via a clipped rect, suppressed entirely
 * under prefers-reduced-motion. Marks and numbers are in the DOM before the
 * reveal runs, so motion never delays showing a value.
 *
 * Performance: series longer than MAX_DRAWN_POINTS are downsampled by
 * chart-core.downsample (min/max per bucket, so spikes survive) and the footer
 * states how many of how many points are drawn.
 */

import {
    MAX_DRAWN_POINTS, bandFor, bandPath, downsample, extent, finite, histogram, linePath,
    linearScale, markerPath, nearestIndex, niceTicks, padDomain, styleFor,
    summaryText, tableFromSeries,
} from './chart-core.js';

/**
 * The series the axis ticks and the read-out are keyed to.
 *
 * Not simply the first series: a leading series can legitimately be all-missing
 * (the stored prediction history has no delay_p50_minutes, for instance), and
 * keying off it would silently drop the x ticks and disable keyboard access to
 * a chart that is otherwise drawing fine.
 */
function anchorOf(series) {
    return series.find((one) => one.points.length) || series[0];
}
import { prefersReducedMotion } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = { top: 14, right: 14, bottom: 34, left: 48 };
const MIN_WIDTH = 260;
const MAX_WIDTH = 1180;

let chartSeq = 0;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function svg(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === '') continue;
        node.setAttribute(key, String(value));
    }
    return node;
}

function svgText(x, y, text, attrs = {}) {
    const node = svg('text', { x, y, ...attrs });
    node.textContent = String(text);
    return node;
}

/**
 * Render a chart into `mount`, replacing whatever was there.
 *
 * @param {HTMLElement} mount
 * @param {object} spec
 *   kind      'line' | 'bar' | 'scatter' | 'histogram' | 'interval' | 'progress' | 'sparkline'
 *   title     short heading (required)
 *   caption   one honest sentence about what the chart is
 *   source    endpoint or file the numbers came from (required -- rule 2)
 *   badges    [{kind, text}] passed to ui.badge
 *   series    [{label, role, points:[{x, y, lower, upper, label}]}]
 *   xLabel/yLabel, formatX/formatY, note, height, includeZero
 * @returns {{destroy: function, update: function}}
 */
export function renderChart(mount, spec) {
    if (!mount) return { destroy() {}, update() {} };
    let current = spec;
    let lastWidth = 0;

    const draw = () => {
        lastWidth = measure(mount);
        mount.textContent = '';
        mount.appendChild(buildCard(current, lastWidth));
    };

    draw();

    let observer = null;
    if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(() => {
            const width = measure(mount);
            if (Math.abs(width - lastWidth) > 8) draw();
        });
        observer.observe(mount);
    }

    return {
        destroy() {
            if (observer) observer.disconnect();
            mount.textContent = '';
        },
        update(next) {
            current = { ...current, ...next };
            draw();
        },
    };
}

function measure(mount) {
    const width = mount.getBoundingClientRect ? mount.getBoundingClientRect().width : 0;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(width) || 640));
}

/* --------------------------------------------------------------- the card */

function buildCard(spec, width) {
    const id = `chart-${(chartSeq += 1)}`;
    const figure = el('figure', 'chart-card');

    const head = el('figcaption', 'chart-head');
    const title = el('h4', 'chart-title', spec.title || 'Chart');
    title.id = `${id}-title`;
    head.appendChild(title);
    if (spec.caption) head.appendChild(el('p', 'chart-caption', spec.caption));
    if (spec.badges && spec.badges.length) {
        const badges = el('div', 'chart-badges');
        for (const badge of spec.badges) badges.appendChild(badgeNode(badge));
        head.appendChild(badges);
    }
    figure.appendChild(head);

    const prepared = prepareSeries(spec);
    const hidden = new Set();

    const plot = el('div', 'chart-plot');
    const readout = el('p', 'chart-readout');
    readout.id = `${id}-readout`;
    readout.setAttribute('role', 'status');
    readout.setAttribute('aria-live', 'polite');

    let legend = null;
    if (prepared.series.length > 1) {
        legend = buildLegend(prepared.series, hidden, () => repaint());
        figure.appendChild(legend);
    }

    figure.appendChild(plot);
    figure.appendChild(readout);

    const tableWrap = el('div', 'chart-table-wrap');
    tableWrap.id = `${id}-table`;
    tableWrap.hidden = true;
    figure.appendChild(tableWrap);

    const foot = el('footer', 'chart-foot');
    const toggle = el('button', 'chart-table-toggle', 'View as table');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', tableWrap.id);
    toggle.addEventListener('click', () => {
        const open = tableWrap.hidden;
        tableWrap.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Hide table' : 'View as table';
        if (open && !tableWrap.childElementCount) tableWrap.appendChild(buildTable(spec, prepared));
    });
    foot.appendChild(toggle);

    const sourceLine = spec.source ? `Source: ${spec.source}` : 'Source: not stated';
    const pointNote = prepared.downsampled
        ? ` - showing ${prepared.drawn} of ${prepared.total} points (min/max per bucket)`
        : '';
    foot.appendChild(el('p', 'chart-source', sourceLine + pointNote));
    figure.appendChild(foot);

    const repaint = () => {
        plot.textContent = '';
        plot.appendChild(paint(spec, prepared, hidden, width, id, readout));
    };
    repaint();

    return figure;
}

/**
 * A chart-head badge. Uses the same rp-badge classes as ui.badge() so a badge
 * looks identical whether it was built as a string or as a node -- they are one
 * visual language, not two.
 */
function badgeNode({ kind = 'note', text = '' }) {
    return el('span', `rp-badge rp-badge-${kind}`, text);
}

function buildLegend(series, hidden, onChange) {
    const legend = el('div', 'chart-legend');
    legend.setAttribute('role', 'group');
    legend.setAttribute('aria-label', 'Series shown. Toggle a series to hide it.');
    series.forEach((one) => {
        const button = el('button', 'chart-legend-item');
        button.type = 'button';
        button.setAttribute('aria-pressed', 'true');
        const swatch = svg('svg', { width: 22, height: 12, 'aria-hidden': 'true', class: 'chart-swatch' });
        swatch.appendChild(svg('path', {
            d: 'M1 6H21', stroke: one.style.stroke, 'stroke-width': 2.4,
            'stroke-dasharray': one.style.dash, 'stroke-linecap': 'round',
        }));
        swatch.appendChild(svg('path', {
            d: markerPath(one.style.marker, 11, 6, 3),
            fill: one.style.marker === 'cross' ? 'none' : one.style.stroke,
            stroke: one.style.stroke, 'stroke-width': 1.6,
        }));
        button.appendChild(swatch);
        button.appendChild(el('span', null, one.label));
        button.style.setProperty('--legend-ink', one.style.text);
        button.addEventListener('click', () => {
            if (hidden.has(one.label)) hidden.delete(one.label);
            else hidden.add(one.label);
            const shown = !hidden.has(one.label);
            button.setAttribute('aria-pressed', String(shown));
            button.classList.toggle('is-off', !shown);
            onChange();
        });
        legend.appendChild(button);
    });
    return legend;
}

function buildTable(spec, prepared) {
    const { columns, rows } = tableFromSeries(prepared.series, {
        xLabel: spec.xLabel || 'Point',
        formatX: spec.formatX || String,
        formatY: spec.formatY || ((v) => String(v)),
    });
    const wrap = el('div', 'table-wrap');
    const table = el('table', 'chart-table');
    const caption = el('caption', null, `${spec.title || 'Chart'} - the same numbers as the chart above.`);
    table.appendChild(caption);
    const thead = el('thead');
    const headRow = el('tr');
    for (const column of columns) {
        const th = el('th', null, column);
        th.scope = 'col';
        headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = el('tbody');
    for (const row of rows) {
        const tr = el('tr');
        row.forEach((cell, index) => {
            const node = el(index === 0 ? 'th' : 'td', null, cell);
            if (index === 0) node.scope = 'row';
            tr.appendChild(node);
        });
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
}

/* ------------------------------------------------------------ preparation */

function prepareSeries(spec) {
    const incoming = Array.isArray(spec.series) ? spec.series : [];
    let drawn = 0;
    let total = 0;
    let downsampled = false;
    const series = incoming.map((one, index) => {
        const points = (one.points || []).filter((p) => p && finite(p.y) !== null);
        const reduced = downsample(points, spec.maxPoints || MAX_DRAWN_POINTS);
        drawn += reduced.drawn;
        total += reduced.total;
        if (reduced.drawn < reduced.total) downsampled = true;
        return {
            label: one.label || `Series ${index + 1}`,
            role: one.role,
            style: styleFor(one.role, index),
            points: reduced.points,
        };
    });
    return { series, drawn, total, downsampled };
}

/* --------------------------------------------------------------- painting */

function paint(spec, prepared, hidden, width, id, readout) {
    const visible = prepared.series.filter((one) => !hidden.has(one.label));
    const kind = spec.kind || 'line';

    if (!visible.length || !visible.some((one) => one.points.length)) {
        const empty = el('p', 'chart-empty', 'Nothing to plot: no points in this series.');
        readout.textContent = '';
        return empty;
    }

    const height = spec.height || (kind === 'sparkline' ? 56 : 240);
    const margin = kind === 'sparkline'
        ? { top: 4, right: 4, bottom: 4, left: 4 }
        : { ...MARGIN, left: spec.leftMargin || MARGIN.left };
    const inner = {
        width: Math.max(40, width - margin.left - margin.right),
        height: Math.max(30, height - margin.top - margin.bottom),
    };

    const frame = svg('svg', {
        class: 'chart-svg',
        width: '100%',
        height,
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-labelledby': `${id}-title`,
    });
    frame.setAttribute('aria-label', summaryText({
        title: spec.title,
        series: visible,
        xLabel: spec.xLabel,
        yLabel: spec.yLabel,
        note: spec.note,
    }));

    const root = svg('g', { transform: `translate(${margin.left} ${margin.top})` });

    const painter = {
        line: paintLine, area: paintLine, sparkline: paintLine,
        bar: paintBar, scatter: paintScatter, histogram: paintHistogram,
        interval: paintInterval, progress: paintProgress,
    }[kind] || paintLine;

    const painted = painter({ spec, visible, inner, root, kind });

    frame.appendChild(root);

    if (!prefersReducedMotion()) {
        const clipId = `${id}-clip`;
        const clip = svg('clipPath', { id: clipId });
        const rect = svg('rect', { x: -margin.left, y: -margin.top, width: 0, height: height + 2 });
        clip.appendChild(rect);
        frame.appendChild(clip);
        root.setAttribute('clip-path', `url(#${clipId})`);
        // Marks are already in the DOM; this only reveals them.
        requestAnimationFrame(() => {
            rect.setAttribute('width', String(width + margin.left));
            rect.classList.add('chart-reveal');
        });
    }

    wireReadout({ frame, spec, visible, painted, readout, inner });
    return frame;
}

function axes({ spec, inner, root, sx, sy, xTicks, formatXTick }) {
    const grid = svg('g', { class: 'chart-grid', 'aria-hidden': 'true' });
    for (const tick of niceTicks(sy.domain[0], sy.domain[1], 4)) {
        const y = sy(tick);
        grid.appendChild(svg('line', { x1: 0, x2: inner.width, y1: y, y2: y, class: 'chart-gridline' }));
        grid.appendChild(svgText(-8, y + 4, spec.formatYTick ? spec.formatYTick(tick) : tick, {
            class: 'chart-tick chart-tick-y', 'text-anchor': 'end',
        }));
    }
    root.appendChild(grid);

    const xAxis = svg('g', { class: 'chart-axis', 'aria-hidden': 'true' });
    xAxis.appendChild(svg('line', {
        x1: 0, x2: inner.width, y1: inner.height, y2: inner.height, class: 'chart-axisline',
    }));
    for (const tick of xTicks) {
        xAxis.appendChild(svgText(sx(tick.value), inner.height + 18, formatXTick(tick), {
            class: 'chart-tick', 'text-anchor': tick.anchor || 'middle',
        }));
    }
    root.appendChild(xAxis);

    if (spec.yLabel) {
        root.appendChild(svgText(0, -4, spec.yLabel, { class: 'chart-axis-label', 'text-anchor': 'start' }));
    }
}

function paintLine({ spec, visible, inner, root, kind }) {
    const allX = visible.flatMap((one) => one.points.map((p) => Number(p.x)));
    const allY = visible.flatMap((one) => one.points.flatMap((p) => [
        Number(p.y),
        ...(Number.isFinite(Number(p.lower)) ? [Number(p.lower)] : []),
        ...(Number.isFinite(Number(p.upper)) ? [Number(p.upper)] : []),
    ]));
    const sx = linearScale(padDomain(extent(allX), { pad: 0.02 }), [0, inner.width]);
    const sy = linearScale(padDomain(extent(allY), { includeZero: spec.includeZero !== false }), [inner.height, 0]);

    if (kind !== 'sparkline') {
        const ticks = pickXTicks(anchorOf(visible).points, 5);
        axes({
            spec, inner, root, sx, sy, xTicks: ticks,
            formatXTick: (tick) => (spec.formatX ? spec.formatX(tick.value) : tick.value),
        });
    }

    for (const one of visible) {
        const group = svg('g', { class: 'chart-series' });
        const band = bandPath(one.points, sx, sy);
        if (band) {
            group.appendChild(svg('path', {
                d: band, class: 'chart-band', fill: one.style.stroke, 'fill-opacity': 0.14,
                stroke: one.style.stroke, 'stroke-opacity': 0.35, 'stroke-dasharray': '3 3',
            }));
        }
        group.appendChild(svg('path', {
            d: linePath(one.points, sx, sy), fill: 'none', stroke: one.style.stroke,
            'stroke-width': kind === 'sparkline' ? 1.8 : 2.4, 'stroke-dasharray': one.style.dash,
            'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        }));
        if (kind !== 'sparkline' && one.points.length <= 80) {
            for (const point of one.points) {
                group.appendChild(svg('path', {
                    d: markerPath(one.style.marker, sx(point.x), sy(point.y)),
                    fill: one.style.marker === 'cross' ? 'none' : one.style.stroke,
                    stroke: one.style.stroke, 'stroke-width': 1.5,
                }));
            }
        }
        root.appendChild(group);
    }
    return { sx, sy, mode: 'x' };
}

function paintScatter({ spec, visible, inner, root }) {
    const allX = visible.flatMap((one) => one.points.map((p) => Number(p.x)));
    const allY = visible.flatMap((one) => one.points.map((p) => Number(p.y)));
    const sx = linearScale(padDomain(extent(allX), { includeZero: true }), [0, inner.width]);
    const sy = linearScale(padDomain(extent(allY), { includeZero: true }), [inner.height, 0]);

    axes({
        spec, inner, root, sx, sy,
        xTicks: niceTicks(sx.domain[0], sx.domain[1], 5).map((value) => ({ value })),
        formatXTick: (tick) => (spec.formatXTick ? spec.formatXTick(tick.value) : tick.value),
    });

    // An identity reference line is the whole point of a predicted-vs-actual
    // scatter: it shows where a perfect prediction would sit.
    if (spec.identityLine) {
        const lo = Math.max(sx.domain[0], sy.domain[0]);
        const hi = Math.min(sx.domain[1], sy.domain[1]);
        const group = svg('g', { 'aria-hidden': 'true' });
        group.appendChild(svg('line', {
            x1: sx(lo), y1: sy(lo), x2: sx(hi), y2: sy(hi), class: 'chart-identity',
        }));
        group.appendChild(svgText(sx(hi) - 4, sy(hi) + 14, 'perfect prediction', {
            class: 'chart-inline-label', 'text-anchor': 'end',
        }));
        root.appendChild(group);
    }

    for (const one of visible) {
        const group = svg('g', { class: 'chart-series' });
        for (const point of one.points) {
            group.appendChild(svg('path', {
                d: markerPath(one.style.marker, sx(point.x), sy(point.y), 3),
                fill: one.style.marker === 'cross' ? 'none' : one.style.stroke,
                'fill-opacity': 0.62, stroke: one.style.stroke, 'stroke-width': 1.1,
            }));
        }
        root.appendChild(group);
    }
    return { sx, sy, mode: 'xy' };
}

function paintBar({ spec, visible, inner, root }) {
    const one = visible[0];
    const categories = one.points;
    const sy = linearScale(padDomain(extent(visible.flatMap((s) => s.points.map((p) => p.y))), {
        includeZero: true,
    }), [inner.height, 0]);
    const slot = inner.width / Math.max(1, categories.length);
    const groupWidth = Math.min(46, slot * 0.72);
    const barWidth = groupWidth / visible.length;
    const sx = (index) => index * slot + slot / 2;

    const grid = svg('g', { class: 'chart-grid', 'aria-hidden': 'true' });
    for (const tick of niceTicks(sy.domain[0], sy.domain[1], 4)) {
        const y = sy(tick);
        grid.appendChild(svg('line', { x1: 0, x2: inner.width, y1: y, y2: y, class: 'chart-gridline' }));
        grid.appendChild(svgText(-8, y + 4, spec.formatYTick ? spec.formatYTick(tick) : tick, {
            class: 'chart-tick chart-tick-y', 'text-anchor': 'end',
        }));
    }
    root.appendChild(grid);

    const zeroY = sy(0);
    visible.forEach((series, seriesIndex) => {
        const group = svg('g', { class: 'chart-series' });
        series.points.forEach((point, index) => {
            const centre = sx(index);
            const x = centre - groupWidth / 2 + seriesIndex * barWidth;
            const y = Math.min(zeroY, sy(point.y));
            const barHeight = Math.max(1, Math.abs(sy(point.y) - zeroY));
            group.appendChild(svg('rect', {
                x, y, width: Math.max(2, barWidth - 2), height: barHeight,
                fill: series.style.stroke, 'fill-opacity': 0.82,
                stroke: series.style.stroke, 'stroke-width': 1,
                // The dash on the outline keeps bars distinguishable in greyscale.
                'stroke-dasharray': series.style.dash, rx: 2,
            }));
        });
        root.appendChild(group);
    });

    const xAxis = svg('g', { class: 'chart-axis', 'aria-hidden': 'true' });
    xAxis.appendChild(svg('line', { x1: 0, x2: inner.width, y1: zeroY, y2: zeroY, class: 'chart-axisline' }));
    const stride = Math.ceil(categories.length / Math.max(2, Math.floor(inner.width / 58)));
    categories.forEach((point, index) => {
        if (index % stride) return;
        xAxis.appendChild(svgText(sx(index), inner.height + 18,
            spec.formatX ? spec.formatX(point.x) : point.x, {
                class: 'chart-tick', 'text-anchor': 'middle',
            }));
    });
    root.appendChild(xAxis);

    return { sx: (value) => sx(categories.findIndex((p) => p.x === value)), sy, mode: 'category', slot };
}

function paintHistogram({ spec, visible, inner, root }) {
    const values = visible[0].points.map((p) => Number(p.y));
    const result = histogram(values, spec.bins || 12);
    const counts = result.bins.map((bin) => bin.count);
    const sy = linearScale([0, Math.max(1, extent(counts)?.[1] || 1)], [inner.height, 0]);
    const slot = inner.width / Math.max(1, result.bins.length);
    const style = visible[0].style;

    const grid = svg('g', { class: 'chart-grid', 'aria-hidden': 'true' });
    for (const tick of niceTicks(0, sy.domain[1], 4)) {
        const y = sy(tick);
        grid.appendChild(svg('line', { x1: 0, x2: inner.width, y1: y, y2: y, class: 'chart-gridline' }));
        grid.appendChild(svgText(-8, y + 4, Math.round(tick), { class: 'chart-tick chart-tick-y', 'text-anchor': 'end' }));
    }
    root.appendChild(grid);

    // A zero reference matters for residuals: it separates under- from over-prediction.
    if (spec.zeroReference && result.min !== null && result.min < 0 && result.max > 0) {
        const zeroX = ((0 - result.min) / (result.max - result.min)) * inner.width;
        root.appendChild(svg('line', { x1: zeroX, x2: zeroX, y1: 0, y2: inner.height, class: 'chart-identity' }));
        root.appendChild(svgText(zeroX + 4, 12, 'no error', { class: 'chart-inline-label', 'text-anchor': 'start' }));
    }

    const group = svg('g', { class: 'chart-series' });
    result.bins.forEach((bin, index) => {
        const y = sy(bin.count);
        group.appendChild(svg('rect', {
            x: index * slot + 1, y, width: Math.max(1, slot - 2), height: inner.height - y,
            fill: style.stroke, 'fill-opacity': 0.78, stroke: style.stroke, 'stroke-width': 1, rx: 2,
        }));
    });
    root.appendChild(group);

    const xAxis = svg('g', { class: 'chart-axis', 'aria-hidden': 'true' });
    xAxis.appendChild(svg('line', { x1: 0, x2: inner.width, y1: inner.height, y2: inner.height, class: 'chart-axisline' }));
    const stride = Math.ceil(result.bins.length / Math.max(2, Math.floor(inner.width / 62)));
    result.bins.forEach((bin, index) => {
        if (index % stride) return;
        xAxis.appendChild(svgText(index * slot, inner.height + 18, Math.round(bin.from), {
            class: 'chart-tick', 'text-anchor': 'middle',
        }));
    });
    root.appendChild(xAxis);

    return { sx: null, sy, mode: 'bins', bins: result.bins };
}

/**
 * One horizontal uncertainty track: P10 .. P90 with the P50 marked, optionally
 * against a scheduled reference. Used wherever a single prediction's interval
 * has to be legible at a glance.
 */
function paintInterval({ spec, visible, inner, root }) {
    const point = visible[0].points[0];
    if (!point) return { sx: null, sy: null, mode: 'none' };
    const lower = Number(point.lower);
    const upper = Number(point.upper);
    const domain = padDomain(extent([lower, upper, Number(point.y), ...(spec.reference ?? [])]), { pad: 0.14 });
    const sx = linearScale(domain, [0, inner.width]);
    const mid = inner.height / 2;
    const style = visible[0].style;

    const xAxis = svg('g', { class: 'chart-axis', 'aria-hidden': 'true' });
    for (const tick of niceTicks(domain[0], domain[1], 4)) {
        xAxis.appendChild(svg('line', { x1: sx(tick), x2: sx(tick), y1: mid + 22, y2: mid + 27, class: 'chart-axisline' }));
        xAxis.appendChild(svgText(sx(tick), mid + 40, spec.formatXTick ? spec.formatXTick(tick) : tick, {
            class: 'chart-tick', 'text-anchor': 'middle',
        }));
    }
    root.appendChild(xAxis);

    const track = svg('g', { class: 'chart-series' });
    track.appendChild(svg('rect', {
        x: sx(lower), y: mid - 13, width: Math.max(2, sx(upper) - sx(lower)), height: 26,
        fill: style.stroke, 'fill-opacity': 0.16, stroke: style.stroke,
        'stroke-dasharray': '4 3', rx: 4,
    }));
    for (const [value, label] of [[lower, 'P10'], [upper, 'P90']]) {
        track.appendChild(svg('line', {
            x1: sx(value), x2: sx(value), y1: mid - 13, y2: mid + 13,
            stroke: style.stroke, 'stroke-width': 2,
        }));
        track.appendChild(svgText(sx(value), mid - 19, label, {
            class: 'chart-inline-label', 'text-anchor': 'middle',
        }));
    }
    track.appendChild(svg('path', {
        d: markerPath(style.marker, sx(point.y), mid, 5.5),
        fill: style.stroke, stroke: 'var(--paper)', 'stroke-width': 1.6,
    }));
    track.appendChild(svgText(sx(point.y), mid + 30, 'P50', {
        class: 'chart-inline-label', 'text-anchor': 'middle',
    }));
    root.appendChild(track);

    if (spec.reference && spec.reference.length) {
        const refStyle = styleFor('scheduled');
        for (const value of spec.reference) {
            root.appendChild(svg('line', {
                x1: sx(value), x2: sx(value), y1: mid - 22, y2: mid + 22,
                stroke: refStyle.stroke, 'stroke-width': 2, 'stroke-dasharray': refStyle.dash,
            }));
        }
        root.appendChild(svgText(sx(spec.reference[0]), mid - 28, spec.referenceLabel || 'scheduled', {
            class: 'chart-inline-label', 'text-anchor': 'middle',
        }));
    }
    return { sx, sy: null, mode: 'none' };
}

/** A labelled proportion bar, e.g. measured coverage against its nominal target. */
function paintProgress({ spec, visible, inner, root }) {
    const point = visible[0].points[0];
    if (!point) return { sx: null, sy: null, mode: 'none' };
    const max = Number(spec.max ?? 1);
    const value = Math.max(0, Math.min(max, Number(point.y)));
    const style = visible[0].style;
    const barHeight = 22;
    const y = (inner.height - barHeight) / 2;

    root.appendChild(svg('rect', {
        x: 0, y, width: inner.width, height: barHeight, rx: 5,
        fill: 'var(--sand-dark)', stroke: 'var(--line)',
    }));
    root.appendChild(svg('rect', {
        x: 0, y, width: Math.max(2, (value / max) * inner.width), height: barHeight, rx: 5,
        fill: style.stroke, 'fill-opacity': 0.85,
    }));
    if (Number.isFinite(Number(spec.target))) {
        const targetX = (Number(spec.target) / max) * inner.width;
        root.appendChild(svg('line', {
            x1: targetX, x2: targetX, y1: y - 9, y2: y + barHeight + 9,
            stroke: 'var(--ink)', 'stroke-width': 2, 'stroke-dasharray': '4 3',
        }));
        root.appendChild(svgText(targetX, y - 14, spec.targetLabel || 'target', {
            class: 'chart-inline-label', 'text-anchor': 'middle',
        }));
    }
    return { sx: null, sy: null, mode: 'none' };
}

/* ---------------------------------------------------------------- readout */

function pickXTicks(points, count) {
    if (!points.length) return [];
    const stride = Math.max(1, Math.ceil(points.length / count));
    const ticks = [];
    for (let i = 0; i < points.length; i += stride) ticks.push({ value: points[i].x });
    const last = points[points.length - 1].x;
    if (ticks[ticks.length - 1].value !== last) ticks.push({ value: last });
    return ticks;
}

/**
 * Pointer and keyboard read-out.
 *
 * The plot takes a single tabindex so arrow keys walk the points and the text is
 * announced through the polite live region, rather than giving every point its
 * own focusable node (which would blow the node budget on long series).
 */
function wireReadout({ frame, spec, visible, painted, readout, inner }) {
    if (painted.mode === 'none' || !visible.length) return;
    const reference = anchorOf(visible).points;
    if (!reference.length) return;

    const describe = (index) => {
        const parts = [];
        const anchor = reference[index];
        if (!anchor) return '';
        parts.push(spec.formatX ? spec.formatX(anchor.x) : String(anchor.x));
        for (const one of visible) {
            const point = one.points.find((p) => p.x === anchor.x) ?? one.points[index];
            if (!point) continue;
            const value = spec.formatY ? spec.formatY(point.y) : String(point.y);
            let text = `${one.label} ${value}`;
            if (Number.isFinite(Number(point.lower)) && Number.isFinite(Number(point.upper))) {
                const lo = spec.formatY ? spec.formatY(point.lower) : point.lower;
                const hi = spec.formatY ? spec.formatY(point.upper) : point.upper;
                text += ` (range ${lo} to ${hi})`;
            }
            if (point.label) text += ` - ${point.label}`;
            parts.push(text);
        }
        return parts.join(' - ');
    };

    let cursor = -1;
    const show = (index) => {
        cursor = Math.max(0, Math.min(reference.length - 1, index));
        readout.textContent = describe(cursor);
        frame.querySelectorAll('.chart-cursor').forEach((node) => node.remove());
        if (painted.sx && painted.sy) {
            const point = reference[cursor];
            const line = svg('line', {
                class: 'chart-cursor',
                x1: painted.sx(point.x) + (spec.kind === 'sparkline' ? 4 : 48),
                x2: painted.sx(point.x) + (spec.kind === 'sparkline' ? 4 : 48),
                y1: spec.kind === 'sparkline' ? 4 : 14,
                y2: (spec.kind === 'sparkline' ? 4 : 14) + inner.height,
            });
            frame.appendChild(line);
        }
    };

    frame.setAttribute('tabindex', '0');
    frame.setAttribute('aria-describedby', readout.id);
    frame.addEventListener('keydown', (event) => {
        const step = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 1, ArrowDown: -1 }[event.key];
        if (step) {
            event.preventDefault();
            show(cursor < 0 ? 0 : cursor + step);
            return;
        }
        if (event.key === 'Home') { event.preventDefault(); show(0); }
        if (event.key === 'End') { event.preventDefault(); show(reference.length - 1); }
        if (event.key === 'Escape') { readout.textContent = ''; cursor = -1; frame.querySelectorAll('.chart-cursor').forEach((n) => n.remove()); }
    });
    frame.addEventListener('focus', () => { if (cursor < 0) show(0); });
    frame.addEventListener('pointermove', (event) => {
        if (!painted.sx) return;
        const box = frame.getBoundingClientRect();
        const x = event.clientX - box.left - (spec.kind === 'sparkline' ? 4 : 48);
        show(nearestIndex(reference, painted.sx, x));
    });
    frame.addEventListener('pointerleave', () => {
        readout.textContent = '';
        cursor = -1;
        frame.querySelectorAll('.chart-cursor').forEach((node) => node.remove());
    });
}

export { bandFor };
