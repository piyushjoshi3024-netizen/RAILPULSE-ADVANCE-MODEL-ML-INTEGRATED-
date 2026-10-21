/**
 * The ADMIN portal.
 *
 * Admin asks a different question from staff: not "which train is late" but
 * "should anyone believe this model at all". So this surface is organised
 * around a single hard separation that the rest of the app does not need:
 *
 *   LIVE                  what the service is doing right now -- is a model
 *                         loaded, which version, how fresh is the data.
 *   HISTORICAL EVALUATION  what was measured once, on a held-out split, at
 *                         training time. None of it describes live traffic.
 *
 * The two are visually distinct and separately badged, because a measured MAE
 * presented beside live counters reads as live accuracy, which it is not.
 *
 * Everything historical comes from one of two sources, both stated per card:
 * the public /health metrics, or the ADMIN-only /model/evaluation export. The
 * export is the only thing that makes per-row charts honest -- without it the
 * scatter and the residual histogram are "Not available", not approximated.
 */

import { api } from '../api.js';
import { renderChart } from '../charts.js';
import { histogram } from '../chart-core.js';
import {
    INSTANT, age, cleanLabel, finite, formatDelayMinutes, formatInstant, formatNumber, formatPercent,
} from '../format.js';
import {
    badge, baselineVerdict, coverageNote, degradedBanner, emptyState, errorState, escapeHtml,
    metaList, notAvailable, panel, raw, skeleton, sourceFooter,
} from '../ui.js';

const HEALTH_SOURCE = 'GET /api/v1/health/';
const EVAL_SOURCE = 'GET /api/v1/model/evaluation';
const TRAINS_SOURCE = 'GET /api/v1/trains';

/* ---------------------------------------------------------- live overview */

export async function renderAdminDashboard(content) {
    content.innerHTML = skeleton({ large: true, rows: 3, label: 'Loading service state' });
    const [health, trains] = await Promise.all([
        api.get('/health/').catch((error) => ({ __error: error })),
        api.get('/trains').catch(() => null),
    ]);
    if (health && health.__error) {
        content.innerHTML = errorState(health.__error, { what: 'service health' });
        return;
    }
    const rows = trains && Array.isArray(trains.trains) ? trains.trains : [];
    const now = Date.now();
    const stale = rows.filter((train) => age(train.updated_at, now).stale);
    const demo = rows.filter((train) => String(train.data_source || '').toUpperCase() === 'DEMO');
    const dataset = health.dataset || {};
    const synthetic = String(dataset.data_provenance || '').toLowerCase() === 'synthetic';

    content.innerHTML = `
    <section class="page-intro">
        <div>
            <p class="eyebrow">Administration</p>
            <h2>Service state</h2>
            <p>What this backend is doing right now. Measured model quality is on the
               <a class="text-link" href="#/admin/system">System health</a> page and is not a live figure.</p>
        </div>
    </section>

    ${health.model !== 'ok' ? degradedBanner(health) : ''}

    <section class="rp-live-block">
        <h3 class="rp-section-heading">${badge('live')} Live
            ${synthetic ? badge('synthetic', `model trained on ${escapeHtml(String(finite(dataset.rows) ?? 'unknown'))} rows`) : ''}</h3>
        ${synthetic ? `<p class="rp-section-copy">The version named below was trained on
            <strong>synthetic data</strong>. The service being healthy says nothing about whether its
            predictions are accurate.</p>` : ''}
        <section class="metric-grid">
            ${statusTile('Service', health.status, health.status === 'ok' ? 'All components reporting' : 'At least one component is degraded')}
            ${statusTile('Database', health.mongodb, health.mongodb === 'ok' ? 'Reachable' : 'Not reachable')}
            ${statusTile('Model', health.model, health.model === 'ok' ? 'Artifact loaded' : 'No usable artifact')}
            ${statusTile('Train states', String(rows.length), `${demo.length} demo, ${stale.length} stale`)}
        </section>
        ${metaList([
            ['Active model version', cleanLabel(health.model_version)],
            ['Environment', cleanLabel(health.environment)],
            ['Artifact present', health.model_details && health.model_details.artifact_exists ? 'Yes' : 'No'],
            ['Load error', (health.model_details && health.model_details.load_error) || 'None'],
        ])}
        ${sourceFooter(HEALTH_SOURCE)}
    </section>

    ${requestCountersUnavailable()}

    <div id="admin-demo-panel"></div>
    `;
}

function statusTile(label, value, note) {
    const text = cleanLabel(value, { placeholder: 'unknown' });
    const tone = text === 'ok' ? 'ok' : text === 'error' || text === 'degraded' ? 'bad' : 'neutral';
    return `<article class="metric-card rp-tile rp-status-${tone}">
        <p class="metric-label">${escapeHtml(label)}</p>
        <p class="rp-tile-value">${escapeHtml(text)}</p>
        <p class="muted rp-tile-note">${escapeHtml(note)}</p>
    </article>`;
}

/**
 * Rule 7: an absent capability gets an explicit reason and names the endpoint
 * that would have to exist. Fallback and failure counts are a reasonable thing
 * for an admin to want, and this backend simply does not record them.
 */
function requestCountersUnavailable() {
    return notAvailable(
        'Fallback and failed-request counts',
        'This backend keeps no request counters. Nothing records how many predictions were served, how many fell back, '
        + 'or how many failed, so no such figure can be shown here. The FastAPI service has no fallback path at all: '
        + 'when no model is loaded it returns 503 rather than substituting a rule-based answer. '
        + 'The rule-based fallback described in the project belongs to the Node service and is not visible from this portal.',
        { source: 'no endpoint exists', missing: 'a counters or metrics endpoint on the FastAPI service' },
    );
}

/* ------------------------------------------------- model + evaluation page */

export async function renderAdminSystem(content) {
    content.innerHTML = skeleton({ large: true, rows: 4, label: 'Loading model report' });
    const [health, evaluation] = await Promise.all([
        api.get('/health/').catch((error) => ({ __error: error })),
        api.get('/model/evaluation').catch((error) => ({ __error: error })),
    ]);
    if (health && health.__error) {
        content.innerHTML = errorState(health.__error, { what: 'the model report' });
        return;
    }
    const evalData = evaluation && evaluation.__error ? null : evaluation;
    const evalError = evaluation && evaluation.__error ? evaluation.__error : null;

    const details = health.model_details || {};
    const metrics = details.metrics || {};
    const dataset = health.dataset || {};
    const quality = health.model_quality || {};

    content.innerHTML = `
    <section class="page-intro">
        <div>
            <p class="eyebrow">System health</p>
            <h2>Model readiness and measured quality</h2>
            <p>Two different things are shown below, kept apart on purpose: what the service is doing
               now, and what was measured once on a held-out split at training time.</p>
        </div>
    </section>

    ${health.model !== 'ok' ? degradedBanner(health) : ''}

    <section class="rp-live-block">
        <h3 class="rp-section-heading">${badge('live')} Live</h3>
        <p class="rp-section-copy">True of the running service at this moment.</p>
        ${metaList([
            ['Service status', cleanLabel(health.status)],
            ['Model status', cleanLabel(health.model)],
            ['Active version', cleanLabel(health.model_version)],
            ['Artifact present', details.artifact_exists ? 'Yes' : 'No'],
            ['Load error', details.load_error || 'None'],
            ['Environment', cleanLabel(health.environment)],
        ])}
        ${sourceFooter(HEALTH_SOURCE)}
    </section>

    <section class="rp-historical-block">
        <h3 class="rp-section-heading">${badge('historical')} Historical evaluation</h3>
        <p class="rp-section-copy">Measured once, on data held out of training. These figures describe that
            split and nothing else. They are <strong>not</strong> a live accuracy reading, and no arrival on this
            system is ever compared against a prediction after the fact.</p>

        ${provenancePanel(dataset, evalData, health)}
        ${baselinePanel(metrics, quality, evalData)}
        ${intervalPanel(metrics)}
        ${segmentPanel(metrics)}
        ${calibrationPanel(metrics)}
        ${evalData ? perRowPanels(evalData) : evaluationUnavailable(evalError)}
        ${evalData ? candidatePanel(evalData) : ''}
        ${featureImportancePanel(details)}
    </section>
    `;

    mountModelCharts(metrics, evalData, quality);
}

/* ------------------------------------------------------------- provenance */

function provenancePanel(dataset, evalData, health) {
    const trainedAt = evalData && evalData.model ? evalData.model.trained_at : null;
    const trainedAge = trainedAt ? age(trainedAt) : null;
    const range = Array.isArray(dataset.date_range) && dataset.date_range.length === 2
        ? `${cleanLabel(dataset.date_range[0])} to ${cleanLabel(dataset.date_range[1])}` : null;
    const synthetic = String(dataset.data_provenance || '').toLowerCase() === 'synthetic';

    return panel({
        title: 'Dataset and training provenance',
        badges: `${badge('historical')}${synthetic ? badge('synthetic', `${escapeHtml(String(finite(dataset.rows) ?? 'unknown'))} rows`) : ''}`,
        source: evalData ? `${HEALTH_SOURCE} + ${EVAL_SOURCE}` : HEALTH_SOURCE,
        body: raw(`
            ${metaList([
                ['Dataset', cleanLabel(dataset.name)],
                ['Provenance', cleanLabel(dataset.data_provenance)],
                ['Rows', String(finite(dataset.rows) ?? 'Not reported')],
                ['Distinct trains', String(finite(dataset.distinct_trains) ?? 'Not reported')],
                ['Period covered', range || 'Not reported'],
                ['Dataset SHA-256', dataset.sha256 ? String(dataset.sha256).slice(0, 16) + '…' : 'Not reported'],
                ['Model trained at', trainedAt ? formatInstant(trainedAt, { kind: INSTANT }) : 'Not reported'],
                ['Training age', trainedAge ? trainedAge.text : 'Not reported'],
                ['Split', evalData && evalData.split
                    ? `${finite(evalData.split.train_rows)} train / ${finite(evalData.split.validation_rows)} validation / ${finite(evalData.split.test_rows)} test`
                    : 'Not reported'],
                ['Test split begins', evalData && evalData.split ? cleanLabel(evalData.split.test_start) : 'Not reported'],
                ['Git commit', evalData && evalData.model && evalData.model.git_commit
                    ? String(evalData.model.git_commit).slice(0, 12) : 'Not reported'],
            ])}
            ${synthetic ? `<p class="rp-verdict rp-verdict-bad">The training data is <strong>generated, not observed</strong>.
                Every figure on this page demonstrates that the pipeline works. None of it is evidence about
                real-world railway accuracy.</p>` : ''}
            ${health.model_quality && health.model_quality.notice
                ? `<p class="rp-note">${escapeHtml(health.model_quality.notice)}</p>` : ''}
        `),
    });
}

/* --------------------------------------------------- baseline + intervals */

function baselinePanel(metrics, quality, evalData) {
    const selected = metrics.test_point_p50 || {};
    const baseline = metrics.test_baseline_global_mean || {};
    const regressor = metrics.test_point_selected_regressor || {};
    const split = evalData && evalData.split ? evalData.split : null;

    return panel({
        title: 'Shipped model against its baseline',
        caption: split
            ? `Both measured on the same held-out split: ${finite(split.test_rows)} rows from ${cleanLabel(split.test_start)} onward.`
            : 'Both measured on the same held-out split.',
        badges: badge('historical'),
        source: HEALTH_SOURCE,
        body: raw(`
            ${baselineVerdict(quality)}
            <div class="rp-chart-mount" id="baseline-chart" style="min-height:250px"></div>
            <div class="table-wrap"><table class="chart-table">
                <caption>Lower is better for every error measure. R² above zero means better than predicting the mean.</caption>
                <thead><tr><th scope="col">Model</th><th scope="col">MAE (min)</th><th scope="col">Median AE (min)</th>
                    <th scope="col">RMSE (min)</th><th scope="col">R²</th></tr></thead>
                <tbody>
                    ${metricRow('Shipped (P50 quantile)', selected)}
                    ${metricRow('Selected regressor', regressor)}
                    ${metricRow('Baseline (global mean)', baseline)}
                </tbody>
            </table></div>
            <p class="rp-note">The shipped point estimate is the P50 quantile, not the selected regressor; both are
                listed because they are different models and they score differently.</p>
        `),
    });
}

function metricRow(label, values) {
    return `<tr>
        <th scope="row">${escapeHtml(label)}</th>
        <td>${escapeHtml(formatNumber(values.mae_minutes, 2))}</td>
        <td>${escapeHtml(formatNumber(values.median_ae_minutes, 2))}</td>
        <td>${escapeHtml(formatNumber(values.rmse_minutes, 2))}</td>
        <td>${escapeHtml(formatNumber(values.r2, 3))}</td>
    </tr>`;
}

function intervalPanel(metrics) {
    const intervals = metrics.test_intervals || {};
    return panel({
        title: 'Prediction interval coverage',
        badges: badge('historical'),
        source: `${HEALTH_SOURCE} -> metrics.test_intervals`,
        body: raw(`
            <div class="rp-chart-mount" id="coverage-chart" style="min-height:150px"></div>
            ${coverageNote(intervals.coverage, finite(intervals.nominal_coverage) ?? 0.8)}
            ${metaList([
                ['Measured coverage', formatPercent(intervals.coverage, 1)],
                ['Nominal coverage', formatPercent(intervals.nominal_coverage, 0)],
                ['Mean interval width', `${formatNumber(intervals.mean_width_minutes, 1)} min`],
                ['Pinball loss P10', formatNumber(intervals.pinball && intervals.pinball['q0.1'], 3)],
                ['Pinball loss P50', formatNumber(intervals.pinball && intervals.pinball['q0.5'], 3)],
                ['Pinball loss P90', formatNumber(intervals.pinball && intervals.pinball['q0.9'], 3)],
            ])}
        `),
    });
}

/* ------------------------------------------------------- segments + bands */

function segmentPanel(metrics) {
    const segments = metrics.test_error_by_segment || {};
    const byTrain = Array.isArray(segments.train_number) ? segments.train_number : [];
    const byFrequency = Array.isArray(segments.run_frequency) ? segments.run_frequency : [];
    if (!byTrain.length && !byFrequency.length) {
        return notAvailable('Error by segment', 'The health endpoint reported no per-segment breakdown.',
            { source: HEALTH_SOURCE });
    }
    return panel({
        title: 'Held-out error by train and by service frequency',
        caption: 'Bias is the mean signed error: positive means the model predicted later than the train actually arrived.',
        badges: badge('historical'),
        source: `${HEALTH_SOURCE} -> metrics.test_error_by_segment`,
        body: raw(`
            <div class="rp-chart-mount" id="segment-chart" style="min-height:290px"></div>
            <div class="table-wrap"><table class="chart-table">
                <caption>Per-train error on the held-out split. A small count means a noisy figure.</caption>
                <thead><tr><th scope="col">Train</th><th scope="col">Rows</th><th scope="col">MAE (min)</th>
                    <th scope="col">Bias (min)</th><th scope="col">Mean actual delay (min)</th></tr></thead>
                <tbody>${byTrain.map((entry) => `<tr>
                    <th scope="row">${escapeHtml(cleanLabel(entry.train_number))}</th>
                    <td>${escapeHtml(String(finite(entry.count) ?? '—'))}</td>
                    <td>${escapeHtml(formatNumber(entry.mae_minutes, 2))}</td>
                    <td>${escapeHtml(formatNumber(entry.bias_minutes, 2))}</td>
                    <td>${escapeHtml(formatNumber(entry.actual_mean, 2))}</td>
                </tr>`).join('')}</tbody>
            </table></div>
            ${byFrequency.length ? `<div class="table-wrap"><table class="chart-table">
                <caption>By service frequency.</caption>
                <thead><tr><th scope="col">Frequency</th><th scope="col">Rows</th><th scope="col">MAE (min)</th>
                    <th scope="col">Bias (min)</th></tr></thead>
                <tbody>${byFrequency.map((entry) => `<tr>
                    <th scope="row">${escapeHtml(cleanLabel(entry.run_frequency))}</th>
                    <td>${escapeHtml(String(finite(entry.count) ?? '—'))}</td>
                    <td>${escapeHtml(formatNumber(entry.mae_minutes, 2))}</td>
                    <td>${escapeHtml(formatNumber(entry.bias_minutes, 2))}</td>
                </tr>`).join('')}</tbody>
            </table></div>` : ''}
            <p class="rp-note"><strong>Station-level error is not available at any granularity.</strong>
                The dataset records origin and destination only, with no intermediate station sequence, so there is
                nothing to break down by station.</p>
        `),
    });
}

function calibrationPanel(metrics) {
    const curve = Array.isArray(metrics.test_binary_calibration) ? metrics.test_binary_calibration : [];
    const classifier = metrics.test_binary_classifier || {};
    if (!curve.length) {
        return notAvailable('Probability calibration', 'The health endpoint reported no calibration curve.',
            { source: HEALTH_SOURCE });
    }
    return panel({
        title: 'Is "chance of delay over 15 minutes" calibrated?',
        caption: 'Each point compares what the model said would happen against what did happen, on the held-out split. On the diagonal means well calibrated.',
        badges: badge('historical'),
        source: `${HEALTH_SOURCE} -> metrics.test_binary_calibration`,
        body: raw(`
            <div class="rp-chart-mount" id="calibration-chart" style="min-height:270px"></div>
            ${metaList([
                ['ROC AUC', formatNumber(classifier.roc_auc, 3)],
                ['PR AUC', formatNumber(classifier.pr_auc, 3)],
                ['Brier score', formatNumber(classifier.brier, 3)],
                ['Accuracy', formatPercent(classifier.accuracy, 1)],
                ['F1', formatNumber(classifier.f1, 3)],
                ['Positive rate in split', formatPercent(classifier.positive_rate, 1)],
            ])}
            <p class="rp-note">Only ${escapeHtml(String(curve.length))} probability bin${curve.length === 1 ? '' : 's'}
                had enough rows to measure, so this curve is indicative rather than conclusive.</p>
        `),
    });
}

/* ----------------------------------------------------- per-row (gate D3) */

function perRowPanels(evalData) {
    const rows = Array.isArray(evalData.test_rows) ? evalData.test_rows : [];
    if (!rows.length) {
        return notAvailable('Per-row evaluation', 'The export contains no test rows.', { source: EVAL_SOURCE });
    }
    const residuals = rows.map((row) => finite(row.residual_minutes)).filter((value) => value !== null);
    const over = residuals.filter((value) => value > 0).length;
    const under = residuals.filter((value) => value < 0).length;

    return `
    ${panel({
        title: 'Predicted against actual, row by row',
        caption: `Every one of the ${escapeHtml(String(rows.length))} held-out journeys. Points on the diagonal were predicted exactly right; above it the model predicted a longer delay than occurred.`,
        badges: badge('historical', `${rows.length} rows`),
        source: EVAL_SOURCE,
        body: raw(`<div class="rp-chart-mount" id="scatter-chart" style="min-height:320px"></div>`),
    })}
    ${panel({
        title: 'Residual distribution',
        caption: 'Residual is predicted minus actual, in minutes. A model with no systematic bias is centred on zero.',
        badges: badge('historical', `${residuals.length} rows`),
        source: EVAL_SOURCE,
        body: raw(`
            <div class="rp-chart-mount" id="residual-chart" style="min-height:290px"></div>
            ${metaList([
                ['Predicted too late', `${over} of ${residuals.length} (${formatPercent(over / residuals.length, 0)})`],
                ['Predicted too early', `${under} of ${residuals.length} (${formatPercent(under / residuals.length, 0)})`],
                ['Mean residual', `${formatNumber(mean(residuals), 2)} min`],
                ['Median residual', `${formatNumber(median(residuals), 2)} min`],
            ])}
            <p class="rp-note">A mean residual away from zero is systematic bias, not noise: it means the model leans
                one way across the whole split.</p>
        `),
    })}
    ${panel({
        title: 'Held-out error over time',
        caption: 'Absolute error per journey, ordered by journey date. This is the historical test split, not live traffic.',
        badges: badge('historical'),
        source: EVAL_SOURCE,
        body: raw(`<div class="rp-chart-mount" id="historical-trend" style="min-height:290px"></div>`),
    })}
    `;
}

function evaluationUnavailable(error) {
    if (error && error.status === 404) {
        return notAvailable(
            'Per-row evaluation: predicted against actual, residuals, error over time',
            'No evaluation export is present on the backend. These charts need the actual arrival time of every '
            + 'held-out journey, which only the training run has. They are not approximated from the aggregates.',
            { source: EVAL_SOURCE, missing: 'reports/evaluation.json, written by python3 -m training.pipeline' },
        );
    }
    return errorState(error || { status: 0 }, { what: 'the evaluation export' });
}

function candidatePanel(evalData) {
    const candidates = Array.isArray(evalData.candidates) ? evalData.candidates : [];
    if (!candidates.length) {
        return notAvailable('Candidate comparison', 'The export contains no candidate table.', { source: EVAL_SOURCE });
    }
    const selectedName = evalData.model ? evalData.model.selected_regressor : null;
    const selectedEncoder = evalData.model ? evalData.model.encoder : null;
    return panel({
        title: 'Every candidate considered during selection',
        caption: 'Cross-validated on the development window only, never on the test split. Baselines are included so the comparison is honest about what was actually beaten.',
        badges: badge('historical', `${candidates.length} candidates`),
        source: EVAL_SOURCE,
        body: raw(`<div class="table-wrap"><table class="chart-table">
            <caption>Ordered as the trainer ranked them. The shipped model is marked.</caption>
            <thead><tr><th scope="col">Model</th><th scope="col">Encoder</th>
                <th scope="col">CV MAE (min)</th><th scope="col">CV std</th></tr></thead>
            <tbody>${candidates.map((entry) => {
                const isSelected = entry.model === selectedName && entry.encoder === selectedEncoder;
                const isBaseline = String(entry.model || '').startsWith('baseline');
                return `<tr${isSelected ? ' class="is-selected"' : ''}>
                    <th scope="row">${escapeHtml(cleanLabel(entry.model))}
                        ${isSelected ? '<span class="band-chip band-ON_TIME">selected</span>' : ''}
                        ${isBaseline ? '<span class="band-chip band-MINOR">baseline</span>' : ''}</th>
                    <td>${escapeHtml(cleanLabel(entry.encoder, { placeholder: '—' }))}</td>
                    <td>${escapeHtml(formatNumber(entry.cv_mae_minutes, 3))}</td>
                    <td>${escapeHtml(formatNumber(entry.cv_mae_std, 3))}</td>
                </tr>`;
            }).join('')}</tbody>
        </table></div>
        <p class="rp-note">Cross-validated error is not comparable with the held-out figures above: it is measured on
            a different set of rows.</p>`),
    });
}

/**
 * Feature importance genuinely does not exist. What does exist is the feature
 * contract, so this shows which inputs the model reads and which were excluded
 * and why, rather than leaving an empty card.
 */
function featureImportancePanel(details) {
    const features = Array.isArray(details.features) ? details.features : [];
    const excluded = details.excluded_features && typeof details.excluded_features === 'object'
        ? Object.entries(details.excluded_features) : [];
    const unsupported = Array.isArray(details.unsupported_request_fields) ? details.unsupported_request_fields : [];

    return `
    ${notAvailable('Feature importance',
        'The training pipeline exports no importances of any kind, so none can be shown. Nothing here is inferred from '
        + 'the aggregates: an importance ranking invented from measured error would be a guess presented as a finding.',
        { source: 'not exported by training.pipeline', missing: 'permutation importance computed on the held-out split' })}
    ${panel({
        title: 'What the model does and does not read',
        caption: 'The feature contract, which is exported, and is the closest honest answer to "what matters".',
        badges: badge('historical'),
        source: `${HEALTH_SOURCE} -> model_details`,
        body: raw(`
            ${features.length ? `<p class="rp-note"><strong>Read by the model (${escapeHtml(String(features.length))}):</strong>
                ${features.map((f) => `<code>${escapeHtml(f)}</code>`).join(' ')}</p>` : ''}
            ${excluded.length ? `<div class="rp-excluded"><p class="rp-note"><strong>Deliberately excluded:</strong></p>
                <dl class="rp-meta">${excluded.map(([name, reason]) =>
                    `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(String(reason))}</dd></div>`).join('')}</dl></div>` : ''}
            ${unsupported.length ? `<p class="rp-note"><strong>Accepted from callers but ignored (${escapeHtml(String(unsupported.length))}):</strong>
                ${unsupported.map((f) => `<code>${escapeHtml(f)}</code>`).join(' ')}.
                Sending these cannot change a prediction.</p>` : ''}
        `),
    })}`;
}

/* ----------------------------------------------------------------- charts */

function mountModelCharts(metrics, evalData, quality) {
    const selected = metrics.test_point_p50 || {};
    const baseline = metrics.test_baseline_global_mean || {};
    const regressor = metrics.test_point_selected_regressor || {};

    renderChart(document.querySelector('#baseline-chart'), {
        kind: 'bar',
        title: 'Mean absolute error on the held-out split',
        caption: 'Lower is better. The baseline simply predicts the average delay of the training data.',
        height: 220,
        source: `${HEALTH_SOURCE} -> metrics`,
        badges: [{ kind: 'historical', text: 'held-out split' }],
        series: [{
            label: 'MAE (minutes)',
            role: 'predicted',
            points: [
                { x: 'Shipped P50', y: finite(selected.mae_minutes) },
                { x: 'Selected regressor', y: finite(regressor.mae_minutes) },
                { x: 'Baseline mean', y: finite(baseline.mae_minutes) },
            ].filter((point) => point.y !== null),
        }],
        yLabel: 'minutes',
        includeZero: true,
        formatY: (value) => `${value.toFixed(2)} min`,
        formatYTick: (value) => value.toFixed(0),
    });

    const intervals = metrics.test_intervals || {};
    if (finite(intervals.coverage) !== null) {
        renderChart(document.querySelector('#coverage-chart'), {
            kind: 'progress',
            title: 'Measured interval coverage against its target',
            height: 140,
            max: 1,
            target: finite(intervals.nominal_coverage) ?? 0.8,
            targetLabel: `nominal ${formatPercent(intervals.nominal_coverage, 0)}`,
            source: `${HEALTH_SOURCE} -> metrics.test_intervals`,
            badges: [{ kind: 'historical', text: 'held-out split' }],
            series: [{ label: 'Coverage', role: 'observed', points: [{ x: 0, y: finite(intervals.coverage) }] }],
        });
    }

    const byTrain = (metrics.test_error_by_segment || {}).train_number;
    if (Array.isArray(byTrain) && byTrain.length) {
        renderChart(document.querySelector('#segment-chart'), {
            kind: 'bar',
            title: 'Error and bias by train',
            caption: 'MAE is how wrong, bias is which way. A train with high MAE but near-zero bias is noisy rather than skewed.',
            height: 260,
            source: `${HEALTH_SOURCE} -> metrics.test_error_by_segment.train_number`,
            badges: [{ kind: 'historical', text: 'held-out split' }],
            series: [
                { label: 'MAE', role: 'predicted', points: byTrain.map((e) => ({ x: cleanLabel(e.train_number), y: finite(e.mae_minutes) })) },
                { label: 'Bias', role: 'baseline', points: byTrain.map((e) => ({ x: cleanLabel(e.train_number), y: finite(e.bias_minutes) })) },
            ],
            yLabel: 'minutes',
            includeZero: true,
            formatY: (value) => `${value.toFixed(1)} min`,
            formatYTick: (value) => value.toFixed(0),
        });
    }

    const curve = metrics.test_binary_calibration;
    if (Array.isArray(curve) && curve.length) {
        renderChart(document.querySelector('#calibration-chart'), {
            kind: 'scatter',
            title: 'Predicted probability against observed rate',
            caption: 'On the diagonal means the model\'s stated chance matched how often it actually happened.',
            height: 250,
            identityLine: true,
            source: `${HEALTH_SOURCE} -> metrics.test_binary_calibration`,
            badges: [{ kind: 'historical', text: 'held-out split' }],
            xLabel: 'predicted probability',
            yLabel: 'observed rate',
            series: [{
                label: 'Calibration bin',
                role: 'observed',
                points: curve.map((bin) => ({
                    x: finite(bin.mean_predicted),
                    y: finite(bin.observed_rate),
                    label: `${finite(bin.count) ?? 0} rows`,
                })),
            }],
            formatX: (value) => formatPercent(value, 0),
            formatXTick: (value) => formatPercent(value, 0),
            formatY: (value) => formatPercent(value, 0),
            formatYTick: (value) => formatPercent(value, 0),
        });
    }

    if (!evalData) return;
    const rows = Array.isArray(evalData.test_rows) ? evalData.test_rows : [];
    if (!rows.length) return;

    renderChart(document.querySelector('#scatter-chart'), {
        kind: 'scatter',
        title: 'Predicted delay against actual delay',
        caption: 'Each point is one held-out journey. The diagonal is a perfect prediction.',
        height: 300,
        identityLine: true,
        source: EVAL_SOURCE,
        badges: [{ kind: 'historical', text: `${rows.length} held-out journeys` },
                 { kind: 'synthetic', text: 'synthetic dataset' }],
        xLabel: 'actual delay (minutes)',
        yLabel: 'predicted delay (minutes)',
        series: [{
            label: 'Journey',
            role: 'predicted',
            points: rows.map((row) => ({
                x: finite(row.actual_delay_minutes),
                y: finite(row.p50),
                label: `${cleanLabel(row.train_number)} on ${cleanLabel(row.journey_date)}`,
            })).filter((point) => point.x !== null && point.y !== null),
        }],
        formatX: (value) => `${formatNumber(value, 0)} min`,
        formatXTick: (value) => formatNumber(value, 0),
        formatY: (value) => `${formatNumber(value, 1)} min`,
        formatYTick: (value) => formatNumber(value, 0),
    });

    const residuals = rows.map((row) => finite(row.residual_minutes)).filter((value) => value !== null);
    renderChart(document.querySelector('#residual-chart'), {
        kind: 'histogram',
        title: 'Residuals: predicted minus actual',
        caption: 'Bars right of zero are journeys the model thought would be later than they were.',
        height: 260,
        bins: 16,
        zeroReference: true,
        source: EVAL_SOURCE,
        badges: [{ kind: 'historical', text: `${residuals.length} held-out journeys` }],
        xLabel: 'residual (minutes)',
        yLabel: 'journeys',
        series: [{ label: 'Residual', role: 'warning', points: residuals.map((value, index) => ({ x: index, y: value })) }],
        formatY: (value) => `${formatNumber(value, 1)} min`,
    });

    const ordered = [...rows]
        .filter((row) => finite(row.residual_minutes) !== null)
        .sort((a, b) => String(a.journey_date || '').localeCompare(String(b.journey_date || '')));
    renderChart(document.querySelector('#historical-trend'), {
        kind: 'line',
        title: 'Absolute error by journey date',
        caption: 'Ordered by the date of the journey. Rising error to the right would mean the model ages badly.',
        height: 260,
        source: EVAL_SOURCE,
        badges: [{ kind: 'historical', text: 'held-out split' }],
        xLabel: 'journey date',
        yLabel: 'absolute error (minutes)',
        series: [{
            label: 'Absolute error',
            role: 'warning',
            points: ordered.map((row, index) => ({
                x: index,
                y: Math.abs(finite(row.residual_minutes)),
                label: `${cleanLabel(row.train_number)} on ${cleanLabel(row.journey_date)}`,
            })),
        }],
        formatX: (index) => (ordered[index] ? cleanLabel(ordered[index].journey_date) : `row ${index + 1}`),
        formatY: (value) => `${formatNumber(value, 1)} min`,
        formatYTick: (value) => formatNumber(value, 0),
    });
}

function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export { histogram };
