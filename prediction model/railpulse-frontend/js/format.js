/**
 * Formatting, time and motion helpers shared by every RailPulse surface.
 *
 * Timezone policy
 * ---------------
 * Display zone is Asia/Kolkata ("IST"), because this is Indian railway data.
 *
 * Getting there is not uniform, because the backend's datetimes do not all mean
 * the same thing. Two kinds exist and they must be read differently:
 *
 *   WALL_CLOCK  The digits are an Indian local wall-clock reading. They are
 *               rendered as IST unchanged. `scheduled_arrival` is the CSV's
 *               Sc_arr__time (for example 06:00:00) carried straight through.
 *
 *   INSTANT     A genuine point in time. Converted to IST for display. The
 *               backend writes these with datetime.now(timezone.utc) and Mongo
 *               hands them back naive, so a naive INSTANT is read as UTC.
 *
 * `predicted_eta`, `eta_lower` and `eta_upper` arrive with a "Z" but are
 * WALL_CLOCK, not INSTANT. The Z is synthetic: app/ml/predictor.py:141 anchors
 * on `scheduled_arrival or current_timestamp` and line 147 stamps UTC onto a
 * naive value with `replace(tzinfo=utc)`, so the ETA inherits the anchor's
 * wall-clock digits and a timezone it never had. Measured against this repo's
 * running backend:
 *
 *     scheduled_arrival        2026-10-21T06:00:00          (naive)
 *     predicted_eta            2026-10-21T06:06:55.306953Z  (Z is synthetic)
 *     difference               6.921782550 min
 *     predicted_delay_minutes  6.921782546 min  -> the same number
 *
 * Converting that Z as if it were a real offset would print an arrival 5h30m
 * later than its own schedule: 06:00 IST scheduled against 11:36 IST predicted,
 * a 337-minute delay the model never produced. So the ETA family is read as
 * wall-clock, which keeps it consistent with the schedule it was derived from.
 *
 * Conversely, treating a naive INSTANT as Indian local would push a
 * just-written `current_timestamp` 5h30m into the future and invert the
 * staleness logic, so those are read as UTC and then converted.
 *
 * Durations -- predicted_delay_minutes, the p10/p50/p90 quantiles,
 * predicted_remaining_minutes -- carry no zone and are unaffected by any of this.
 *
 * The underlying synthetic CSV holds bare wall-clock times with no zone recorded;
 * reading them as Indian local is an assumption about the data's origin, not a
 * fact the file states. See TIME_NOTICE, which puts that on screen.
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
    timeZone: 'Asia/Kolkata',
    label: 'IST',
});

/**
 * India has observed UTC+05:30 with no daylight saving since 1945, so a fixed
 * offset is safe for turning wall-clock digits into an instant. Rendering still
 * goes through Intl with the real zone id, so a future rule change would be
 * picked up for display even if this constant stayed put.
 */
export const IST_OFFSET_MINUTES = 330;

/** How a backend datetime field should be read. See the policy note above. */
export const WALL_CLOCK = 'wall_clock';
export const INSTANT = 'instant';

/**
 * Per-field reading, keyed by the name the API uses. Both the FastAPI snake_case
 * names and the Node camelCase mirrors are listed, because both reach the UI.
 *
 * Anything absent defaults to INSTANT, which is the safe choice: a true instant
 * rendered in IST is correct, whereas wrongly treating an instant as wall-clock
 * silently shifts it by 5h30m.
 */
export const FIELD_TIME_KIND = Object.freeze({
    // Indian wall-clock, straight from the dataset's Sc_arr__time.
    scheduled_arrival: WALL_CLOCK,
    scheduledEta: WALL_CLOCK,
    // Derived from the anchor above, so the same frame despite the "Z".
    predicted_eta: WALL_CLOCK,
    predictedEta: WALL_CLOCK,
    eta_lower: WALL_CLOCK,
    eta_upper: WALL_CLOCK,
    // Genuine instants written with datetime.now(timezone.utc).
    current_timestamp: INSTANT,
    updated_at: INSTANT,
    timestamp: INSTANT,
    trained_at: INSTANT,
    predictionTimestamp: INSTANT,
    retrieved_at: INSTANT,
});

/** The reading for a field name, defaulting to INSTANT. */
export function timeKindFor(fieldName) {
    return FIELD_TIME_KIND[fieldName] || INSTANT;
}

export const TIME_NOTICE =
    'Times are shown in India Standard Time (IST, UTC+5:30). Scheduled and predicted '
    + 'arrival times are wall-clock readings carried through from the synthetic dataset, '
    + 'which records no timezone; reading them as Indian local time is an assumption about '
    + 'their origin. Timestamps the backend generated are true UTC instants and are converted.';

/** Anything older than this is presented as stale, with the age stated. */
export const STALE_AFTER_MS = 10 * 60 * 1000;

const ISO_WITH_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const ISO_PARTS = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,6}))?/;

/**
 * Parse an API datetime according to how that field should be read.
 *
 * @param {string|Date} value
 * @param {string} [kind] WALL_CLOCK or INSTANT (default)
 * @returns {{date: Date|null, naive: boolean, kind: string}}
 *   `naive` reports whether the backend stated a zone at all, so a caller can
 *   disclose that the zone was assumed rather than given.
 */
export function parseInstant(value, kind = INSTANT) {
    if (value instanceof Date) {
        const ok = !Number.isNaN(value.getTime());
        return { date: ok ? value : null, naive: false, kind };
    }
    if (typeof value !== 'string' || !value.trim()) return { date: null, naive: false, kind };
    const raw = value.trim();
    const naive = !ISO_WITH_ZONE.test(raw);

    if (kind === WALL_CLOCK) {
        // Read the digits only; any offset present is discarded on purpose,
        // because for these fields it is a label the backend invented.
        const matched = ISO_PARTS.exec(raw);
        if (!matched) return { date: null, naive, kind };
        const [, y, mo, d, h, mi, sec, frac] = matched;
        const ms = Date.UTC(
            Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi),
            Number(sec || 0), Number((frac || '0').padEnd(3, '0').slice(0, 3)),
        ) - IST_OFFSET_MINUTES * 60 * 1000;
        const date = new Date(ms);
        return { date: Number.isNaN(date.getTime()) ? null : date, naive, kind };
    }

    // INSTANT: a naive value is UTC, because that is what the backend wrote.
    const date = new Date(naive ? `${raw}Z` : raw);
    return { date: Number.isNaN(date.getTime()) ? null : date, naive, kind };
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

/** "21 Oct 2026, 06:00 IST", or the placeholder when there is no value. */
export function formatInstant(value, { placeholder = 'Not available', kind = INSTANT } = {}) {
    const { date } = parseInstant(value, kind);
    if (!date) return placeholder;
    const p = parts(date);
    return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${DISPLAY_ZONE.label}`;
}

/** "06:00 IST" -- for dense surfaces where the date is already established. */
export function formatClock(value, { placeholder = '--:--', kind = INSTANT } = {}) {
    const { date } = parseInstant(value, kind);
    if (!date) return placeholder;
    const p = parts(date);
    return `${p.hour}:${p.minute} ${DISPLAY_ZONE.label}`;
}

/** "21 Oct 2026" */
export function formatDay(value, { placeholder = 'Not available', kind = INSTANT } = {}) {
    const { date } = parseInstant(value, kind);
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
    // Always INSTANT: an age is only meaningful against a real point in time.
    const { date } = parseInstant(value, INSTANT);
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
