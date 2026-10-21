import { Marker, Popup } from "react-leaflet";

import { createStationIcon, trainStatusFor } from "./mapStyle";

/**
 * One station, labelled on the map, listing the trains standing at it.
 *
 * "Currently there" means the trains whose latest event names this station.
 * It is the same join the markers use, so the popup cannot disagree with
 * what is drawn on top of the dot.
 */
function StationMarker({ station, trains = [], onSelectTrain = null }) {
    return (
        <Marker
            position={[station.lat, station.lng]}
            icon={createStationIcon(station.name, trains.length > 0)}
        >
            <Popup>
                <div className="min-w-[210px]">
                    <h3 className="font-bold text-slate-900">{station.name}</h3>

                    <p className="text-xs text-slate-600">
                        Station code {station.code}
                    </p>

                    <div className="mt-3 border-t border-slate-200 pt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                            {trains.length === 0
                                ? "No train here"
                                : `${trains.length} ${trains.length === 1 ? "train" : "trains"} here`}
                        </p>

                        {trains.length === 0 ? (
                            <p className="mt-1 text-sm text-slate-600">
                                No train's latest event reports this station.
                            </p>
                        ) : (
                            <ul className="mt-2 list-none space-y-1 p-0">
                                {trains.map((train) => {
                                    const status = trainStatusFor(train.delay);

                                    return (
                                        <li key={train.number}>
                                            <button
                                                type="button"
                                                onClick={() => onSelectTrain?.(train.number)}
                                                disabled={!onSelectTrain}
                                                className="flex w-full items-center gap-2 rounded-md border-0 bg-transparent p-1 text-left text-sm hover:bg-slate-100 disabled:hover:bg-transparent"
                                            >
                                                <span
                                                    className="h-2 w-2 shrink-0 rounded-full"
                                                    style={{ background: status.color }}
                                                    aria-hidden="true"
                                                />

                                                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                                                    {train.number} · {train.name}
                                                </span>

                                                <span
                                                    className="shrink-0 text-xs font-semibold"
                                                    style={{ color: status.chipText }}
                                                >
                                                    {train.delay > 0 ? `+${train.delay}m` : "On time"}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </Popup>
        </Marker>
    );
}

export default StationMarker;
