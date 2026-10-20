/**
 * Honest data-surface states, provenance badges and source footers.
 *
 * Every function here returns an HTML string, because the surrounding app.js
 * composes pages with innerHTML templates. Each one therefore escapes its own
 * dynamic content: callers never have to remember to. The one escape hatch,
 * `raw()`, exists so a caller can nest already-built markup, and it is the only
 * place an unescaped string is accepted.
 *
 * Charts are the exception: charts.js builds real nodes and sets text through
 * textContent, so chart labels never pass through string templates at all.
 */

import { TIME_NOTICE, age, cleanLabel, finite, formatInstant } from './format.js';

/**
 * Canonical HTML escape. Behaviourally identical to the escapeHtml already in
 * app.js; duplicated rather than exported from there so this module has no
 * dependency on the page controller.
 */
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[character]));
}

/** Mark a string as already-safe markup. Use only for markup you built. */
export function raw(markup) {
    return { __html: String(markup) };
}

function render(value) {
    if (value && typeof value === 'object' && typeof value.__html === 'string') return value.__html;
    return escapeHtml(value);
}

/* ---------------------------------------------------------------- badges */

/**
 * The three provenance labels rule 3 requires, plus a few operational ones.
 * `synthetic` is deliberately the loudest: a synthetic-trained model must never
 * read as a production model.
 */
const BADGES = Object.freeze({
    live: { text: 'Live prediction', title: 'Produced now by the model from the current stored state.' },
    historical: { text: 'Historical evaluation', title: 'Measured on the held-out test split, not a live prediction.' },
    synthetic: { text: 'Synthetic data', title: 'The model was trained on generated data. Metrics demonstrate the pipeline, not real-world accuracy.' },
    dataset: { text: 'Dataset summary', title: 'Computed over the whole dataset, including rows the model trained on. Not a held-out result.' },
    rulebased: { text: 'Rule-based, not ML', title: 'Produced by fixed thresholds in the Node service. The model was not involved.' },
    fallback: { text: 'Fallback used', title: 'The model did not answer; a rule-based result was served instead.' },
    degraded: { text: 'Model unavailable', title: 'No model artifact is loaded, so no prediction can be made.' },
    stale: { text: 'Stale', title: 'The underlying state is older than the freshness threshold.' },
    unavailable: { text: 'Not available', title: 'The data this needs does not exist in this system.' },
});

/**
 * @param {string} kind one of the keys above
 * @param {string} [detail] appended after an en dash, e.g. the dataset name
 */
export function badge(kind, detail) {
    const spec = BADGES[kind];
    if (!spec) return '';
    const text = detail ? `${spec.text} - ${detail}` : spec.text;
    return `<span class="rp-badge rp-badge-${escapeHtml(kind)}" title="${escapeHtml(spec.title)}">${escapeHtml(text)}</span>`;
}

/**
 * The provenance badge set for a model, derived from a /health or
 * PredictionResponse.model_quality payload. Never guesses: an absent field
 * produces no claim.
 */
export function provenanceBadges(quality, { context = 'live' } = {}) {
    if (!quality) return badge('degraded');
    const out = [badge(context)];
    if (String(quality.data_provenance || '').toLowerCase() === 'synthetic') {
        out.push(badge('synthetic', `${Number(quality.dataset_rows ?? 0) || 'unknown'} rows`));
    }
    return out.join('');
}

/**
 * The plain-words baseline verdict. Rule 4 requires this wherever an ETA or a
 * metric is shown, and requires it to be explicit when the model loses.
 */
export function baselineVerdict(quality) {
    if (!quality || quality.beats_baseline === null || quality.beats_baseline === undefined) {
        return `<p class="rp-verdict rp-verdict-unknown">Whether this model beats its baseline is not reported.</p>`;
    }
    // finite(), not Number(): Number(null) is 0, which would turn a missing MAE
    // into a fabricated margin equal to the baseline.
    const mae = finite(quality.test_mae_minutes);
    const baseline = finite(quality.baseline_mae_minutes);
    const margin = mae !== null && baseline !== null ? Math.abs(mae - baseline).toFixed(1) : null;
    if (quality.beats_baseline) {
        return `<p class="rp-verdict rp-verdict-ok">This model beats its baseline${
            margin ? ` by ${escapeHtml(margin)} minutes of average error` : ''
        } on the held-out test split.</p>`;
    }
    return `<p class="rp-verdict rp-verdict-bad">This model does <strong>not</strong> beat its baseline${
        margin ? `: it is ${escapeHtml(margin)} minutes worse on average` : ''
    }. Treat every number it produces as a prototype result, not a forecast.</p>`;
}

/**
 * The interval caveat. "Confidence" in this API is measured test-set coverage,
 * not a per-prediction score, and on the current model it under-covers, so the
 * shortfall is stated rather than rounded away.
 */
export function coverageNote(coverage, nominal = 0.8) {
    // finite(), not Number(): a missing coverage must not render as "0.0% of
    // the time", which would state a measurement that was never taken.
    const measured = finite(coverage);
    if (measured === null) {
        return `<p class="rp-note">Interval coverage was not measured for this model.</p>`;
    }
    const shortfall = nominal - measured;
    const measuredPct = (measured * 100).toFixed(1);
    const nominalPct = (nominal * 100).toFixed(0);
    const tail = shortfall > 0.01
        ? ` That is below the ${escapeHtml(nominalPct)}% it aims for, so the real range is wider than shown more often than it should be.`
        : '';
    return `<p class="rp-note">The P10-P90 range contained the true arrival <strong>${
        escapeHtml(measuredPct)}%</strong> of the time on the held-out test split. This is measured coverage across that split, not a confidence score for this one prediction.${tail}</p>`;
}

/* ----------------------------------------------------------- source line */

/**
 * The per-card provenance footer rule 2 requires: where this number came from.
 * @param {string} source an endpoint path or a file path
 */
export function sourceFooter(source, extra) {
    return `<p class="rp-source">Source: <code>${escapeHtml(source)}</code>${
        extra ? ` - ${escapeHtml(extra)}` : ''
    }</p>`;
}

/* ---------------------------------------------------------------- states */

/** Loading placeholder. Shape-matched to the content so nothing jumps. */
export function skeleton({ rows = 3, large = false, label = 'Loading' } = {}) {
    const bars = [
        ...(large ? ['<div class="skeleton skeleton-large"></div>'] : []),
        ...Array.from({ length: rows }, () => '<div class="skeleton"></div>'),
    ].join('');
    return `<div class="loading-grid" role="status" aria-live="polite">
        <span class="sr-only">${escapeHtml(label)}</span>${bars}</div>`;
}

/** Nothing to show, and that is a legitimate answer. */
export function emptyState(title, copy) {
    return `<section class="empty-hero rp-state">
        <div class="empty-icon" aria-hidden="true">&#9675;</div>
        <div><h3>${render(title)}</h3><p class="lede">${render(copy)}</p></div>
    </section>`;
}

/**
 * A real failure, with what the reader can do about it. Never swallows the
 * message the API sent, because that message is usually the actionable part.
 */
export function errorState(error, { retryAction = null, what = 'this panel' } = {}) {
    const status = error && error.status ? error.status : 0;
    const message = (error && error.message) || 'The request failed.';
    const guidance = {
        0: 'The FastAPI backend could not be reached. Confirm it is listening on the configured URL.',
        401: 'Your session has expired. Sign in again.',
        403: 'Your role does not have access to this data. This is enforced by the server, not hidden by the page.',
        404: 'This record is not in the live feed. Seed demo data or pick another train.',
        408: 'The request timed out. The backend may be busy; retry.',
        422: 'The backend rejected the input as invalid. Check the values and retry.',
        503: 'No model artifact is loaded. Train one with: python3 -m training.pipeline --config configs/dataset.synthetic552.json',
    }[status] || 'Check the backend service logs for the cause.';

    return `<section class="empty-hero error-state rp-state">
        <div class="empty-icon" aria-hidden="true">&#9888;</div>
        <div>
            <h3>Could not load ${escapeHtml(what)}</h3>
            <p class="lede">${escapeHtml(message)}</p>
            <p class="muted">${escapeHtml(guidance)}</p>
            ${retryAction ? `<button class="button button-secondary" type="button" data-action="${escapeHtml(retryAction)}">Retry</button>` : ''}
        </div>
    </section>`;
}

/**
 * The data loaded, but it is old. States the age and the timestamp rather than
 * just colouring something orange.
 */
export function staleBanner(timestamp, { what = 'This state', now = Date.now() } = {}) {
    const verdict = age(timestamp, now);
    if (!verdict.stale) return '';
    return `<p class="rp-banner rp-banner-stale" role="status">
        ${badge('stale')}
        <span>${escapeHtml(what)} was last updated ${escapeHtml(verdict.text)} (${escapeHtml(formatInstant(timestamp))}). Everything derived from it is that old too.</span>
    </p>`;
}

/**
 * No model is loaded, so nothing can be predicted. Says what to run.
 */
export function degradedBanner(health) {
    const detail = health && health.model_details && health.model_details.load_error;
    return `<p class="rp-banner rp-banner-degraded" role="status">
        ${badge('degraded')}
        <span>No prediction model is loaded, so no ETA can be produced.${
            detail ? ` The service reported: ${escapeHtml(detail)}.` : ''
        } Train one with <code>python3 -m training.pipeline --config configs/dataset.synthetic552.json</code>.</span>
    </p>`;
}

/**
 * A capability this system genuinely cannot provide. Rule 7: an explicit reason,
 * no dead controls, no fake toggle. `reason` is usually the API's own
 * `limitation` string, which is the most accurate explanation available.
 */
export function notAvailable(title, reason, { source = null, missing = null } = {}) {
    return `<section class="rp-unavailable">
        <header>${badge('unavailable')}<h4>${render(title)}</h4></header>
        <p>${render(reason)}</p>
        ${missing ? `<p class="muted">Needs: ${escapeHtml(missing)}</p>` : ''}
        ${source ? sourceFooter(source) : ''}
    </section>`;
}

/* ------------------------------------------------------------ containers */

/** A titled panel with an optional badge row and a mandatory source footer. */
export function panel({ title, caption, badges = '', body = '', source = null, sourceExtra = null, id = null }) {
    return `<section class="panel rp-panel"${id ? ` id="${escapeHtml(id)}"` : ''}>
        <header class="panel-heading">
            <div>
                <h3>${render(title)}</h3>
                ${caption ? `<p class="panel-copy">${render(caption)}</p>` : ''}
            </div>
            ${badges ? `<div class="rp-badge-row">${badges}</div>` : ''}
        </header>
        <div class="rp-panel-body">${render(body)}</div>
        ${source ? sourceFooter(source, sourceExtra) : ''}
    </section>`;
}

/** A mount point for a chart. charts.js fills it; nothing fake is pre-rendered. */
export function chartMount(id, { height = 240 } = {}) {
    return `<div class="rp-chart-mount" id="${escapeHtml(id)}" style="min-height:${Number(height) || 240}px"></div>`;
}

/**
 * One sentence on the timezone, shown wherever times are displayed.
 * The caveat belongs next to the data, not buried in a formatter.
 */
export function timeNotice() {
    return `<p class="rp-note rp-note-time">${escapeHtml(TIME_NOTICE)}</p>`;
}

/** A key-value list for provenance. Values are trimmed for display only. */
export function metaList(entries) {
    const items = entries
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${
            typeof value === 'object' && value && typeof value.__html === 'string'
                ? value.__html
                : escapeHtml(cleanLabel(value, { placeholder: 'Not reported' }))
        }</dd></div>`)
        .join('');
    return `<dl class="rp-meta">${items}</dl>`;
}

/**
 * A metric tile. `value` is rendered as given, so a caller can pass a
 * placeholder; a tile never shows a number the API did not send.
 */
export function metricTile({ label, value, unit = '', note = '', countUpId = null }) {
    return `<article class="metric-card rp-tile">
        <p class="metric-label">${render(label)}</p>
        <p class="rp-tile-value"><span${countUpId ? ` id="${escapeHtml(countUpId)}"` : ''}>${render(value)}</span>${
        unit ? `<span class="unit">${escapeHtml(unit)}</span>` : ''
    }</p>
        ${note ? `<p class="muted rp-tile-note">${render(note)}</p>` : ''}
    </article>`;
}
