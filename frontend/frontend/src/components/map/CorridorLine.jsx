import { Polyline, Popup } from "react-leaflet";

import { corridorStatusFor, trainStatusFor } from "./mapStyle";

/**
 * One corridor, coloured by the trains standing on it.
 *
 * The `Corridor` record holds `{ corridorId, name, stations, dataSource }`
 * -- there is no status field in the data. Rather than invent one, the
 * colour is derived from the delays of the trains whose current station is
 * on this corridor, and the popup says exactly that, names the trains, and
 * prints their delays. A corridor with no train on it is reported as having
 * no data rather than as running clear.
 *
 * `missing` is the station codes the corridor names that the station list
 * has no coordinate for. The line is drawn through the points that do
 * resolve, and the popup says which ones were dropped, so a shortened route
 * is never passed off as the whole one.
 */
function CorridorLine({ corridor, trains = [] }) {
    const status = corridorStatusFor(trains);

    return (
        <Polyline
            positions={corridor.positions}
            pathOptions={{
                color: status.color,
                weight: 4,
                opacity: 0.8,
                lineCap: "round",
                lineJoin: "round",
            }}
        >
            <Popup>
                <div className="min-w-[228px]">
                    <h3 className="font-bold text-slate-900">{corridor.name}</h3>

                    <p className="text-xs text-slate-600">
                        {corridor.stations?.length || corridor.positions.length} stations
                    </p>

                    <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: status.color }}
                            aria-hidden="true"
                        />
                        {status.label}
                    </p>

                    <p className="mt-1 text-xs text-slate-600">
                        {trains.length === 0
                            ? "No train's latest event places it on this corridor, so there is nothing to judge it by."
                            : `Derived from ${trains.length} ${trains.length === 1 ? "train" : "trains"} currently on it.`}
                    </p>

                    {trains.length > 0 ? (
                        <ul className="mt-2 list-none space-y-1 border-t border-slate-200 p-0 pt-2">
                            {trains.map((train) => {
                                const trainStatus = trainStatusFor(train.delay);

                                return (
                                    <li
                                        key={train.number}
                                        className="flex items-center justify-between gap-2 text-sm"
                                    >
                                        <span className="min-w-0 truncate text-slate-800">
                                            {train.number} · {train.name}
                                        </span>

                                        <span
                                            className="shrink-0 font-semibold"
                                            style={{ color: trainStatus.chipText }}
                                        >
                                            {train.delay > 0 ? `+${train.delay}m` : "On time"}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : null}

                    {corridor.missing?.length > 0 ? (
                        <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-amber-700">
                            Drawn without {corridor.missing.join(", ")}: no coordinate is
                            recorded for {corridor.missing.length === 1 ? "that station" : "those stations"}.
                        </p>
                    ) : null}
                </div>
            </Popup>
        </Polyline>
    );
}

export default CorridorLine;
