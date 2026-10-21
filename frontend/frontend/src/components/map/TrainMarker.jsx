import { Link } from "react-router-dom";
import { Marker, Popup, Tooltip } from "react-leaflet";

import { createTrainIcon, trainStatusFor } from "./mapStyle";
import { useSmoothPosition } from "./useSmoothPosition";

/**
 * One train, at the station its latest event reports.
 *
 * Everything in the popup is a field the API returned. There is no
 * estimated position, no interpolated "between stations" reading, and no
 * speed figure invented to fill the row -- where the event carries no
 * speed, the row says so.
 */
function TrainMarker({ train, selected = false, onSelect = null }) {
    const status = trainStatusFor(train.delay);
    const position = useSmoothPosition(train.position);

    if (!position) return null;

    return (
        <Marker
            position={position}
            icon={createTrainIcon(status, selected)}
            eventHandlers={onSelect ? { click: () => onSelect(train.number) } : undefined}
            // Selected train draws above the rest, so picking one out of a
            // cluster does not hide it behind its neighbours.
            zIndexOffset={selected ? 1000 : 0}
        >
            <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                <strong>{train.number}</strong> · {train.name}
            </Tooltip>

            <Popup>
                <div className="min-w-[228px]">

                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="font-bold text-slate-900">{train.name}</h3>
                            <p className="text-xs text-slate-600">Train {train.number}</p>
                        </div>

                        <span
                            className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold"
                            style={{ background: status.chipBg, color: status.chipText }}
                        >
                            {status.label}
                        </span>
                    </div>

                    <dl className="mt-3 space-y-1 text-sm text-slate-700">
                        <Row label="Delay">
                            <span
                                className="font-semibold"
                                style={{ color: train.delay > 0 ? status.chipText : "#15803d" }}
                            >
                                {train.delay > 0 ? `${train.delay} min late` : "On time"}
                            </span>
                        </Row>

                        <Row label="At">{train.currentStation || "Not recorded"}</Row>

                        {train.destination ? (
                            <Row label="To">{train.destination}</Row>
                        ) : null}

                        {train.type && train.type !== "UNKNOWN" ? (
                            <Row label="Type">{train.type}</Row>
                        ) : null}

                        {/* Printed only when the event carried one. A train
                            standing at a station reports 0, which is a real
                            reading; a missing field is not. */}
                        <Row label="Speed">
                            {typeof train.speed === "number" ? `${train.speed} km/h` : "Not recorded"}
                        </Row>
                    </dl>

                    <Link
                        to={`/eta?train=${encodeURIComponent(train.number)}`}
                        className="rp-press mt-4 inline-flex w-full items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
                    >
                        View ETA
                    </Link>

                </div>
            </Popup>
        </Marker>
    );
}

function Row({ label, children }) {
    return (
        <div className="flex justify-between gap-3">
            <dt className="text-slate-600">{label}</dt>
            <dd className="m-0 text-right font-medium">{children}</dd>
        </div>
    );
}

export default TrainMarker;
