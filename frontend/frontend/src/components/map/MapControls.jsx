import { useEffect, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { Crosshair, Maximize2, Minimize2, Search, X } from "lucide-react";

import { CORRIDOR_STATUS, TRAIN_STATUS } from "./mapStyle";

/**
 * Fit the map to everything it is drawing.
 *
 * Mounted inside `MapContainer` so it can reach the map instance. `fitKey`
 * changing is the signal to re-fit; the bounds are built from the real
 * points, so an empty network simply does not move the view rather than
 * zooming to a default somewhere in the sea.
 */
export function FitToNetwork({ points, fitKey, padding = 0.18 }) {
    const map = useMap();

    useEffect(() => {
        if (!points || points.length === 0) return;

        const bounds = L.latLngBounds(points);
        if (!bounds.isValid()) return;

        map.fitBounds(bounds.pad(padding), { animate: true, duration: 0.6 });
    }, [map, fitKey, points, padding]);

    return null;
}

/** Centres the map on one train when it is picked from the search box. */
export function FlyToTrain({ position, flyKey }) {
    const map = useMap();

    useEffect(() => {
        if (!position) return;
        map.flyTo(position, Math.max(map.getZoom(), 6), { duration: 0.8 });
    }, [map, flyKey, position]);

    return null;
}

/**
 * The legend.
 *
 * Every band prints the delay range it stands for, so the colour is a
 * shorthand for a number the user can also read, not a code they have to
 * learn.
 */
export function Legend({ corridorCounts = {} }) {
    const bands = [TRAIN_STATUS.ON_TIME, TRAIN_STATUS.DELAYED, TRAIN_STATUS.CRITICAL];

    return (
        <div className="space-y-1.5 text-xs">
            <p className="font-semibold text-slate-800">Trains</p>

            {bands.map((band) => (
                <p key={band.key} className="flex items-center gap-2 text-slate-700">
                    <span
                        className="h-3 w-3 shrink-0 rounded-full border-2 border-white shadow"
                        style={{ background: band.color }}
                        aria-hidden="true"
                    />
                    {band.legend}
                </p>
            ))}

            <p className="pt-1.5 font-semibold text-slate-800">Corridors</p>

            {Object.values(CORRIDOR_STATUS).map((status) => (
                <p key={status.key} className="flex items-center gap-2 text-slate-700">
                    <span
                        className="h-[3px] w-4 shrink-0 rounded"
                        style={{ background: status.color }}
                        aria-hidden="true"
                    />
                    {status.label}
                    {corridorCounts[status.key] ? ` (${corridorCounts[status.key]})` : ""}
                </p>
            ))}

            <p className="flex items-center gap-2 pt-1.5 text-slate-700">
                <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-slate-700 bg-white"
                    aria-hidden="true"
                />
                Station
            </p>
        </div>
    );
}

/** Status filter, as real buttons with counts rather than colour swatches. */
export function StatusFilter({ value, onChange, counts }) {
    const options = [
        { key: "ALL", label: "All", color: "#475569" },
        { key: TRAIN_STATUS.ON_TIME.key, label: "On time", color: TRAIN_STATUS.ON_TIME.color },
        { key: TRAIN_STATUS.DELAYED.key, label: "Delayed", color: TRAIN_STATUS.DELAYED.color },
        { key: TRAIN_STATUS.CRITICAL.key, label: "Critical", color: TRAIN_STATUS.CRITICAL.color },
    ];

    return (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter trains by status">
            {options.map((option) => {
                const active = value === option.key;
                const count = counts[option.key] ?? 0;

                return (
                    <button
                        key={option.key}
                        type="button"
                        onClick={() => onChange(option.key)}
                        aria-pressed={active}
                        className={`rp-press inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${active
                            ? "border-slate-800 bg-slate-800 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                            }`}
                    >
                        <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: active ? "#ffffff" : option.color }}
                            aria-hidden="true"
                        />
                        {option.label}
                        <span className={active ? "text-white/80" : "text-slate-500"}>{count}</span>
                    </button>
                );
            })}
        </div>
    );
}

/** Search by train number or name. Matches only trains the map can draw. */
export function TrainSearch({ value, onChange, matches, onPick }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            <label htmlFor="map-train-search" className="sr-only">
                Search for a train by number or name
            </label>

            <div className="relative">
                <Search
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                />

                <input
                    id="map-train-search"
                    type="search"
                    value={value}
                    onChange={(event) => {
                        onChange(event.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    placeholder="Train number"
                    autoComplete="off"
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />

                {value ? (
                    <button
                        type="button"
                        onClick={() => {
                            onChange("");
                            setOpen(false);
                        }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                        aria-label="Clear search"
                    >
                        <X size={13} />
                    </button>
                ) : null}
            </div>

            {open && value ? (
                <div className="absolute left-0 right-0 top-full z-[1200] mt-1 max-h-44 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {matches.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-600">
                            No train on the map matches that.
                        </p>
                    ) : (
                        matches.map((train) => (
                            <button
                                key={train.number}
                                type="button"
                                onClick={() => {
                                    onPick(train.number);
                                    setOpen(false);
                                }}
                                className="block w-full px-3 py-1.5 text-left text-xs text-slate-800 hover:bg-orange-50 focus-visible:outline-none focus-visible:bg-orange-50"
                            >
                                <span className="font-semibold">{train.number}</span> · {train.name}
                            </button>
                        ))
                    )}
                </div>
            ) : null}
        </div>
    );
}

/** Fit-to-network and fullscreen, as a pair of icon buttons. */
export function MapButtons({ onFit, isFullscreen, onToggleFullscreen }) {
    return (
        <div className="flex gap-1.5">
            <button
                type="button"
                onClick={onFit}
                className="rp-press rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 shadow-sm hover:border-orange-400 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                aria-label="Fit the map to the whole network"
                title="Fit to network"
            >
                <Crosshair size={15} />
            </button>

            <button
                type="button"
                onClick={onToggleFullscreen}
                className="rp-press rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 shadow-sm hover:border-orange-400 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                aria-label={isFullscreen ? "Leave fullscreen" : "Show the map fullscreen"}
                aria-pressed={isFullscreen}
                title={isFullscreen ? "Leave fullscreen" : "Fullscreen"}
            >
                {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
        </div>
    );
}
