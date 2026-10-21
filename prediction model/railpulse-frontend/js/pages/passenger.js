/**
 * The PASSENGER portal.
 *
 * One question is answered here: when will my train arrive, and how sure is
 * that? Everything that does not serve it -- error metrics, feature lists,
 * model internals, request debugging -- belongs on the staff and admin
 * surfaces, not this one.
 *
 * Three things this page is careful about, because each is a way to mislead:
 *
 *  1. `predicted_remaining_minutes` is measured from the stored state's
 *     `current_timestamp`, not from now. It equals
 *     (scheduled_arrival - current_timestamp) + predicted_delay. On a stale
 *     state that is a very different number from "time from now", so it is
 *     always presented as "when this was calculated", never as a countdown.
 *  2. `TrainStateRequest` has no `data_source` field, so a DEMO train's
 *     prediction comes back saying `data_source: "LIVE"`. The origin of the
 *     input is therefore read from the stored state, never from the response.
 *  3. Nothing in this system is GPS-tracked. The route timeline says where each
 *     node's information actually comes from rather than implying live tracking.
 */

import { api } from '../api.js';
import { renderChart } from '../charts.js';
import {
    INSTANT, WALL_CLOCK, age, cleanLabel, countUp, finite, formatClock, formatDay,
    formatDelayMinutes, formatDuration, formatInstant, formatPercent,
} from '../format.js';
import {
    badge, coverageNote, degradedBanner, emptyState, errorState, escapeHtml, metaList,
    notAvailable, panel, raw, skeleton, sourceFooter, staleBanner, timeNotice,
} from '../ui.js';
import { getState, setTrainContext } from '../state.js';

const PREDICT_SOURCE = 'POST /api/v1/predict/eta';
const STATE_SOURCE = 'GET /api/v1/trains/{train}/state';
const HISTORY_SOURCE = 'GET /api/v1/trains/{train}/predictions';
const ROUTE_SOURCE = 'GET /api/v1/reference/trains/{train}/route';
const STOPS_SOURCE = 'GET /api/v1/trains/{train}/upcoming-stations';

/* ------------------------------------------------------------------ pages */

/**
 * The PASSENGER dashboard: a welcome page, and nothing more.
 *
 * It deliberately calls no endpoint and shows no number. Everything about a
 * particular train -- state, route, arrival estimate, history -- lives on the
 * Track a train page, which this page links to. A dashboard that duplicated the
 * lookup gave the passenger two places to ask the same question, and a hero
 * reading "LIVE SIGNAL" implied a live feed that neither page has.
 */
export async function renderPassengerDashboard(content) {
    const user = getState().session?.user || {};
    const name = cleanLabel(user.full_name || user.username, { placeholder: 'traveller' });
    content.innerHTML = `
        <section class="welcome reveal">
            <div>
                <p class="eyebrow">${escapeHtml(greeting())} &middot; ${escapeHtml(formatDay(new Date()))}</p>
                <h2>Welcome to RailPulse, ${escapeHtml(name)}.</h2>
                <p class="lede">RailPulse estimates when a train is likely to arrive, and how uncertain
                    that estimate is. Every arrival here is a model estimate with a range around it, not a
                    guarantee, and no train on this service is tracked live.</p>
            </div>
            <p class="muted">Arrival estimates &middot; not live tracking</p>
        </section>

        ${panel({
            title: 'Where to go next',
            caption: 'This page holds no train data. Open Track a train to look one up.',
            body: raw(`
                <div class="train-card-grid">${DASHBOARD_LINKS.map(navCard).join('')}</div>
                <div class="action-row">
                    <a class="button button-primary" href="#/passenger/train">Track a train</a>
                </div>`),
        })}`;
}

/** The passenger pages this dashboard points at. Every target already exists. */
const DASHBOARD_LINKS = [
    {
        href: '#/passenger/train',
        kicker: 'Start here',
        title: 'Track a train',
        copy: 'Look up a train and see its predicted arrival, with the range the model puts around it.',
    },
    {
        href: '#/passenger/history',
        kicker: 'Earlier runs',
        title: 'Prediction history',
        copy: 'Every estimate the model has already made for a train. Past estimates, not recorded arrivals.',
    },
    {
        href: '#/passenger/alerts',
        kicker: 'Service news',
        title: 'Alerts',
        copy: 'Operational alerts. This backend generates none yet, and the page says so rather than showing an empty inbox.',
    },
];

function navCard(item) {
    return `<a class="train-card" href="${item.href}">
        <p class="eyebrow">${escapeHtml(item.kicker)}</p>
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.copy)}</p>
    </a>`;
}

/** Time-of-day greeting, read in the display zone so it agrees with shown times. */
function greeting() {
    const hour = Number(formatClock(new Date()).slice(0, 2));
    if (!Number.isFinite(hour)) return 'Welcome';
    if (hour < 12) return 'Good morning';
    return hour < 18 ? 'Good afternoon' : 'Good evening';
}

export async function renderPassengerTrain(content) {
    const selected = getState().selectedTrain;
    content.innerHTML = `
        ${lookupPanel('Track a train', 'The predicted arrival comes from the model, using the journey state stored by the backend.')}
        <div id="journey-result">${selected ? skeleton({ large: true, rows: 2, label: 'Loading journey' }) : chooseTrainState()}</div>
        <div id="train-list"></div>`;
    await Promise.all([
        selected ? loadJourney(selected, document.querySelector('#journey-result')) : Promise.resolve(),
        loadTrainChoices(document.querySelector('#train-list')),
    ]);
}

export async function renderPassengerHistory(content) {
    const selected = getState().selectedTrain;
    content.innerHTML = `
        ${lookupPanel('Past predictions', 'Every prediction already made for this train, newest first. These are the model\'s past estimates, not recorded arrivals.')}
        <div id="history-result">${selected ? skeleton({ rows: 3, label: 'Loading history' }) : chooseTrainState()}</div>`;
    if (selected) await loadHistory(selected, document.querySelector('#history-result'));
}

/**
 * Alerts cannot ever be populated on this backend: the endpoint answers
 * `future_data_required` with an empty list for every role. Showing an empty
 * inbox would read as "no problems"; this says why there is nothing.
 */
export async function renderPassengerAlerts(content) {
    content.innerHTML = skeleton({ rows: 2, label: 'Loading alerts' });
    try {
        const data = await api.get('/alerts?limit=50');
        const alerts = Array.isArray(data.alerts) ? data.alerts : [];
        if (!alerts.length) {
            content.innerHTML = notAvailable(
                'Service alerts',
                data.limitation || 'This backend does not generate alerts.',
                { source: 'GET /api/v1/alerts', missing: cleanLabel(data.data_source, { placeholder: 'a live event feed' }) },
            ) + `<p class="rp-note">This is not a statement that your train is running normally. No alerting exists here at all, so nothing can be reported either way.</p>`;
            return;
        }
        content.innerHTML = panel({
            title: 'Service alerts', badges: badge('live'), source: 'GET /api/v1/alerts',
            body: raw(alerts.map(alertCard).join('')),
        });
    } catch (error) {
        content.innerHTML = errorState(error, { what: 'service alerts' });
    }
}

function alertCard(alert) {
    return `<article class="alert-card">
        <span class="severity">${escapeHtml(cleanLabel(alert.severity, { placeholder: 'Unspecified' }))}</span>
        <div><h4>${escapeHtml(cleanLabel(alert.title || alert.message, { placeholder: 'Untitled alert' }))}</h4>
        <p class="muted">${escapeHtml(cleanLabel(alert.description || '', { placeholder: '' }))}</p></div>
    </article>`;
}

/* ------------------------------------------------------------- the journey */

/**
 * Load everything the journey view needs and render it.
 *
 * The prediction is allowed to fail on its own: a 503 means no model is loaded,
 * and the schedule and route are still worth showing, so the page degrades to
 * "here is the timetable, there is no prediction" rather than to an error.
 */
export async function loadJourney(trainNumber, mount) {
    if (!mount) return;
    mount.innerHTML = skeleton({ large: true, rows: 2, label: 'Loading journey' });

    let state;
    try {
        state = await api.get(`/trains/${encodeURIComponent(trainNumber)}/state`);
    } catch (error) {
        mount.innerHTML = error.status === 404
            ? emptyState(`Train ${cleanLabel(trainNumber)} is not in the live feed`,
                'The backend has no stored state for this train, so there is nothing to predict from. Try another number.')
            : errorState(error, { what: `train ${cleanLabel(trainNumber)}` });
        return;
    }

    const [prediction, route, stops, history] = await Promise.all([
        api.post('/predict/eta', predictionPayload(state)).catch((error) => ({ __error: error })),
        api.get(`/reference/trains/${encodeURIComponent(trainNumber)}/route`).catch(() => null),
        api.get(`/trains/${encodeURIComponent(trainNumber)}/upcoming-stations`).catch(() => null),
        api.get(`/trains/${encodeURIComponent(trainNumber)}/predictions?limit=50&skip=0`).catch(() => null),
    ]);

    const failed = prediction && prediction.__error ? prediction.__error : null;
    setTrainContext(trainNumber, state, failed ? null : prediction);
    mount.innerHTML = journeyView({ state, prediction: failed ? null : prediction, failed, route, stops, history });
    mountJourneyCharts({ prediction: failed ? null : prediction, history, state });
}

/** The exact Pydantic-compatible payload, matching the existing app.js helper. */
function predictionPayload(state) {
    const payload = { ...state };
    delete payload._id;
    delete payload.state_source;
    delete payload.updated_at;
    delete payload.simulated_at;
    return payload;
}

function journeyView({ state, prediction, failed, route, stops, history }) {
    const trainNumber = cleanLabel(state.train_number);
    const name = cleanLabel(state.train_name || state.train_type, { placeholder: 'Service name not recorded' });
    // The INPUT's origin, from the stored state. The prediction response always
    // says LIVE because TrainStateRequest has no data_source field to carry it.
    const inputOrigin = String(state.data_source || 'LIVE').toUpperCase();
    const isDemo = inputOrigin === 'DEMO';
    const quality = (prediction && prediction.model_quality) || null;

    return `
    <section class="journey-head">
        <div>
            <p class="eyebrow">Train ${escapeHtml(trainNumber)}</p>
            <h2>${escapeHtml(cleanLabel(state.source, { placeholder: 'Origin not recorded' }))}
                <span aria-hidden="true">&#8594;</span>
                ${escapeHtml(cleanLabel(state.destination, { placeholder: 'Destination not recorded' }))}</h2>
            <p class="muted">${escapeHtml(name)}</p>
        </div>
        <div class="rp-badge-row">
            ${isDemo ? badge('synthetic', 'demo journey') : ''}
            ${quality && String(quality.data_provenance || '').toLowerCase() === 'synthetic'
                ? badge('synthetic', `model trained on ${escapeHtml(String(finite(quality.dataset_rows) ?? 'unknown'))} rows`) : ''}
        </div>
    </section>

    ${staleBanner(state.updated_at, { what: 'This journey state' })}
    ${failed && failed.status === 503 ? degradedBanner(null) : ''}

    ${failed ? predictionUnavailable(failed) : arrivalPanel(state, prediction)}

    ${routePanel({ state, route, stops, prediction })}

    ${historyPanel(history)}

    ${provenanceFooter({ state, prediction, isDemo })}
    `;
}

/* ------------------------------------------------------------ the answer */

function arrivalPanel(state, prediction) {
    const scheduled = state.scheduled_arrival;
    const delay = finite(prediction.predicted_delay_minutes);
    const p10 = finite(prediction.delay_p10_minutes);
    const p90 = finite(prediction.delay_p90_minutes);
    const remaining = finite(prediction.predicted_remaining_minutes);
    const stateAge = age(state.current_timestamp);

    const lateness = delay === null
        ? 'The model did not return a delay for this journey.'
        : delay < 0.05
            ? 'The model expects this train to arrive on its scheduled time.'
            : `The model expects this train to arrive <strong>${escapeHtml(formatDelayMinutes(delay))}</strong> against its schedule.`;

    const windowLine = p10 === null || p90 === null
        ? 'No range was returned for this prediction.'
        : `Most likely somewhere between <strong>${escapeHtml(formatClock(prediction.eta_lower, { kind: WALL_CLOCK }))}</strong>
           and <strong>${escapeHtml(formatClock(prediction.eta_upper, { kind: WALL_CLOCK }))}</strong>
           &mdash; that is ${escapeHtml(formatDelayMinutes(p10))} to ${escapeHtml(formatDelayMinutes(p90))} against the timetable.`;

    return panel({
        title: 'Predicted arrival',
        badges: badge('live'),
        source: PREDICT_SOURCE,
        sourceExtra: `model ${cleanLabel(prediction.model_version)}`,
        body: raw(`
        <div class="journey-times">
            <div class="journey-time">
                <p class="metric-label">Scheduled arrival</p>
                <p class="rp-tile-value">${escapeHtml(formatClock(scheduled, { kind: WALL_CLOCK }))}</p>
                <p class="muted">${escapeHtml(formatInstant(scheduled, { kind: WALL_CLOCK }))}</p>
            </div>
            <div class="journey-time journey-time-primary">
                <p class="metric-label">Predicted arrival</p>
                <p class="rp-tile-value"><span id="predicted-arrival-clock">${escapeHtml(formatClock(prediction.predicted_eta, { kind: WALL_CLOCK }))}</span></p>
                <p class="muted">${escapeHtml(formatInstant(prediction.predicted_eta, { kind: WALL_CLOCK }))}</p>
            </div>
            <div class="journey-time">
                <p class="metric-label">Journey left to run</p>
                <p class="rp-tile-value">${escapeHtml(formatDuration(remaining))}</p>
                <p class="muted">measured from ${escapeHtml(formatClock(state.current_timestamp, { kind: INSTANT }))}, not from now${
                    stateAge.stale ? ` &mdash; that reading is ${escapeHtml(stateAge.text)}` : ''}</p>
            </div>
        </div>

        <p class="journey-lede">${lateness}</p>
        <p class="journey-lede">${windowLine}</p>

        ${chanceLine(prediction)}

        <div class="rp-chart-mount" id="arrival-interval-chart" style="min-height:150px"></div>

        ${coverageNote(prediction.confidence)}
        ${timeNotice()}
        `),
    });
}

/**
 * The probability of a significant delay, in words a passenger can act on.
 * Stated as "about N in 100 journeys like this one", because a bare percentage
 * invites reading it as certainty about this particular train.
 */
function chanceLine(prediction) {
    const p = finite(prediction.p_delay_gt_15);
    if (p === null) return '';
    const inHundred = Math.round(p * 100);
    return `<p class="journey-lede">Chance of arriving more than 15 minutes late:
        <strong>${escapeHtml(formatPercent(p))}</strong> &mdash; about ${escapeHtml(String(inHundred))}
        in 100 journeys that look like this one to the model.</p>`;
}

function predictionUnavailable(error) {
    if (error.status === 503) {
        return notAvailable('Predicted arrival',
            'No prediction model is loaded on the backend, so no arrival can be estimated for this journey. The scheduled time below is the timetable only.',
            { source: PREDICT_SOURCE, missing: 'a trained model artifact' });
    }
    return errorState(error, { what: 'the arrival prediction' });
}

/* --------------------------------------------------------------- the route */

/**
 * The route, with each node labelled by where its information actually comes
 * from. Nothing here is GPS-tracked, and the panel says so rather than letting
 * a timeline imply live positioning.
 */
function routePanel({ state, route, stops, prediction }) {
    const stopList = (stops && Array.isArray(stops.upcoming_stations)) ? stops.upcoming_stations : [];
    const limitations = [
        route && route.limitation,
        stops && stops.limitation,
    ].filter(Boolean);

    const nodes = [
        {
            name: cleanLabel(route ? route.origin : state.source, { placeholder: 'Origin not recorded' }),
            role: 'Origin', kind: 'Timetable', detail: 'From the route record in the training dataset.',
        },
        {
            name: cleanLabel(state.current_station || state.current_section, { placeholder: 'Position not reported' }),
            role: 'Last reported position', kind: 'Reported state',
            detail: 'Whatever the backend has stored for this train. It is not a GPS fix and does not update on its own.',
        },
        {
            name: cleanLabel(route ? route.destination : state.destination, { placeholder: 'Destination not recorded' }),
            role: 'Destination', kind: prediction ? 'Predicted' : 'Timetable',
            detail: prediction
                ? `Model estimate: ${formatClock(prediction.predicted_eta, { kind: WALL_CLOCK })}.`
                : 'No prediction is available, so only the scheduled time is known.',
        },
    ];

    return panel({
        title: 'Route',
        caption: stopList.length
            ? `${stopList.length} modelled stop${stopList.length === 1 ? '' : 's'} ahead.`
            : 'Origin and destination only.',
        badges: badge('historical', 'route from dataset'),
        source: `${ROUTE_SOURCE} + ${STOPS_SOURCE}`,
        body: raw(`
        <div class="timeline journey-timeline">
            ${nodes.map((node, index) => `
                <div class="timeline-stop ${index === 0 ? 'complete' : index === 1 ? 'current' : ''}">
                    <i aria-hidden="true"></i>
                    <span>
                        <b>${escapeHtml(node.name)}</b>
                        <small>${escapeHtml(node.role)} &middot; <em>${escapeHtml(node.kind)}</em></small>
                        <small class="muted">${escapeHtml(node.detail)}</small>
                    </span>
                </div>`).join('')}
        </div>
        <p class="rp-note"><strong>No part of this route is GPS-tracked.</strong>
            Each stop above is marked with where its information comes from: the timetable in the
            dataset, the last state the backend stored, or the model's estimate.</p>
        ${limitations.length ? `<p class="rp-note">${limitations.map((line) => escapeHtml(line)).join(' ')}</p>` : ''}
        ${route && route.distance_km ? metaList([
            ['Distance', `${escapeHtml(String(finite(route.distance_km) ?? '--'))} km`],
            ['Runs', cleanLabel(route.run_frequency, { placeholder: 'Not recorded' })],
        ]) : ''}
        `),
    });
}

/* -------------------------------------------------------------- the history */

function historyPanel(history) {
    const rows = (history && Array.isArray(history.predictions)) ? history.predictions : [];
    if (!rows.length) {
        return panel({
            title: 'Earlier predictions',
            source: HISTORY_SOURCE,
            body: raw(emptyState('No earlier predictions',
                'Nothing has been predicted for this train yet. The first prediction is the one above.')),
        });
    }
    return panel({
        title: 'How this prediction has changed',
        caption: 'Each point is a prediction the model made earlier for this train. These are past estimates, not recorded arrivals: this system never learns what time the train actually arrived.',
        badges: badge('live', `${rows.length} prediction${rows.length === 1 ? '' : 's'}`),
        source: HISTORY_SOURCE,
        body: raw(`<div class="rp-chart-mount" id="history-sparkline" style="min-height:90px"></div>`),
    });
}

/* ------------------------------------------------------------- provenance */

function provenanceFooter({ state, prediction, isDemo }) {
    const quality = (prediction && prediction.model_quality) || null;
    const lines = [];

    if (isDemo) {
        lines.push('This journey is demo data generated from the training dataset, not a real service.');
    }
    if (quality && quality.notice) lines.push(String(quality.notice));
    // Rule 4: when the model loses to its baseline, say so in plain words on any
    // surface showing an ETA. Passengers get the sentence, not the numbers.
    if (quality && quality.beats_baseline === false) {
        lines.push('This model does not currently beat a simple average-delay baseline, so treat the arrival time above as a rough prototype estimate rather than a forecast.');
    }
    if (prediction && prediction.train_known_to_model === false) {
        lines.push('This train was not in the data the model was trained on, so the estimate is based on similar routes rather than this service\'s own history.');
    }
    if (!lines.length) return '';

    return `<section class="rp-provenance">
        <h4>About this estimate</h4>
        ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
        ${sourceFooter(STATE_SOURCE, `state updated ${formatInstant(state.updated_at, { kind: INSTANT })}`)}
    </section>`;
}

/* ----------------------------------------------------------------- charts */

function mountJourneyCharts({ prediction, history, state }) {
    if (prediction) {
        const p10 = finite(prediction.delay_p10_minutes);
        const p50 = finite(prediction.predicted_delay_minutes);
        const p90 = finite(prediction.delay_p90_minutes);
        if (p10 !== null && p50 !== null && p90 !== null) {
            renderChart(document.querySelector('#arrival-interval-chart'), {
                kind: 'interval',
                title: 'How late, and how uncertain',
                caption: 'Zero is the scheduled time. The bar is where the model thinks the arrival falls.',
                height: 140,
                source: PREDICT_SOURCE,
                reference: [0],
                referenceLabel: 'scheduled',
                series: [{ label: 'Predicted delay', role: 'predicted', points: [{ x: 0, y: p50, lower: p10, upper: p90 }] }],
                formatXTick: (value) => `${Math.round(value)} min`,
                formatY: (value) => formatDelayMinutes(value),
            });
        }
        // The count-up runs only on a real change, so re-polling the same
        // journey does not re-animate the headline time.
        countUp(document.querySelector('#predicted-arrival-clock'), null, {
            format: () => formatClock(prediction.predicted_eta, { kind: WALL_CLOCK }),
        });
    }

    const rows = (history && Array.isArray(history.predictions)) ? history.predictions : [];
    if (rows.length) {
        // The API returns newest first; a timeline reads oldest to newest.
        const ordered = [...rows].reverse();
        renderChart(document.querySelector('#history-sparkline'), {
            kind: 'line',
            title: 'Predicted delay, earlier runs',
            height: 180,
            source: HISTORY_SOURCE,
            xLabel: 'Prediction run',
            yLabel: 'minutes late',
            series: [{
                label: 'Predicted delay',
                role: 'predicted',
                // predicted_delay_minutes IS the P50; there is no
                // delay_p50_minutes field in the stored history.
                points: ordered.map((row, index) => ({
                    x: index,
                    y: finite(row.predicted_delay_minutes),
                    lower: finite(row.delay_p10_minutes),
                    upper: finite(row.delay_p90_minutes),
                    label: formatInstant(row.timestamp, { kind: INSTANT }),
                })),
            }],
            formatX: (index) => {
                const row = ordered[index];
                return row ? formatClock(row.timestamp, { kind: INSTANT }) : `run ${index + 1}`;
            },
            formatY: (value) => formatDelayMinutes(value),
        });
    }
}

/* ------------------------------------------------------------- lookup bits */

function lookupPanel(heading, copy) {
    return `<section class="lookup-panel reveal">
        <div>
            <p class="eyebrow">Your journey</p>
            <h3>${escapeHtml(heading)}</h3>
            <p>${escapeHtml(copy)}</p>
        </div>
        <form id="lookup-form" class="lookup-form">
            <label class="sr-only" for="lookup-train">Train number</label>
            <input id="lookup-train" name="train_number" list="train-options" autocomplete="off"
                   placeholder="Train number" inputmode="numeric"
                   value="${escapeHtml(getState().selectedTrain)}" required>
            <datalist id="train-options"></datalist>
            <button class="button button-primary" type="submit">Track train</button>
        </form>
    </section>`;
}

function chooseTrainState() {
    return emptyState('No train selected',
        'Enter a train number above, or pick one from the list below, to see its predicted arrival.');
}

/** The trains that actually have a stored state, so the list is never a guess. */
async function loadTrainChoices(mount) {
    if (!mount) return;
    mount.innerHTML = skeleton({ rows: 2, label: 'Loading available trains' });
    try {
        const data = await api.get('/trains');
        const trains = Array.isArray(data.trains) ? data.trains : [];
        if (!trains.length) {
            mount.innerHTML = emptyState('No trains in the live feed',
                'The backend has no stored train states yet, so there is nothing to track. Staff can seed demo data from their portal.');
            return;
        }
        const options = document.querySelector('#train-options');
        if (options) {
            options.textContent = '';
            for (const train of trains) {
                const option = document.createElement('option');
                option.value = String(train.train_number || '');
                option.textContent = cleanLabel(train.train_name, { placeholder: '' });
                options.appendChild(option);
            }
        }
        mount.innerHTML = panel({
            title: 'Trains you can track',
            caption: `${trains.length} train${trains.length === 1 ? '' : 's'} currently have a stored state.`,
            source: 'GET /api/v1/trains',
            body: raw(`<div class="train-card-grid">${trains.map(choiceCard).join('')}</div>`),
        });
    } catch (error) {
        mount.innerHTML = errorState(error, { what: 'the list of trains' });
    }
}

function choiceCard(train) {
    const number = cleanLabel(train.train_number, { placeholder: 'Unknown' });
    const isDemo = String(train.data_source || '').toUpperCase() === 'DEMO';
    const delay = finite(train.current_delay_minutes);
    return `<article class="train-card">
        <div class="train-card-top">
            <div>
                <p class="eyebrow">${escapeHtml(number)}</p>
                <h4>${escapeHtml(cleanLabel(train.train_name || train.train_type, { placeholder: 'Service name not recorded' }))}</h4>
            </div>
            ${isDemo ? badge('synthetic', 'demo') : ''}
        </div>
        <p>${escapeHtml(cleanLabel(train.source, { placeholder: 'Origin not recorded' }))}
           <span aria-hidden="true">&#8594;</span>
           ${escapeHtml(cleanLabel(train.destination, { placeholder: 'Destination not recorded' }))}</p>
        <small>Scheduled ${escapeHtml(formatClock(train.scheduled_arrival, { kind: WALL_CLOCK }))}</small>
        <small>Last reported delay: ${escapeHtml(formatDelayMinutes(delay))}</small>
        <div class="action-row compact">
            <button class="button button-primary" type="button" data-action="track-train"
                    data-train="${escapeHtml(number)}">See arrival</button>
        </div>
    </article>`;
}

/* ----------------------------------------------------------------- history */

async function loadHistory(trainNumber, mount) {
    if (!mount) return;
    mount.innerHTML = skeleton({ rows: 3, label: 'Loading history' });
    try {
        const data = await api.get(`/trains/${encodeURIComponent(trainNumber)}/predictions?limit=50&skip=0`);
        const rows = Array.isArray(data.predictions) ? data.predictions : [];
        if (!rows.length) {
            mount.innerHTML = emptyState('No predictions yet',
                `Nothing has been predicted for train ${cleanLabel(trainNumber)} yet. Open it from Track train to make the first one.`);
            return;
        }
        mount.innerHTML = historyPanel(data) + historyTable(data);
        mountJourneyCharts({ prediction: null, history: data, state: null });
    } catch (error) {
        mount.innerHTML = errorState(error, { what: 'the prediction history' });
    }
}

function historyTable(data) {
    const rows = data.predictions;
    return panel({
        title: `Every prediction for train ${cleanLabel(data.train_number)}`,
        caption: 'Newest first. Times are the predicted arrival, not a recorded one.',
        badges: badge('live'),
        source: HISTORY_SOURCE,
        body: raw(`<div class="table-wrap"><table class="chart-table">
            <thead><tr>
                <th scope="col">Predicted at</th>
                <th scope="col">Predicted arrival</th>
                <th scope="col">Delay</th>
                <th scope="col">Range</th>
            </tr></thead>
            <tbody>${rows.map((row) => {
                const p10 = finite(row.delay_p10_minutes);
                const p90 = finite(row.delay_p90_minutes);
                return `<tr>
                    <th scope="row">${escapeHtml(formatInstant(row.timestamp, { kind: INSTANT }))}</th>
                    <td>${escapeHtml(formatClock(row.predicted_eta, { kind: WALL_CLOCK }))}</td>
                    <td>${escapeHtml(formatDelayMinutes(row.predicted_delay_minutes))}</td>
                    <td>${p10 === null || p90 === null
                        ? 'Not recorded'
                        : `${escapeHtml(formatDelayMinutes(p10))} to ${escapeHtml(formatDelayMinutes(p90))}`}</td>
                </tr>`;
            }).join('')}</tbody>
        </table></div>`),
    });
}
