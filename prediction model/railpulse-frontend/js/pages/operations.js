/**
 * Staff simulation and network-intelligence pages.
 *
 * What "simulation" can honestly mean on this surface
 * ---------------------------------------------------
 * The rule-based simulation described in the project (delay > 30 -> HIGH,
 * > 10 -> MEDIUM) lives in the Node service and is reachable only from the
 * React main site. This portal talks to FastAPI, where POST /simulation/update
 * only *stores* a state: it runs neither the model nor any rule engine. So
 * nothing on this page is rule-based, and the page says so rather than dressing
 * a stored state up as a scenario engine.
 *
 * The ML scenario tool below is therefore the only thing here that compares
 * anything, and it is constrained by what the model actually consumes. Of the
 * 15 features, nine derive from `scheduled_arrival` (hour, minute, its sine and
 * cosine, day of week, day of month, day of year, month, is_weekend), and the
 * rest are train_number, source, destination, run_frequency, season and
 * distance_km. Distance is looked up per train from the training data
 * (training/feature_contract.py:161), so sending a different
 * distance_remaining_km changes nothing for a train the model knows. Shifting
 * the scheduled arrival is therefore the one lever that genuinely moves the
 * model, and it is the only one offered.
 *
 * Side effects, disclosed in the UI before anything runs: POST /predict/eta
 * writes a row to the train's prediction history and upserts its live state
 * (app/api/routes/predictions.py:52-70, train_repository.py:21-28). A scenario
 * with a shifted schedule therefore *changes the stored state*. Runs are
 * sequential so they cannot race each other, and the original state is restored
 * in a finally block.
 */

import { api } from '../api.js';
import { renderChart } from '../charts.js';
import {
    INSTANT, WALL_CLOCK, cleanLabel, finite, formatDelayMinutes, formatInstant, formatPercent,
} from '../format.js';
import {
    badge, emptyState, errorState, escapeHtml, metaList, notAvailable, panel, raw, skeleton,
} from '../ui.js';
import { getState } from '../state.js';

const PREDICT_SOURCE = 'POST /api/v1/predict/eta';
const CAPABILITIES_SOURCE = 'GET /api/v1/docs/capabilities';

/** Scenario levers. Each one changes only time-derived features. */
const SCENARIOS = [
    { id: 'baseline', label: 'As scheduled', shiftMinutes: 0, note: 'The train\'s stored scheduled arrival.' },
    { id: 'earlier', label: '6 hours earlier', shiftMinutes: -360, note: 'Same route, earlier in the day.' },
    { id: 'later', label: '6 hours later', shiftMinutes: 360, note: 'Same route, later in the day.' },
    { id: 'nextday', label: 'Same time tomorrow', shiftMinutes: 1440, note: 'Changes the day of week and day of year.' },
    { id: 'nextweek', label: 'Same time next week', shiftMinutes: 10080, note: 'Same weekday, later in the year.' },
];

/* ------------------------------------------------------------ simulation */

export async function renderStaffSimulation(content) {
    content.innerHTML = skeleton({ large: true, rows: 2, label: 'Loading simulation tools' });
    const [trains, health] = await Promise.all([
        api.get('/trains').catch(() => null),
        api.get('/health/').catch(() => null),
    ]);
    const options = trains && Array.isArray(trains.trains) ? trains.trains : [];
    const selected = getState().selectedTrain || (options[0] && options[0].train_number) || '';
    const ignored = health && health.model_details
        ? (health.model_details.unsupported_request_fields || []) : [];
    const features = health && health.model_details ? (health.model_details.features || []) : [];

    content.innerHTML = `
    <section class="page-intro">
        <div>
            <p class="eyebrow">Simulation</p>
            <h2>Scenario comparison</h2>
            <p>Ask the model the same question with one input changed, and see whether its answer moves.</p>
        </div>
    </section>

    ${notAvailable('Rule-based scenario simulation',
        'The rule-based simulation (delay over 30 minutes becomes HIGH risk, over 10 becomes MEDIUM) runs in the Node service and is reachable only from the main RailPulse site, not from this portal. '
        + 'On this backend, POST /api/v1/simulation/update only stores a simulated state: it runs neither the model nor any rule engine.',
        { source: 'POST /api/v1/simulation/update', missing: 'the Node rule engine, which this portal does not call' })}

    ${panel({
        title: 'What a scenario can actually change',
        badges: badge('historical', 'model contract'),
        source: 'GET /api/v1/health/ -> model_details',
        body: raw(`
            <p class="rp-note">The model reads ${escapeHtml(String(features.length))} features. Nine of them come from the
                scheduled arrival time, which is why shifting the schedule is the only lever offered here.</p>
            ${features.length ? `<p class="rp-note"><strong>Used by the model:</strong>
                ${features.map((f) => `<code>${escapeHtml(f)}</code>`).join(' ')}</p>` : ''}
            ${ignored.length ? `<p class="rp-note"><strong>Accepted but ignored &mdash; changing any of these cannot change a prediction:</strong>
                ${ignored.map((f) => `<code>${escapeHtml(f)}</code>`).join(' ')}</p>` : ''}
            <p class="rp-note"><code>distance_remaining_km</code> is also ignored for a train the model already knows:
                the route distance is looked up from the training data by train number, not taken from the request.</p>
        `),
    })}

    ${options.length ? scenarioForm(options, selected) : emptyState('No trains available',
        'There are no stored train states to run a scenario against. Seed demo data first.')}

    <div id="scenario-result"></div>`;
}

function scenarioForm(options, selected) {
    return `<section class="panel rp-panel">
        <header class="panel-heading">
            <div>
                <h3>Run a scenario comparison</h3>
                <p class="panel-copy">Each scenario is a real prediction, made with the train's stored state and one
                    changed scheduled arrival. Nothing is simulated locally.</p>
            </div>
            <div class="rp-badge-row">${badge('live', 'runs the model')}</div>
        </header>
        <div class="rp-panel-body">
            <p class="rp-banner rp-banner-degraded" role="status">
                ${badge('degraded')}
                <span><strong>This writes to the backend.</strong> Each scenario adds a row to the train's prediction
                history and overwrites its stored live state with the scenario's schedule. The original state is
                restored by a final run once the comparison finishes.</span>
            </p>
            <form id="scenario-form" class="data-form">
                <div class="form-grid">
                    <label>Train
                        <select name="train_number" required>
                            ${options.map((train) => {
                                const number = cleanLabel(train.train_number, { placeholder: '' });
                                return `<option value="${escapeHtml(number)}"${number === String(selected) ? ' selected' : ''}>
                                    ${escapeHtml(number)} ${escapeHtml(cleanLabel(train.train_name, { placeholder: '' }))}</option>`;
                            }).join('')}
                        </select>
                    </label>
                </div>
                <fieldset class="scenario-set">
                    <legend>Scenarios to run</legend>
                    ${SCENARIOS.map((scenario) => `<label class="check-row">
                        <input type="checkbox" name="scenario" value="${escapeHtml(scenario.id)}"
                               ${scenario.id === 'baseline' ? 'checked disabled' : 'checked'}>
                        <span><b>${escapeHtml(scenario.label)}</b><small>${escapeHtml(scenario.note)}</small></span>
                    </label>`).join('')}
                </fieldset>
                <label class="check-row">
                    <input type="checkbox" name="acknowledge" required>
                    <span>I understand this writes predictions to this train's history and temporarily changes its stored state.</span>
                </label>
                <button class="button button-primary" type="submit">Run comparison</button>
            </form>
        </div>
    </section>`;
}

/**
 * Run the selected scenarios one after another.
 *
 * Sequential on purpose: every run upserts the same live-state document, so
 * parallel runs would race and the restore could lose. The original payload is
 * replayed in a finally block so the stored state ends up as it started, and the
 * newest history row reflects the train's real schedule rather than a scenario.
 */
export async function runScenarioComparison(form) {
    const mount = document.querySelector('#scenario-result');
    const data = new FormData(form);
    const trainNumber = String(data.get('train_number') || '').trim();
    const chosen = new Set(['baseline', ...data.getAll('scenario').map(String)]);
    const button = form.querySelector('button[type="submit"]');
    if (!trainNumber || !mount) return;
    if (!data.get('acknowledge')) {
        mount.innerHTML = errorState({ status: 0, message: 'Please acknowledge the write before running.' },
            { what: 'the comparison' });
        return;
    }

    if (button) button.disabled = true;
    mount.innerHTML = skeleton({ rows: 2, label: 'Running scenarios' });

    let original = null;
    const results = [];
    try {
        original = await api.get(`/trains/${encodeURIComponent(trainNumber)}/state`);
        const base = { ...original };
        delete base._id; delete base.state_source; delete base.updated_at; delete base.simulated_at;

        if (!base.scheduled_arrival) {
            mount.innerHTML = notAvailable('Scenario comparison',
                'This train has no stored scheduled arrival, so there is no schedule to shift. Every lever the model responds to derives from it.',
                { source: `GET /api/v1/trains/${trainNumber}/state`, missing: 'scheduled_arrival on the stored state' });
            return;
        }

        for (const scenario of SCENARIOS) {
            if (!chosen.has(scenario.id)) continue;
            const payload = { ...base, scheduled_arrival: shiftWallClock(base.scheduled_arrival, scenario.shiftMinutes) };
            // Sequential: these writes all target one document.
            // eslint-disable-next-line no-await-in-loop
            const prediction = await api.post('/predict/eta', payload);
            results.push({ scenario, payload, prediction });
        }
    } catch (error) {
        mount.innerHTML = errorState(error, { what: 'the scenario comparison' });
        if (button) button.disabled = false;
        return;
    } finally {
        // Put the train back the way it was, whatever happened above.
        if (original) {
            const restore = { ...original };
            delete restore._id; delete restore.state_source; delete restore.updated_at; delete restore.simulated_at;
            try { await api.post('/predict/eta', restore); } catch { /* reported below */ }
        }
        if (button) button.disabled = false;
    }

    mount.innerHTML = scenarioResults(trainNumber, results);
    mountScenarioChart(results);
}

/**
 * Shift a wall-clock schedule by whole minutes without going near a timezone.
 *
 * `scheduled_arrival` is Indian wall-clock digits the backend reads as naive, so
 * the shift is done on the digits and handed back in the same naive shape the
 * API expects. Converting to an instant and back would re-introduce the very
 * offset confusion the formatter exists to avoid.
 */
export function shiftWallClock(value, minutes) {
    const matched = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(value));
    if (!matched) return value;
    const [, y, mo, d, h, mi, sec] = matched;
    const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec || 0));
    const moved = new Date(asUtc + minutes * 60000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`
        + `T${pad(moved.getUTCHours())}:${pad(moved.getUTCMinutes())}:${pad(moved.getUTCSeconds())}`;
}

function scenarioResults(trainNumber, results) {
    if (!results.length) {
        return emptyState('No scenarios ran', 'Select at least one scenario and try again.');
    }
    const baseline = results.find((entry) => entry.scenario.id === 'baseline');
    const baseDelay = baseline ? finite(baseline.prediction.predicted_delay_minutes) : null;

    return `
    ${panel({
        title: `Scenario comparison — train ${cleanLabel(trainNumber)}`,
        caption: 'Each row is a real prediction. Only the scheduled arrival differs between them; every other input is identical.',
        badges: `${badge('live', 'model run')}${badge('synthetic', 'synthetic-trained model')}`,
        source: PREDICT_SOURCE,
        body: raw(`<div class="table-wrap"><table class="chart-table">
            <caption>Difference is against the "as scheduled" run.</caption>
            <thead><tr>
                <th scope="col">Scenario</th><th scope="col">Scheduled arrival used</th>
                <th scope="col">Predicted delay</th><th scope="col">Difference</th>
                <th scope="col">P10 to P90</th><th scope="col">Over 15 min</th><th scope="col">Band</th>
            </tr></thead>
            <tbody>${results.map((entry) => {
                const delay = finite(entry.prediction.predicted_delay_minutes);
                const diff = baseDelay === null || delay === null ? null : delay - baseDelay;
                return `<tr>
                    <th scope="row">${escapeHtml(entry.scenario.label)}</th>
                    <td>${escapeHtml(formatInstant(entry.payload.scheduled_arrival, { kind: WALL_CLOCK }))}</td>
                    <td>${escapeHtml(formatDelayMinutes(delay))}</td>
                    <td>${diff === null ? '&mdash;' : (Math.abs(diff) < 0.05 ? 'no change' : escapeHtml(formatDelayMinutes(diff)))}</td>
                    <td>${escapeHtml(formatDelayMinutes(entry.prediction.delay_p10_minutes))} to ${escapeHtml(formatDelayMinutes(entry.prediction.delay_p90_minutes))}</td>
                    <td>${escapeHtml(formatPercent(entry.prediction.p_delay_gt_15))}</td>
                    <td>${escapeHtml(cleanLabel(entry.prediction.delay_category, { placeholder: '—' }))}</td>
                </tr>`;
            }).join('')}</tbody>
        </table></div>
        <p class="rp-note">Only the scheduled arrival changed between these runs, so any difference above is the model
            responding to time of day, day of week or time of year &mdash; nothing else.</p>
        <p class="rp-note">The train's stored state has been restored to its original schedule by a final prediction
            after the comparison.</p>`),
    })}
    <div class="rp-chart-mount" id="scenario-chart" style="min-height:290px"></div>`;
}

function mountScenarioChart(results) {
    const points = results
        .map((entry) => ({ x: entry.scenario.label, y: finite(entry.prediction.predicted_delay_minutes) }))
        .filter((point) => point.y !== null);
    if (!points.length) return;
    renderChart(document.querySelector('#scenario-chart'), {
        kind: 'bar',
        title: 'Predicted delay by scenario',
        caption: 'Same train, same inputs, different scheduled arrival.',
        height: 260,
        source: PREDICT_SOURCE,
        badges: [{ kind: 'live', text: 'model runs' }, { kind: 'synthetic', text: 'synthetic-trained model' }],
        series: [{ label: 'Predicted delay', role: 'predicted', points }],
        yLabel: 'minutes',
        formatY: (value) => formatDelayMinutes(value),
        formatYTick: (value) => Math.round(value),
    });
}

/* ------------------------------------------------- network intelligence */

export async function renderStaffCapabilities(content) {
    content.innerHTML = skeleton({ rows: 3, label: 'Loading capability report' });
    const train = getState().selectedTrain;
    const [catalogue, propagation, risk] = await Promise.all([
        api.get('/docs/capabilities').catch((error) => ({ __error: error })),
        train ? api.get(`/network/trains/${encodeURIComponent(train)}/delay-propagation`).catch(() => null) : Promise.resolve(null),
        train ? api.get(`/network/trains/${encodeURIComponent(train)}/operational-risk`).catch(() => null) : Promise.resolve(null),
    ]);

    if (catalogue && catalogue.__error) {
        content.innerHTML = errorState(catalogue.__error, { what: 'the capability report' });
        return;
    }

    const available = Array.isArray(catalogue.available) ? catalogue.available : [];
    const future = Array.isArray(catalogue.future_data_required) ? catalogue.future_data_required : [];

    content.innerHTML = `
    <section class="page-intro">
        <div>
            <p class="eyebrow">Network intelligence</p>
            <h2>What this backend can and cannot do</h2>
            <p>Taken from the backend's own capability report, not from documentation.</p>
        </div>
    </section>

    ${panel({
        title: 'Working today',
        caption: `${available.length} capabilities are backed by real data.`,
        badges: badge('live'),
        source: CAPABILITIES_SOURCE,
        body: raw(`<ul class="capability-list">${available.map((item) =>
            `<li><span class="status-dot connected" aria-hidden="true"></span>${escapeHtml(humanise(item))}</li>`).join('')}</ul>`),
    })}

    ${panel({
        title: 'Needs data this system does not have',
        caption: `${future.length} capabilities return a typed empty response and infer nothing.`,
        badges: badge('unavailable'),
        source: CAPABILITIES_SOURCE,
        body: raw(`<ul class="capability-list">${future.map((item) =>
            `<li><span class="status-dot offline" aria-hidden="true"></span>${escapeHtml(humanise(item))}</li>`).join('')}
            </ul>${catalogue.data_contract_note ? `<p class="rp-note">${escapeHtml(catalogue.data_contract_note)}</p>` : ''}`),
    })}

    ${train ? `
        ${propagation ? notAvailable(`Delay propagation — train ${cleanLabel(train)}`,
            propagation.limitation || 'Not available on this backend.',
            { source: 'GET /api/v1/network/trains/{train}/delay-propagation',
              missing: cleanLabel(propagation.data_source, { placeholder: 'a live network feed' }) }) : ''}
        ${risk ? notAvailable(`Operational risk — train ${cleanLabel(train)}`,
            risk.limitation || 'Not available on this backend.',
            { source: 'GET /api/v1/network/trains/{train}/operational-risk',
              missing: cleanLabel(risk.data_source, { placeholder: 'a live network feed' }) }) : ''}
    ` : `<p class="rp-note">Select a train from the trains page to see the per-train network capabilities.</p>`}

    ${catalogue.model_note ? panel({
        title: 'About the model',
        badges: badge('synthetic'),
        source: CAPABILITIES_SOURCE,
        body: raw(`<p class="rp-note">${escapeHtml(catalogue.model_note)}</p>`),
    }) : ''}
    `;
}

function humanise(identifier) {
    const text = String(identifier || '').replace(/_/g, ' ').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Unnamed capability';
}
