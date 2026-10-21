/**
 * What each status means, in colour.
 *
 * Split from `Badge.jsx` so that file exports only a component: a module
 * exporting both a component and a constant trips
 * `react-refresh/only-export-components`, and this branch holds itself to
 * the lint count it started with.
 */

export const TONES = {
    positive: { chip: "bg-green-100 text-green-800", dot: "bg-green-600" },
    warning: { chip: "bg-amber-100 text-amber-800", dot: "bg-amber-600" },
    critical: { chip: "bg-red-100 text-red-800", dot: "bg-red-600" },
    info: { chip: "bg-orange-100 text-orange-800", dot: "bg-orange-600" },
    neutral: { chip: "bg-slate-200 text-slate-700", dot: "bg-slate-600" },
};

/**
 * Every status string this product puts in a badge, mapped to a tone.
 *
 * Keys are matched case-insensitively with spaces and hyphens normalised to
 * underscores, so "AT STATION", "at-station" and "AT_STATION" all land here.
 */
export const STATUS_TONES = {
    // Train
    RUNNING: "positive",
    ON_TIME: "positive",
    AT_STATION: "info",
    DELAYED: "critical",
    CANCELLED: "neutral",
    COMPLETED: "neutral",

    // Alert and incident severity
    CRITICAL: "critical",
    HIGH: "info",
    MEDIUM: "warning",
    LOW: "neutral",

    // Alert lifecycle
    ACTIVE: "critical",
    ACKNOWLEDGED: "warning",
    RESOLVED: "positive",

    // Risk, as the ML service reports it
    SEVERE: "critical",
    MODERATE: "warning",
    MINOR: "warning",
    NONE: "positive",

    // Simulation and journey
    SUCCESS: "positive",
    FAILED: "critical",
    PENDING: "warning",
};

/** Normalise "At Station" / "at-station" / "AT_STATION" to one key. */
export const statusKey = (value) =>
    String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

/** The tone a status maps to, for callers that need the colour elsewhere. */
export const toneFor = (status) => TONES[STATUS_TONES[statusKey(status)] || "neutral"];
