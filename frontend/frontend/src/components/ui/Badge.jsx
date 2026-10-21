/**
 * One status badge for the whole product.
 *
 * Phase UI-1 found four separate `StatusBadge` components (Alerts, Trains,
 * ETAPrediction, JourneyManagement) and two severity maps (Alerts,
 * CommandCenter) holding the same colour strings, drifting apart: one used
 * `text-xs`, another `text-[10px]`, one added a dot, one a border.
 *
 * Two rules this enforces that the old copies did not:
 *
 *  1. **The label is always there.** Colour is never the only carrier of
 *     meaning, so a red/green distinction survives a monochrome print, a
 *     colour-blind reader and a bad projector.
 *  2. **An unknown value shows itself.** The old maps did
 *     `styles[status]` with no fallback, so a status the API added later
 *     rendered as an unstyled word or an empty chip. Here it renders in the
 *     neutral tone with its own text, which is a visible prompt to add it.
 */

import { STATUS_TONES, TONES, statusKey } from "./badgeTones";

const SIZES = {
    sm: "px-2 py-0.5 text-[11px] gap-1.5",
    md: "px-2.5 py-1 text-xs gap-2",
    lg: "px-3 py-1.5 text-xs gap-2",
};

function Badge({
    status,
    children,
    tone = null,
    size = "md",
    dot = true,
    className = "",
}) {
    const key = statusKey(status);
    const resolved = TONES[tone] || TONES[STATUS_TONES[key] || "neutral"];

    // "AT_STATION" is a database value, not a sentence. The badge prints it
    // the way a person reads it.
    const label = children ?? (key ? key.replace(/_/g, " ") : "UNKNOWN");

    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-full font-semibold ${resolved.chip} ${SIZES[size] || SIZES.md} ${className}`}
        >
            {dot ? (
                <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${resolved.dot}`}
                    aria-hidden="true"
                />
            ) : null}

            {label}
        </span>
    );
}

export default Badge;
