/**
 * The STAFF portal.
 *
 * Ordering is deliberate: what needs attention, then the charts that explain
 * it, then the table, then one train in detail. A staff user should be able to
 * stop reading after the first screen and still know whether anything is wrong.
 *
 * Three constraints shape this module:
 *
 *  1. POST /predict/eta is not read-only. It writes a row to the train's
 *     prediction history and upserts the live state (app/api/routes/
 *     predictions.py:52-70). So nothing here predicts on page load. The fleet
 *     view reads stored predictions through
 *     GET /trains/{n}/predictions, and a prediction is only ever made when a
 *     staff user explicitly asks for one -- which the UI says before they click.
 *  2. The model ignores every operational field staff care most about.
 *     Thirteen request fields are accepted and discarded, including
 *     current_delay_minutes, junction_congestion, track_occupancy,
 *     platform_availability and trains_in_section. Nothing here may imply
 *     otherwise, and the scenario tool only offers levers that actually move
 *     the model.
 *  3. For a train the model already knows, distance_remaining_km is discarded
 *     too: training/feature_contract.py:161 looks the route distance up by
 *     train number and uses the request value only as a fallback for an unknown
 *     train. So distance is not offered as a scenario lever either.
 */

import { api } from '../api.js';
import { renderChart } from '../charts.js';
import { bandFor } from '../chart-core.js';
import {
    INSTANT, WALL_CLOCK, age, cleanLabel, finite, formatClock, formatDelayMinutes,
    formatInstant, formatPercent,
} from '../format.js';
import {
    badge, coverageNote, degradedBanner, emptyState, errorState, escapeHtml, metaList,
    notAvailable, panel, raw, skeleton, sourceFooter, staleBanner, timeNotice,
} from '../ui.js';
import { getState, setTrainContext } from '../state.js';

const TRAINS_SOURCE = 'GET /api/v1/trains';
const HISTORY_SOURCE = 'GET /api/v1/trains/{train}/predictions';
const HEALTH_SOURCE = 'GET /api/v1/health/';
const PREDICT_SOURCE = 'POST /api/v1/predict/eta';

/** Bands the model itself defines. There is no "early": the dataset has none. */
const BAND_ORDER = ['ON_TIME', 'MINOR', 'MODERATE', 'MAJOR', 'SEVERE'];

/** Fleet snapshot for the current render, so filtering does not refetch. */
let fleet = null;

/* ------------------------------------------------------------------ pages */

export async function renderStaffDashboard(content) {
    content.innerHTML = skeleton({ large: true, rows: 3, label: 'Loading operational overview' });
    const [health, snapshot] = await Promise.all([
        api.get('/health/').catch((error) => ({ __error: error })),
        loadFleet(),
    ]);
    if (snapshot.error) {
        content.innerHTML = errorState(snapshot.error, { what: 'the live train feed' });
        return;
    }
    content.innerHTML = overviewView(health && health.__error ? null : health, snapshot);
    mountOverviewCharts(snapshot, health && health.__error ? null : health);
    await renderAlertsInto(document.querySelector('#staff-alerts'));
}

export async function renderStaffTrains(content) {
    content.innerHTML = skeleton({ large: true, rows: 3, label: 'Loading fleet' });
    const snapshot = await loadFleet();
    if (snapshot.error) {
        content.innerHTML = errorState(snapshot.error, { what: 'the live train feed' });
        return;
    }
    content.innerHTML = `
        <section class="page-intro">
            <div>
                <p class="eyebrow">Operational feed</p>
                <h2>Trains and predictions</h2>
                <p>Every train with a stored state, and the most recent prediction held for it.
                   Nothing on this page runs the model; predictions are only made when you ask for one.</p>
            </div>
        </section>
        ${filterBar(snapshot)}
        <div id="fleet-table"></div>
        <div id="train-detail"></div>`;
    applyFilters();
    const selected = getState().selectedTrain;
    if (selected) await showTrainDetail(selected);
}

export async function renderStaffHistory(content) {
    content.innerHTML = skeleton({ rows: 3, label: 'Loading prediction history' });
    const snapshot = await loadFleet();
    if (snapshot.error) {
        content.innerHTML = errorState(snapshot.error, { what: 'prediction history' });
        return;
    }
    const withHistory = snapshot.rows.filter((row) => row.history.length);
    content.innerHTML = `
        <section class="page-intro">
            <div>
                <p class="eyebrow">Prediction history</p>
                <h2>Every prediction this backend has stored</h2>
                <p>${escapeHtml(String(snapshot.totalPredictions))} prediction${snapshot.totalPredictions === 1 ? '' : 's'}
                   across ${escapeHtml(String(withHistory.length))} train${withHistory.length === 1 ? '' : 's'}.
                   These are the model's past estimates. This system never records what time a train actually arrived,
                   so none of them can be scored against reality.</p>
            </div>
        </section>
        ${withHistory.length ? `<div class="rp-chart-mount" id="fleet-trend" style="min-height:300px"></div>` : ''}
        <div id="history-tables"></div>`;
    if (withHistory.length) mountFleetTrend(snapshot);
    const tables = document.querySelector('#history-tables');
    tables.innerHTML = withHistory.length
        ? withHistory.map(historyTableFor).join('')
        : emptyState('No predictions stored yet',
            'No prediction has been made on this backend. Open a train and run one to create the first record.');
}

export async function renderStaffAlerts(content) {
    content.innerHTML = `<div id="staff-alerts">${skeleton({ rows: 2, label: 'Loading alerts' })}</div>`;
    await renderAlertsInto(document.querySelector('#staff-alerts'));
}

/* --------------------------------------------------------- fleet loading */

/**
 * One read-only pass over the fleet.
 *
 * Each train's history is fetched once; the newest entry doubles as "the latest
 * prediction", so this costs one request per train rather than two, and writes
 * nothing.
 */
async function loadFleet() {
    try {
        const data = await api.get('/trains');
        const trains = Array.isArray(data.trains) ? data.trains : [];
        const histories = await Promise.all(trains.map((train) =>
            api.get(`/trains/${encodeURIComponent(train.train_number)}/predictions?limit=50&skip=0`)
                .then((payload) => (Array.isArray(payload.predictions) ? payload.predictions : []))
                .catch(() => [])));

        const now = Date.now();
        const rows = trains.map((train, index) => {
            const history = histories[index];
            const latest = history.length ? history[0] : null;
            return {
                train,
                number: String(train.train_number || ''),
                name: cleanLabel(train.train_name || train.train_type, { placeholder: '' }),
                history,
                latest,
                stale: age(train.updated_at, now).stale,
                ageText: age(train.updated_at, now).text,
                band: latest ? cleanLabel(latest.delay_category, { placeholder: 'UNKNOWN' }) : null,
                isDemo: String(train.data_source || '').toUpperCase() === 'DEMO',
            };
        });
        fleet = {
            rows,
            count: rows.length,
            totalPredictions: rows.reduce((sum, row) => sum + row.history.length, 0),
            error: null,
        };
        return fleet;
    } catch (error) {
        fleet = { rows: [], count: 0, totalPredictions: 0, error };
        return fleet;
    }
}

/* -------------------------------------------------------------- overview */

function overviewView(health, snapshot) {
    const rows = snapshot.rows;
    const predicted = rows.filter((row) => row.latest);
    const stale = rows.filter((row) => row.stale);
    const unpredicted = rows.filter((row) => !row.latest);
    const degraded = health && health.model !== 'ok';
    const quality = health ? health.model_quality : null;

    const bandCounts = countBands(predicted);
    const worst = [...predicted].sort((a, b) =>
        (finite(b.latest.predicted_delay_minutes) ?? -Infinity) - (finite(a.latest.predicted_delay_minutes) ?? -Infinity));

    return `
    <section class="page-intro">
        <div>
            <p class="eyebrow">Operational overview</p>
            <h2>What needs attention</h2>
            <p>${escapeHtml(String(rows.length))} train${rows.length === 1 ? '' : 's'} in the feed.
               Figures below come from stored predictions, not from running the model now.</p>
        </div>
    </section>

    ${degraded ? degradedBanner(health) : ''}
    ${stale.length ? `<p class="rp-banner rp-banner-stale" role="status">${badge('stale')}
        <span><strong>${escapeHtml(String(stale.length))} of ${escapeHtml(String(rows.length))}</strong>
        train states are older than the freshness threshold. Anything derived from them is that old too.</span></p>` : ''}
    ${quality && quality.beats_baseline === false ? `<p class="rp-banner rp-banner-degraded" role="status">
        ${badge('degraded')}<span>The serving model does <strong>not</strong> beat its mean-delay baseline on held-out
        data. Treat every predicted delay below as a prototype figure.</span></p>` : ''}

    <section class="metric-grid">
        ${tile('Trains in feed', String(rows.length), rows.length ? `${predicted.length} have a stored prediction` : 'No stored states')}
        ${tile('Awaiting a prediction', String(unpredicted.length),
            unpredicted.length ? 'No prediction has ever been run for these' : 'Every train has one')}
        ${tile('Stale states', String(stale.length), `Older than 10 minutes`)}
        ${tile('Predicted MAJOR or worse', String((bandCounts.MAJOR || 0) + (bandCounts.SEVERE || 0)),
            predicted.length ? `of ${predicted.length} predicted` : 'Nothing predicted yet')}
    </section>

    <div id="staff-alerts"></div>

    <div class="split-grid">
        <div class="rp-chart-mount" id="band-chart" style="min-height:290px"></div>
        <div class="rp-chart-mount" id="fleet-delay-chart" style="min-height:290px"></div>
    </div>

    ${worst.length ? panel({
        title: 'Highest predicted delays',
        caption: 'The five trains with the largest stored predicted delay, newest prediction per train.',
        badges: badge('live'),
        source: HISTORY_SOURCE,
        body: raw(fleetTable(worst.slice(0, 5), { compact: true })),
    }) : ''}

    ${health ? modelLine(health) : ''}
    ${timeNotice()}
    `;
}

function tile(label, value, note) {
    return `<article class="metric-card rp-tile">
        <p class="metric-label">${escapeHtml(label)}</p>
        <p class="rp-tile-value">${escapeHtml(value)}</p>
        <p class="muted rp-tile-note">${escapeHtml(note)}</p>
    </article>`;
}

/** One honest line about the serving model, with the numbers staff may need. */
function modelLine(health) {
    const quality = health.model_quality || {};
    const dataset = health.dataset || {};
    const coverage = health.model_details
        && health.model_details.metrics
        && health.model_details.metrics.test_intervals
        ? health.model_details.metrics.test_intervals.coverage
        : null;
    return panel({
        title: 'Serving model',
        badges: `${badge('historical')}${String(dataset.data_provenance || '').toLowerCase() === 'synthetic'
            ? badge('synthetic', `${escapeHtml(String(finite(dataset.rows) ?? 'unknown'))} rows`) : ''}`,
        source: HEALTH_SOURCE,
        body: raw(`
            ${metaList([
                ['Model version', cleanLabel(health.model_version)],
                ['Dataset', cleanLabel(dataset.name)],
                ['Dataset period', Array.isArray(dataset.date_range) && dataset.date_range.length === 2
                    ? `${cleanLabel(dataset.date_range[0])} to ${cleanLabel(dataset.date_range[1])}` : 'Not reported'],
                ['Distinct trains', String(finite(dataset.distinct_trains) ?? 'Not reported')],
            ])}
            ${quality.notice ? `<p class="rp-note">${escapeHtml(quality.notice)}</p>` : ''}
            ${coverageNote(coverage)}
        `),
    });
}

function countBands(predicted) {
    const counts = {};
    for (const row of predicted) {
        const band = row.band || 'UNKNOWN';
        counts[band] = (counts[band] || 0) + 1;
    }
    return counts;
}

function mountOverviewCharts(snapshot, health) {
    const predicted = snapshot.rows.filter((row) => row.latest);
    const counts = countBands(predicted);
    // Only the model's own bands, in the model's own order. A band with zero
    // trains is still shown, because "none in SEVERE" is information.
    const bands = BAND_ORDER.filter((band) => band in counts || true);

    renderChart(document.querySelector('#band-chart'), {
        kind: 'bar',
        title: 'Predicted delay band',
        caption: 'Bands are the model\'s own (ON_TIME, MINOR, MODERATE, MAJOR, SEVERE). The dataset contains no early arrivals, so there is no early band.',
        height: 250,
        source: `${HISTORY_SOURCE} -> delay_category`,
        badges: [{ kind: 'live', text: `${predicted.length} stored prediction${predicted.length === 1 ? '' : 's'}` }],
        series: [{ label: 'Trains', role: 'predicted', points: bands.map((band) => ({ x: band, y: counts[band] || 0 })) }],
        yLabel: 'trains',
        formatY: (value) => String(Math.round(value)),
        formatYTick: (value) => String(Math.round(value)),
    });

    const withDelay = predicted
        .filter((row) => finite(row.latest.predicted_delay_minutes) !== null)
        .sort((a, b) => finite(b.latest.predicted_delay_minutes) - finite(a.latest.predicted_delay_minutes));

    renderChart(document.querySelector('#fleet-delay-chart'), {
        kind: 'bar',
        title: 'Latest predicted delay by train',
        caption: 'The newest stored prediction for each train. Not a live reading: each was made at the time shown in the table.',
        height: 250,
        source: HISTORY_SOURCE,
        badges: [{ kind: 'live', text: 'stored predictions' }],
        series: [{
            label: 'Predicted delay',
            role: 'predicted',
            points: withDelay.map((row) => ({ x: row.number, y: finite(row.latest.predicted_delay_minutes) })),
        }],
        yLabel: 'minutes',
        formatY: (value) => formatDelayMinutes(value),
        formatYTick: (value) => Math.round(value),
    });
}

function mountFleetTrend(snapshot) {
    const series = snapshot.rows
        .filter((row) => row.history.length > 1)
        .slice(0, 5)
        .map((row, index) => ({
            label: `Train ${row.number}`,
            role: ['predicted', 'scheduled', 'observed', 'baseline', 'warning'][index % 5],
            points: [...row.history].reverse().map((entry, position) => ({
                x: position,
                y: finite(entry.predicted_delay_minutes),
                lower: finite(entry.delay_p10_minutes),
                upper: finite(entry.delay_p90_minutes),
                label: formatInstant(entry.timestamp, { kind: INSTANT }),
            })),
        }));
    if (!series.length) return;
    renderChart(document.querySelector('#fleet-trend'), {
        kind: 'line',
        title: 'Predicted delay across successive runs',
        caption: 'Up to five trains with more than one stored prediction, oldest run on the left. Shaded bands are P10 to P90 where the stored record has them.',
        height: 270,
        source: HISTORY_SOURCE,
        badges: [{ kind: 'live', text: 'stored predictions' }],
        xLabel: 'prediction run',
        yLabel: 'minutes',
        series,
        formatX: (index) => `run ${index + 1}`,
        formatY: (value) => formatDelayMinutes(value),
        formatYTick: (value) => Math.round(value),
    });
}

/* ---------------------------------------------------------------- alerts */

async function renderAlertsInto(mount) {
    if (!mount) return;
    try {
        const data = await api.get('/alerts?limit=50');
        const alerts = Array.isArray(data.alerts) ? data.alerts : [];
        if (!alerts.length) {
            mount.innerHTML = notAvailable(
                'Operational alerts',
                data.limitation || 'This backend does not generate alerts.',
                { source: 'GET /api/v1/alerts', missing: cleanLabel(data.data_source, { placeholder: 'a live event feed' }) },
            ) + `<p class="rp-note">No alerting exists on this backend, so an empty list is not an all-clear.
                 Use the stale-state count and the predicted bands above instead.</p>`;
            return;
        }
        mount.innerHTML = panel({
            title: 'Operational alerts', badges: badge('live'), source: 'GET /api/v1/alerts',
            body: raw(alerts.map((alert) => `<article class="alert-card">
                <span class="severity">${escapeHtml(cleanLabel(alert.severity, { placeholder: 'Unspecified' }))}</span>
                <div><h4>${escapeHtml(cleanLabel(alert.title || alert.message, { placeholder: 'Untitled alert' }))}</h4></div>
            </article>`).join('')),
        });
    } catch (error) {
        mount.innerHTML = errorState(error, { what: 'operational alerts' });
    }
}

/* ------------------------------------------------------- filters + table */

function filterBar(snapshot) {
    const bands = [...new Set(snapshot.rows.map((row) => row.band).filter(Boolean))];
    const dates = [...new Set(snapshot.rows
        .map((row) => row.train.scheduled_arrival)
        .filter(Boolean)
        .map((value) => String(value).slice(0, 10)))].sort();
    return `<section class="panel rp-panel filter-bar">
        <header class="panel-heading"><div><h3>Filter</h3>
            <p class="panel-copy">Filters apply to the ${escapeHtml(String(snapshot.count))} trains already loaded. Nothing is refetched.</p>
        </div></header>
        <div class="filter-grid">
            <label>Search<input type="search" id="filter-search" placeholder="Number, name, origin or destination" autocomplete="off"></label>
            <label>Predicted band<select id="filter-band">
                <option value="">Any band</option>
                ${BAND_ORDER.filter((band) => bands.includes(band)).map((band) =>
                    `<option value="${escapeHtml(band)}">${escapeHtml(band)}</option>`).join('')}
                <option value="__none">No prediction yet</option>
            </select></label>
            <label>Scheduled date (IST)<select id="filter-date">
                <option value="">Any date</option>
                ${dates.map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(date)}</option>`).join('')}
            </select></label>
            <label>State freshness<select id="filter-stale">
                <option value="">Any</option>
                <option value="stale">Stale only</option>
                <option value="fresh">Fresh only</option>
            </select></label>
        </div>
        <p class="rp-source" id="filter-count"></p>
    </section>`;
}

/** Re-render the table from the already-loaded snapshot. Exported via events. */
export function applyFilters() {
    if (!fleet) return;
    const value = (id) => {
        const node = document.querySelector(id);
        return node ? String(node.value || '').trim().toLowerCase() : '';
    };
    const search = value('#filter-search');
    const band = value('#filter-band');
    const date = value('#filter-date');
    const freshness = value('#filter-stale');

    const rows = fleet.rows.filter((row) => {
        if (search) {
            const haystack = [row.number, row.name, row.train.source, row.train.destination]
                .map((part) => String(part || '').toLowerCase()).join(' ');
            if (!haystack.includes(search)) return false;
        }
        if (band === '__none' && row.latest) return false;
        if (band && band !== '__none' && String(row.band || '').toLowerCase() !== band) return false;
        if (date && String(row.train.scheduled_arrival || '').slice(0, 10).toLowerCase() !== date) return false;
        if (freshness === 'stale' && !row.stale) return false;
        if (freshness === 'fresh' && row.stale) return false;
        return true;
    });

    const mount = document.querySelector('#fleet-table');
    if (mount) {
        mount.innerHTML = rows.length
            ? panel({
                title: 'Scheduled against predicted',
                caption: 'Predicted times come from the newest stored prediction for each train, which may be older than the train state itself.',
                badges: badge('live'),
                source: `${TRAINS_SOURCE} + ${HISTORY_SOURCE}`,
                body: raw(fleetTable(rows)),
            })
            : emptyState('No trains match these filters', 'Clear or widen a filter to see trains again.');
    }
    const counter = document.querySelector('#filter-count');
    if (counter) counter.textContent = `Showing ${rows.length} of ${fleet.rows.length} trains.`;
}

/**
 * The scheduled-against-predicted table.
 *
 * The interval column is a small graphic on a shared scale across the rows, so
 * a wide band is visibly wide. It carries no text of its own; the numbers sit
 * beside it and the whole cell has a text alternative.
 */
function fleetTable(rows, { compact = false } = {}) {
    const bounds = intervalBounds(rows);
    return `<div class="table-wrap"><table class="chart-table fleet-table">
        <caption>Scheduled against predicted arrival, newest stored prediction per train.</caption>
        <thead><tr>
            <th scope="col">Train</th>
            <th scope="col">Scheduled</th>
            <th scope="col">Predicted</th>
            <th scope="col">Delay</th>
            <th scope="col">P10 to P90</th>
            <th scope="col">Band</th>
            ${compact ? '' : '<th scope="col">Predicted at</th><th scope="col">State age</th><th scope="col"><span class="sr-only">Actions</span></th>'}
        </tr></thead>
        <tbody>${rows.map((row) => fleetRow(row, bounds, compact)).join('')}</tbody>
    </table></div>`;
}

function fleetRow(row, bounds, compact) {
    const train = row.train;
    const latest = row.latest;
    const p10 = latest ? finite(latest.delay_p10_minutes) : null;
    const p50 = latest ? finite(latest.predicted_delay_minutes) : null;
    const p90 = latest ? finite(latest.delay_p90_minutes) : null;

    return `<tr${row.stale ? ' class="is-stale"' : ''}>
        <th scope="row">
            <strong>${escapeHtml(row.number)}</strong>
            ${row.isDemo ? badge('synthetic', 'demo') : ''}
            <small class="muted">${escapeHtml(row.name || 'Name not recorded')}</small>
            <small class="muted">${escapeHtml(cleanLabel(train.source, { placeholder: '?' }))}
                &#8594; ${escapeHtml(cleanLabel(train.destination, { placeholder: '?' }))}</small>
        </th>
        <td>${escapeHtml(formatClock(train.scheduled_arrival, { kind: WALL_CLOCK }))}</td>
        <td>${latest ? escapeHtml(formatClock(latest.predicted_eta, { kind: WALL_CLOCK })) : '<span class="muted">Not predicted</span>'}</td>
        <td>${latest ? escapeHtml(formatDelayMinutes(p50)) : '<span class="muted">&mdash;</span>'}</td>
        <td>${intervalCell(p10, p50, p90, bounds)}</td>
        <td>${row.band ? `<span class="band-chip band-${escapeHtml(row.band)}">${escapeHtml(row.band)}</span>` : '<span class="muted">&mdash;</span>'}</td>
        ${compact ? '' : `
        <td>${latest ? escapeHtml(formatInstant(latest.timestamp, { kind: INSTANT })) : '<span class="muted">&mdash;</span>'}</td>
        <td>${row.stale ? `<span class="band-chip band-stale">${escapeHtml(row.ageText)}</span>` : escapeHtml(row.ageText)}</td>
        <td><button class="button button-secondary" type="button" data-action="staff-detail"
                data-train="${escapeHtml(row.number)}">Open</button></td>`}
    </tr>`;
}

/** A common scale, so interval widths are comparable down the column. */
function intervalBounds(rows) {
    const values = [];
    for (const row of rows) {
        if (!row.latest) continue;
        for (const key of ['delay_p10_minutes', 'predicted_delay_minutes', 'delay_p90_minutes']) {
            const value = finite(row.latest[key]);
            if (value !== null) values.push(value);
        }
    }
    if (!values.length) return null;
    const min = Math.min(0, ...values);
    const max = Math.max(...values);
    return { min, max: max === min ? min + 1 : max };
}

/**
 * The interval graphic. Every interpolated value is a number from finite(), so
 * nothing user-controlled reaches this markup; the text alternative is escaped.
 */
function intervalCell(p10, p50, p90, bounds) {
    if (p10 === null || p90 === null || !bounds) {
        return '<span class="muted">Not recorded</span>';
    }
    const span = bounds.max - bounds.min;
    const pct = (value) => ((value - bounds.min) / span) * 100;
    const left = Math.max(0, Math.min(100, pct(p10)));
    const right = Math.max(0, Math.min(100, pct(p90)));
    const mid = p50 === null ? null : Math.max(0, Math.min(100, pct(p50)));
    const label = `P10 ${formatDelayMinutes(p10)}, P50 ${formatDelayMinutes(p50)}, P90 ${formatDelayMinutes(p90)}`;
    return `<span class="interval-cell" role="img" aria-label="${escapeHtml(label)}">
        <span class="interval-track"></span>
        <span class="interval-span" style="left:${left.toFixed(2)}%;width:${Math.max(1.5, right - left).toFixed(2)}%"></span>
        ${mid === null ? '' : `<span class="interval-mid" style="left:${mid.toFixed(2)}%"></span>`}
        <span class="interval-text">${escapeHtml(formatDelayMinutes(p10))} to ${escapeHtml(formatDelayMinutes(p90))}</span>
    </span>`;
}

/* ------------------------------------------------------------ drill-down */

export async function showTrainDetail(trainNumber) {
    const mount = document.querySelector('#train-detail');
    if (!mount) return;
    setTrainContext(trainNumber);
    mount.innerHTML = skeleton({ large: true, rows: 2, label: 'Loading train detail' });

    const row = fleet && fleet.rows.find((candidate) => candidate.number === String(trainNumber));
    let state;
    try {
        state = await api.get(`/trains/${encodeURIComponent(trainNumber)}/state`);
    } catch (error) {
        mount.innerHTML = errorState(error, { what: `train ${cleanLabel(trainNumber)}` });
        return;
    }
    const history = row ? row.history : [];
    const latest = history.length ? history[0] : null;

    mount.innerHTML = `
    <section class="panel rp-panel" id="detail-top">
        <header class="panel-heading">
            <div>
                <p class="eyebrow">Train ${escapeHtml(cleanLabel(trainNumber))}</p>
                <h3>${escapeHtml(cleanLabel(state.source, { placeholder: '?' }))}
                    <span aria-hidden="true">&#8594;</span>
                    ${escapeHtml(cleanLabel(state.destination, { placeholder: '?' }))}</h3>
            </div>
            <div class="rp-badge-row">${String(state.data_source || '').toUpperCase() === 'DEMO' ? badge('synthetic', 'demo state') : badge('live')}</div>
        </header>
        <div class="rp-panel-body">
            ${staleBanner(state.updated_at, { what: 'This train state' })}
            ${metaList([
                ['Scheduled arrival', formatInstant(state.scheduled_arrival, { kind: WALL_CLOCK })],
                ['State updated', formatInstant(state.updated_at, { kind: INSTANT })],
                ['Reported position', cleanLabel(state.current_station || state.current_section, { placeholder: 'Not reported' })],
                ['Reported delay', formatDelayMinutes(state.current_delay_minutes)],
                ['Run frequency', cleanLabel(state.run_frequency, { placeholder: 'Not recorded' })],
                ['Season', cleanLabel(state.season, { placeholder: 'Not recorded' })],
            ])}
            <p class="rp-note"><strong>Reported delay, speed, congestion, occupancy, platform availability and
                trains-in-section are not inputs to the model.</strong> They are shown because they describe the
                stored state, but changing any of them cannot change a prediction.</p>
            ${latest ? '' : `<p class="rp-note">No prediction has been stored for this train yet.</p>`}
            <div class="action-row">
                <button class="button button-primary" type="button" data-action="staff-predict"
                        data-train="${escapeHtml(cleanLabel(trainNumber))}">Run a prediction now</button>
            </div>
            <p class="rp-source">Running a prediction writes a record to this train's history and updates its
                stored live state. Nothing else on this page does.</p>
            <div id="detail-prediction"></div>
        </div>
    </section>
    ${history.length ? `<div class="rp-chart-mount" id="detail-trend" style="min-height:280px"></div>` : ''}
    ${history.length ? historyTableFor({ number: String(trainNumber), history }) : ''}
    `;

    if (history.length) {
        renderChart(document.querySelector('#detail-trend'), {
            kind: 'line',
            title: `Predicted delay for train ${cleanLabel(trainNumber)}`,
            caption: 'Oldest run on the left. The shaded band is P10 to P90 where the stored record has it.',
            height: 260,
            source: HISTORY_SOURCE,
            badges: [{ kind: 'live', text: `${history.length} prediction${history.length === 1 ? '' : 's'}` }],
            xLabel: 'prediction run',
            yLabel: 'minutes',
            series: [{
                label: 'Predicted delay',
                role: 'predicted',
                points: [...history].reverse().map((entry, index) => ({
                    x: index,
                    y: finite(entry.predicted_delay_minutes),
                    lower: finite(entry.delay_p10_minutes),
                    upper: finite(entry.delay_p90_minutes),
                    label: formatInstant(entry.timestamp, { kind: INSTANT }),
                })),
            }],
            formatX: (index) => {
                const entry = [...history].reverse()[index];
                return entry ? formatClock(entry.timestamp, { kind: INSTANT }) : `run ${index + 1}`;
            },
            formatY: (value) => formatDelayMinutes(value),
            formatYTick: (value) => Math.round(value),
        });
    }
    document.querySelector('#detail-top').scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
    });
}

/** An explicit, acknowledged write. */
export async function runStaffPrediction(trainNumber, button) {
    const mount = document.querySelector('#detail-prediction');
    if (mount) mount.innerHTML = '<div class="inline-loading">Running the model&hellip;</div>';
    if (button) button.disabled = true;
    try {
        const state = await api.get(`/trains/${encodeURIComponent(trainNumber)}/state`);
        const payload = { ...state };
        delete payload._id; delete payload.state_source; delete payload.updated_at; delete payload.simulated_at;
        const prediction = await api.post('/predict/eta', payload);
        if (mount) {
            mount.innerHTML = panel({
                title: 'Prediction just made',
                badges: badge('live'),
                source: PREDICT_SOURCE,
                sourceExtra: `model ${cleanLabel(prediction.model_version)}`,
                body: raw(`${metaList([
                    ['Predicted arrival', formatClock(prediction.predicted_eta, { kind: WALL_CLOCK })],
                    ['Predicted delay', formatDelayMinutes(prediction.predicted_delay_minutes)],
                    ['P10 to P90', `${formatDelayMinutes(prediction.delay_p10_minutes)} to ${formatDelayMinutes(prediction.delay_p90_minutes)}`],
                    ['Chance over 15 min', formatPercent(prediction.p_delay_gt_15)],
                    ['Band', cleanLabel(prediction.delay_category)],
                ])}${ignoredFieldsNote(prediction)}`),
            });
        }
        fleet = null;
    } catch (error) {
        if (mount) mount.innerHTML = errorState(error, { what: 'the prediction' });
    } finally {
        if (button) button.disabled = false;
    }
}

/**
 * The fields the caller sent that the model discarded. Echoing them is the
 * point: it is the clearest possible statement that they had no effect.
 */
function ignoredFieldsNote(prediction) {
    const ignored = Array.isArray(prediction.unsupported_fields_ignored) ? prediction.unsupported_fields_ignored : [];
    if (!ignored.length) return '';
    return `<p class="rp-note"><strong>${escapeHtml(String(ignored.length))} field${ignored.length === 1 ? '' : 's'}
        sent with this request had no effect on the result:</strong>
        ${ignored.map((field) => `<code>${escapeHtml(field)}</code>`).join(', ')}.
        The model was not trained on them.</p>`;
}

function historyTableFor(row) {
    return panel({
        title: `Stored predictions — train ${cleanLabel(row.number)}`,
        caption: 'Newest first. Predicted arrival times, never recorded ones.',
        badges: badge('live', `${row.history.length}`),
        source: HISTORY_SOURCE,
        body: raw(`<div class="table-wrap"><table class="chart-table">
            <thead><tr>
                <th scope="col">Predicted at</th><th scope="col">Predicted arrival</th>
                <th scope="col">Delay</th><th scope="col">P10 to P90</th>
                <th scope="col">Band</th><th scope="col">Model</th>
            </tr></thead>
            <tbody>${row.history.map((entry) => `<tr>
                <th scope="row">${escapeHtml(formatInstant(entry.timestamp, { kind: INSTANT }))}</th>
                <td>${escapeHtml(formatClock(entry.predicted_eta, { kind: WALL_CLOCK }))}</td>
                <td>${escapeHtml(formatDelayMinutes(entry.predicted_delay_minutes))}</td>
                <td>${finite(entry.delay_p10_minutes) === null || finite(entry.delay_p90_minutes) === null
                    ? 'Not recorded'
                    : `${escapeHtml(formatDelayMinutes(entry.delay_p10_minutes))} to ${escapeHtml(formatDelayMinutes(entry.delay_p90_minutes))}`}</td>
                <td>${escapeHtml(cleanLabel(entry.delay_category, { placeholder: '—' }))}</td>
                <td><small>${escapeHtml(cleanLabel(entry.model_version, { placeholder: '—' }))}</small></td>
            </tr>`).join('')}</tbody></table></div>`),
    });
}

export { bandFor };
