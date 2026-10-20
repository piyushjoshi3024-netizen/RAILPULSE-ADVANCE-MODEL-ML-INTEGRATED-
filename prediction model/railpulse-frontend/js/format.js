/**
 * Formatting, time and motion helpers shared by every RailPulse surface.
 *
 * Timezone policy (deliberate, documented, single point of change)
 * ----------------------------------------------------------------
 * The FastAPI backend treats every datetime as UTC: app/ml/predictor.py attaches
 * UTC to naive values and demo state is built from datetime.now(timezone.utc).
 * Aware fields (predicted_eta, eta_lower, eta_upper) come back with a "Z";
 * naive fields (scheduled_arrival, current_timestamp, prediction history
 * timestamps) come back with no offset at all.
 *
 * We therefore read naive values AS UTC -- exactly as the backend does -- and
 * label every rendered time with its zone. Shifting them to IST would move
 * every displayed time 5h30m away from what the API actually means.
 *
 * The underlying synthetic CSV holds bare wall-clock times that were authored as
 * Indian local time and are never converted by the cleaning code, so these
 * instants are not timetable-accurate. That caveat belongs on screen next to the
 * provenance, not hidden in a formatter. See TIME_NOTICE.
 */

/**
 * Finite numeric value, or null.
 *
 * Deliberately stricter than Number(): Number(null), Number(''), Number(false)
 * and Number([]) are all 0. Without this guard a missing API field renders as a
 * real zero -- a missing delay would read "on time", which is a lie about the
 * data, not a formatting nicety.
 */
export function finite(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/**
 * Month names are pinned rather than taken from Intl, because ICU versions
 * disagree: en-GB short September is "Sep" in some builds and "Sept" in others.
 * A date must not change shape between browsers.
 */
const MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

/** Zone used for display. Change here only; nothing else hardcodes a zone. */
export const DISPLAY_ZONE = Object.freeze({
    timeZone: 'UTC',
    label: 'UTC',
});

export const TIME_NOTICE =
    'Times are shown in UTC, which is how the backend stores and returns them. '
    + 'The synthetic source data was authored as Indian wall-clock time and is served '
    + 'without conversion, so these instants are not timetable-accurate.';

/** Anything older than this is presented as stale, with the age stated. */
export const STALE_AFTER_MS = 10 * 60 * 1000;

const ISO_WITH_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parse an API datetime, recording whether the backend sent a zone at all.
 *
 * A naive string is interpreted as UTC to match app/ml/predictor.py. Returning
 * `naive` lets a caller disclose that the zone was assumed rather than stated.
 *
 * @returns {{date: Date|null, naive: boolean}}
 */
export function parseInstant(value) {
    if (value instanceof Date) {
        return { date: Number.isNaN(value.getTime()) ? null : value, naive: false };
    }
    if (typeof value !== 'string' || !value.trim()) return { date: null, naive: false };
    const raw = value.trim();
    const naive = !ISO_WITH_ZONE.test(raw);
    const date = new Date(naive ? `${raw}Z` : raw);
    return { date: Number.isNaN(date.getTime()) ? null : date, naive };
}

function parts(date) {
    const numeric = new Intl.DateTimeFormat('en-GB', {
        timeZone: DISPLAY_ZONE.timeZone,
        day: '2-digit', month: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    return { ...numeric, month: MONTHS[Number(numeric.month) - 1] || numeric.month };
}

/** "28 Sep 2026, 15:53 UTC", or the placeholder when there is no value. */
export function formatInstant(value, { placeholder = 'Not available' } = {}) {
    const { date } = parseInstant(value);
    if (!date) return placeholder;
    const p = parts(date);
    return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${DISPLAY_ZONE.label}`;
}

/** "15:53 UTC" -- for dense surfaces where the date is already established. */
export function formatClock(value, { placeholder = '--:--' } = {}) {
    const { date } = parseInstant(value);
    if (!date) return placeholder;
    const p = parts(date);
    return `${p.hour}:${p.minute} ${DISPLAY_ZONE.label}`;
}

/** "28 Sep 2026" */
export function formatDay(value, { placeholder = 'Not available' } = {}) {
    const { date } = parseInstant(value);
    if (!date) return placeholder;
    const p = parts(date);
    return `${p.day} ${p.month} ${p.year}`;
}

/**
 * Age of a timestamp, with an explicit stale verdict.
 *
 * `now` is injectable so this is testable and so a caller can age several
 * values against one consistent instant.
 *
 * @returns {{ms: number|null, text: string, stale: boolean}}
 */
export function age(value, now = Date.now(), staleAfterMs = STALE_AFTER_MS) {
    const { date } = parseInstant(value);
    if (!date) return { ms: null, text: 'unknown age', stale: true };
    const ms = now - date.getTime();
    if (ms < 0) return { ms, text: 'dated in the future', stale: true };
    return { ms, text: `${describeSpan(ms)} ago`, stale: ms > staleAfterMs };
}

/** "45 seconds", "22 minutes", "3 hours", "22 days" -- always singular-aware. */
export function describeSpan(ms) {
    const units = [
        ['day', 86400000],
        ['hour', 3600000],
        ['minute', 60000],
        ['second', 1000],
    ];
    for (const [name, size] of units) {
        if (ms >= size) {
            const n = Math.floor(ms / size);
            return `${n} ${name}${n === 1 ? '' : 's'}`;
        }
    }
    return 'moments';
}

/** A signed delay in minutes, e.g. "+15.7 min", "on time", "-3.0 min". */
export function formatDelayMinutes(value, { placeholder = 'Not available' } = {}) {
    const n = finite(value);
    if (n === null) return placeholder;
    if (Math.abs(n) < 0.05) return 'on time';
    return `${n > 0 ? '+' : '-'}${Math.abs(n).toFixed(1)} min`;
}

/** A duration in minutes as "2 h 56 min" / "47 min". Negative clamps to 0. */
export function formatDuration(minutes, { placeholder = 'Not available' } = {}) {
    const n = finite(minutes);
    if (n === null) return placeholder;
    const total = Math.max(0, Math.round(n));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) return `${m} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatNumber(value, digits = 1, { placeholder = 'Not available' } = {}) {
    const n = finite(value);
    return n === null ? placeholder : n.toFixed(digits);
}

/** A 0..1 fraction as a percentage. Does not invent precision. */
export function formatPercent(value, digits = 0, { placeholder = 'Not available' } = {}) {
    const n = finite(value);
    return n === null ? placeholder : `${(n * 100).toFixed(digits)}%`;
}

/** Trim display whitespace only. Source defects stay visible, never corrected. */
export function cleanLabel(value, { placeholder = 'Unknown' } = {}) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text || placeholder;
}

/* ------------------------------------------------------------------ motion */

/** True when the viewer has asked for reduced motion. Safe outside a browser. */
export function prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Count a number up, but never at the cost of showing it.
 *
 * The final text is written synchronously first, so if rAF never fires, if
 * motion is reduced, or if this throws, the correct value is already on screen.
 * Animation runs only on the first paint of an element or when the value really
 * changed, so a 30s poll that returns identical numbers animates nothing.
 *
 * @returns {boolean} whether an animation was actually started
 */
export function countUp(element, value, { format = (n) => formatNumber(n, 1), durationMs = 420 } = {}) {
    if (!element) return false;
    const target = finite(value);
    if (target === null) {
        element.textContent = format(value);
        delete element.dataset.countUpValue;
        return false;
    }

    const previousRaw = element.dataset.countUpValue;
    const previous = previousRaw === undefined ? null : Number(previousRaw);

    // Show the real number immediately, before any animation decision.
    element.textContent = format(target);
    element.dataset.countUpValue = String(target);

    const unchanged = previous !== null && Math.abs(previous - target) < 1e-9;
    if (unchanged || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
        return false;
    }

    const from = previous === null ? 0 : previous;
    const started = performance.now();
    const step = (now) => {
        // A newer countUp on the same element wins; abandon this run.
        if (element.dataset.countUpValue !== String(target)) return;
        const t = Math.min(1, (now - started) / durationMs);
        const eased = 1 - (1 - t) ** 3;
        element.textContent = format(from + (target - from) * eased);
        if (t < 1) requestAnimationFrame(step);
        else element.textContent = format(target);
    };
    requestAnimationFrame(step);
    return true;
}
