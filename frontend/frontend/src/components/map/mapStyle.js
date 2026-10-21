import L from "leaflet";

/**
 * One source of truth for what the map's colours mean.
 *
 * Dashboard.jsx and NetworkMap.jsx each had their own `createTrainIcon`,
 * and they disagreed: the Dashboard's took a `selected` flag and drew a
 * larger ring, NetworkMap's did not. Both reduced every train to two
 * colours, green or red, from `delayMinutes > 0`.
 *
 * The three bands below are a *display* grouping of one real number --
 * `delayMinutes` from the train's latest event. The threshold is stated
 * here and repeated in the legend and in every popup, which also print the
 * exact figure, so the band never stands in for the number.
 */

/** A delay at or above this many minutes is shown as critical. */
export const CRITICAL_DELAY_MINUTES = 30;

export const TRAIN_STATUS = {
    ON_TIME: {
        key: "ON_TIME",
        label: "On time",
        legend: "On time (0 min)",
        color: "#16a34a",
        chipBg: "#dcfce7",
        chipText: "#15803d",
    },
    DELAYED: {
        key: "DELAYED",
        label: "Delayed",
        legend: `Delayed (1-${CRITICAL_DELAY_MINUTES - 1} min)`,
        color: "#f59e0b",
        chipBg: "#fef3c7",
        chipText: "#b45309",
    },
    CRITICAL: {
        key: "CRITICAL",
        label: "Critical",
        legend: `Critical (${CRITICAL_DELAY_MINUTES}+ min)`,
        color: "#dc2626",
        chipBg: "#fee2e2",
        chipText: "#b91c1c",
    },
};

/** The band for a delay in minutes. Anything non-numeric reads as on time. */
export function trainStatusFor(delayMinutes) {
    const delay = typeof delayMinutes === "number" ? delayMinutes : 0;

    if (delay >= CRITICAL_DELAY_MINUTES) return TRAIN_STATUS.CRITICAL;
    if (delay > 0) return TRAIN_STATUS.DELAYED;

    return TRAIN_STATUS.ON_TIME;
}

/**
 * Corridor condition, derived from the trains standing on it.
 *
 * There is no corridor status in the data: `Corridor` holds
 * `{ corridorId, name, stations, dataSource }` and nothing else. Rather
 * than invent a field, this reads the delays of the trains whose current
 * station is on the corridor, and the popup says in words that that is what
 * it did and how many trains it counted. A corridor with no train on it is
 * reported as having no data, not as clear.
 */
export const CORRIDOR_STATUS = {
    NO_DATA: { key: "NO_DATA", label: "No train on this corridor", color: "#fb923c" },
    CLEAR: { key: "CLEAR", label: "All trains on time", color: "#16a34a" },
    DELAYED: { key: "DELAYED", label: "Delays reported", color: "#f59e0b" },
    CRITICAL: { key: "CRITICAL", label: "Severe delays", color: "#dc2626" },
};

export function corridorStatusFor(trainsOnCorridor) {
    if (!trainsOnCorridor || trainsOnCorridor.length === 0) {
        return CORRIDOR_STATUS.NO_DATA;
    }

    const worst = trainsOnCorridor.reduce(
        (highest, train) => Math.max(highest, train.delay || 0),
        0
    );

    if (worst >= CRITICAL_DELAY_MINUTES) return CORRIDOR_STATUS.CRITICAL;
    if (worst > 0) return CORRIDOR_STATUS.DELAYED;

    return CORRIDOR_STATUS.CLEAR;
}

/**
 * A train marker.
 *
 * `selected` draws a ring rather than changing the fill, so the status
 * colour still reads at a glance when a train is picked.
 */
export function createTrainIcon(status, selected = false) {
    const size = selected ? 24 : 18;
    const ring = selected ? "box-shadow: 0 0 0 4px rgba(249,115,22,0.45), 0 1px 6px rgba(0,0,0,0.45);" : "box-shadow: 0 1px 6px rgba(0,0,0,0.45);";

    return L.divIcon({
        className: "train-marker",
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${status.color};border:3px solid white;${ring}"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

/**
 * A station marker that carries its own name.
 *
 * The brief asks for labelled stations. A Leaflet `Tooltip` only appears on
 * hover, which is nothing on a touch screen, so the label is part of the
 * icon. `pointer-events:none` on the text keeps the label from swallowing a
 * tap meant for the dot or for a train sitting on top of it.
 */
export function createStationIcon(name, hasTrains = false) {
    const dot = hasTrains ? "#0f172a" : "#334155";

    return L.divIcon({
        className: "station-marker",
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;">
            <span style="width:11px;height:11px;border-radius:50%;background:#ffffff;border:3px solid ${dot};box-shadow:0 1px 3px rgba(0,0,0,0.3);"></span>
            <span style="margin-top:2px;padding:1px 5px;border-radius:4px;background:rgba(255,255,255,0.92);color:#0f172a;font-size:10px;font-weight:600;white-space:nowrap;line-height:1.3;box-shadow:0 1px 2px rgba(0,0,0,0.18);pointer-events:none;">${name}</span>
          </div>
        `,
        iconSize: [11, 11],
        iconAnchor: [5.5, 5.5],
    });
}
