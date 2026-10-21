/**
 * Tests for the DOM-rendering layer in charts.js.
 *
 * `chart-core.test.js` covers the pure maths. This covers what the browser
 * sweep could only observe from outside: that renderChart turns a spec into
 * the right nodes, that the accessible name and the table carry the same
 * numbers as the drawing, and -- the point of the whole module -- that a
 * missing or non-finite value produces an absence rather than a mark.
 *
 * It runs on the small DOM in ./helpers/fake-dom.js: no browser, no server,
 * no dependency, and no call to any endpoint.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { installFakeDom } from './helpers/fake-dom.js';

let dom = null;
let renderChart = null;

/** Install the DOM, import charts.js against it, and render one spec. */
async function render(spec, options = {}) {
    dom = installFakeDom(options);
    // charts.js reads `window` through format.js at call time, so the import
    // can be cached across tests; the globals are what change.
    if (!renderChart) ({ renderChart } = await import('../js/charts.js'));
    const handle = renderChart(dom.mount, spec);
    const figure = dom.mount.children[0];
    return {
        handle,
        figure,
        svg: figure.querySelector('.chart-svg'),
        mount: dom.mount,
        flushFrames: dom.flushFrames,
    };
}

afterEach(() => {
    if (dom) dom.restore();
    dom = null;
});

const LINE = {
    kind: 'line',
    title: 'Predicted delay',
    xLabel: 'run',
    yLabel: 'minutes late',
    series: [{
        label: 'Predicted delay',
        role: 'predicted',
        points: [{ x: 0, y: 5 }, { x: 1, y: 11 }, { x: 2, y: 8 }, { x: 3, y: 20 }],
    }],
    formatY: (value) => `${value.toFixed(1)} min`,
};

describe('renderChart: the card it builds', () => {
    it('produces the structure the stylesheet targets, so the theme still applies', async () => {
        const { figure } = await render(LINE);

        assert.equal(figure.tagName, 'figure');
        assert.ok(figure.classList.contains('chart-card'));
        for (const hook of ['.chart-head', '.chart-title', '.chart-plot', '.chart-foot', '.chart-svg']) {
            assert.ok(figure.querySelector(hook), `missing ${hook}`);
        }
    });

    it('states its source, and says so plainly when the caller gave none', async () => {
        const named = await render({ ...LINE, source: 'GET /api/v1/predict/eta' });
        assert.match(named.figure.querySelector('.chart-source').textContent,
            /Source: GET \/api\/v1\/predict\/eta/);

        const anonymous = await render(LINE);
        assert.match(anonymous.figure.querySelector('.chart-source').textContent,
            /Source: not stated/);
    });

    it('gives the drawing an accessible name built from the data', async () => {
        const { svg } = await render(LINE);
        const label = svg.getAttribute('aria-label');

        assert.match(label, /Predicted delay/);
        assert.match(label, /4 points/);
        assert.match(label, /from 5\.0 to 20\.0/);
        assert.match(label, /minutes late/);
    });

    it('shows a legend only when there is more than one series', async () => {
        const single = await render(LINE);
        assert.equal(single.figure.querySelector('.chart-legend'), null);

        const double = await render({
            ...LINE,
            series: [...LINE.series, { label: 'Baseline', role: 'baseline', points: [{ x: 0, y: 7 }] }],
        });
        assert.ok(double.figure.querySelector('.chart-legend'));
    });
});

describe('renderChart: marks match the data', () => {
    it('draws one path for a line and keeps every point in it', async () => {
        const { svg } = await render(LINE);
        const paths = svg.querySelectorAll('path').filter((node) => node.getAttribute('d'));

        assert.ok(paths.length >= 1);
        const d = paths[0].getAttribute('d');
        assert.equal((d.match(/[ML]/g) || []).length, LINE.series[0].points.length);
    });

    it('draws one bar per point per series', async () => {
        const { svg } = await render({
            kind: 'bar',
            title: 'Error by train',
            series: [
                { label: 'MAE', role: 'predicted', points: [{ x: 'a', y: 5 }, { x: 'b', y: 9 }, { x: 'c', y: 2 }] },
                { label: 'Bias', role: 'baseline', points: [{ x: 'a', y: -1 }, { x: 'b', y: 3 }, { x: 'c', y: 0.5 }] },
            ],
        });

        const series = svg.querySelectorAll('.chart-series');
        assert.equal(series.length, 2);
        for (const group of series) {
            assert.equal(group.querySelectorAll('rect').length, 3);
        }
    });

    it('draws a marker per scatter point', async () => {
        const { svg } = await render({
            kind: 'scatter',
            title: 'Predicted against actual',
            series: [{
                label: 'Journey', role: 'predicted',
                points: [{ x: 1, y: 2 }, { x: 4, y: 3 }, { x: 9, y: 11 }],
            }],
        });

        const group = svg.querySelector('.chart-series');
        assert.equal(group.querySelectorAll('path').length, 3);
    });

    it('draws a band for an interval chart', async () => {
        const { svg } = await render({
            kind: 'interval',
            title: 'How late, and how uncertain',
            series: [{ label: 'Predicted delay', role: 'predicted', points: [{ x: 0, y: 6.9, lower: 1.4, upper: 26.4 }] }],
        });

        assert.ok(svg.querySelectorAll('path, rect, line').length > 0);
        assert.match(svg.getAttribute('aria-label'), /How late, and how uncertain/);
    });
});

describe('renderChart: absence stays absent', () => {
    it('plots nothing, and says so, when the series is empty', async () => {
        const { figure, svg } = await render({ kind: 'line', title: 'Nothing yet', series: [] });

        assert.equal(svg, null);
        const empty = figure.querySelector('.chart-empty');
        assert.ok(empty);
        assert.match(empty.textContent, /no points in this series/i);
    });

    it('plots nothing when every value is missing rather than inventing one', async () => {
        const { figure, svg } = await render({
            kind: 'line',
            title: 'All unknown',
            series: [{ label: 'Delay', role: 'predicted', points: [{ x: 0, y: null }, { x: 1, y: undefined }, { x: 2, y: NaN }] }],
        });

        assert.equal(svg, null);
        assert.ok(figure.querySelector('.chart-empty'));
    });

    it('drops the non-finite points and counts only the real ones', async () => {
        const { svg, figure } = await render({
            kind: 'line',
            title: 'Partly known',
            series: [{
                label: 'Delay', role: 'predicted',
                points: [{ x: 0, y: 4 }, { x: 1, y: null }, { x: 2, y: 6 }, { x: 3, y: NaN }],
            }],
            formatY: (value) => `${value} min`,
        });

        assert.match(svg.getAttribute('aria-label'), /2 points/);

        figure.querySelector('.chart-table-toggle').fire('click');
        const rows = figure.querySelectorAll('.chart-table tbody tr');
        assert.equal(rows.length, 2, 'the table must not carry a row the chart would not draw');
    });
});

describe('renderChart: the table fallback', () => {
    it('is built only when asked for, and then holds the same numbers', async () => {
        const { figure } = await render(LINE);
        const toggle = figure.querySelector('.chart-table-toggle');
        const wrap = figure.querySelector('.chart-table-wrap');

        assert.equal(wrap.hidden, true);
        assert.equal(wrap.childElementCount, 0, 'the table should not be built until it is opened');
        assert.equal(toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(toggle.getAttribute('aria-controls'), wrap.id);

        toggle.fire('click');

        assert.equal(wrap.hidden, false);
        assert.equal(toggle.getAttribute('aria-expanded'), 'true');
        assert.equal(toggle.textContent, 'Hide table');

        const cells = figure.querySelectorAll('.chart-table tbody tr')
            .map((row) => row.children.map((cell) => cell.textContent));
        assert.deepEqual(cells, [
            ['0', '5.0 min'], ['1', '11.0 min'], ['2', '8.0 min'], ['3', '20.0 min'],
        ]);
    });

    it('closes again without rebuilding', async () => {
        const { figure } = await render(LINE);
        const toggle = figure.querySelector('.chart-table-toggle');
        const wrap = figure.querySelector('.chart-table-wrap');

        toggle.fire('click');
        const built = wrap.childElementCount;
        toggle.fire('click');

        assert.equal(wrap.hidden, true);
        assert.equal(toggle.textContent, 'View as table');
        assert.equal(wrap.childElementCount, built);
    });
});

describe('renderChart: large series', () => {
    const many = Array.from({ length: 1500 }, (_, index) => ({ x: index, y: Math.sin(index / 25) * 30 }));

    it('downsamples for drawing and admits it in the footer', async () => {
        const { figure, svg } = await render({
            kind: 'line', title: 'Long run', series: [{ label: 'Delay', role: 'predicted', points: many }],
        });

        const note = figure.querySelector('.chart-source').textContent;
        assert.match(note, /showing \d+ of 1500 points/);
        assert.match(note, /min\/max per bucket/);
        assert.ok(svg.getAttribute('aria-label').includes('points'));
    });

    it('keeps the extremes, so a spike is never smoothed away', async () => {
        const spiked = [...many];
        spiked[700] = { x: 700, y: 999 };

        const { figure } = await render({
            kind: 'line', title: 'Spike', series: [{ label: 'Delay', role: 'predicted', points: spiked }],
            formatY: (value) => String(Math.round(value)),
        });

        figure.querySelector('.chart-table-toggle').fire('click');
        const values = figure.querySelectorAll('.chart-table tbody tr')
            .map((row) => row.children[1].textContent);
        assert.ok(values.includes('999'), 'the maximum must survive downsampling');
    });
});

describe('renderChart: motion', () => {
    it('adds the reveal clip when motion is allowed', async () => {
        const { svg, flushFrames } = await render(LINE, { reducedMotion: false });

        assert.ok(svg.querySelector('clippath'), 'expected a clip path to animate against');
        flushFrames();
        assert.ok(svg.querySelector('clippath').querySelector('rect').classList.contains('chart-reveal'));
    });

    it('adds no clip at all when the viewer asked for less motion', async () => {
        const { svg } = await render(LINE, { reducedMotion: true });

        assert.equal(svg.querySelector('clippath'), null);
        assert.equal(svg.querySelector('g').getAttribute('clip-path'), null);
    });
});

describe('renderChart: the handle it returns', () => {
    it('redraws on update and clears the mount on destroy', async () => {
        const { handle, mount } = await render(LINE);

        assert.equal(mount.childElementCount, 1);
        const before = mount.children[0].querySelector('.chart-svg').getAttribute('aria-label');

        handle.update({ series: [{ label: 'Predicted delay', role: 'predicted', points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] }] });
        const after = mount.children[0].querySelector('.chart-svg').getAttribute('aria-label');

        assert.notEqual(before, after);
        assert.match(after, /2 points/);

        handle.destroy();
        assert.equal(mount.childElementCount, 0);
    });

    it('is safe to call with no mount', async () => {
        dom = installFakeDom();
        if (!renderChart) ({ renderChart } = await import('../js/charts.js'));
        const handle = renderChart(null, LINE);

        assert.doesNotThrow(() => handle.update({}));
        assert.doesNotThrow(() => handle.destroy());
    });
});
