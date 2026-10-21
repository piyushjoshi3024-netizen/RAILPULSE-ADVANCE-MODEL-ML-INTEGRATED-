import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * "N trains not shown: no coordinate is recorded."
 *
 * The note was already here and stays, because it is the honest alternative
 * to putting those trains at a guessed point. UI-3 makes it answer the
 * obvious next question -- *which* trains, and where are they -- by opening
 * into the list, with the station each one is at, since that station name is
 * precisely what has no coordinate.
 */
function UnmappedTrains({ trains }) {
    const [open, setOpen] = useState(false);

    if (!trains || trains.length === 0) return null;

    const stations = [...new Set(trains.map((train) => train.currentStation))].filter(Boolean);

    return (
        <div className="border-t border-slate-200 pt-2">
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                aria-expanded={open}
                className="rp-press flex w-full items-start gap-1.5 rounded text-left text-xs text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
                <ChevronDown
                    size={13}
                    className={`mt-0.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden="true"
                />

                <span>
                    <strong className="font-semibold">
                        {trains.length} train{trains.length === 1 ? "" : "s"} not shown
                    </strong>
                    : no coordinate is recorded for the station
                    {trains.length === 1 ? " it is" : "s they are"} at.
                </span>
            </button>

            {open ? (
                <ul className="mt-2 max-h-40 list-none space-y-1 overflow-auto p-0 text-xs">
                    {trains.map((train) => (
                        <li key={train.number} className="flex justify-between gap-2">
                            <span className="min-w-0 truncate text-slate-800">
                                <span className="font-semibold">{train.number}</span> · {train.name}
                            </span>

                            <span className="shrink-0 text-slate-600">
                                {train.currentStation || "No station"}
                            </span>
                        </li>
                    ))}

                    <li className="border-t border-slate-200 pt-1.5 text-slate-600">
                        {stations.length} station{stations.length === 1 ? "" : "s"} with no
                        coordinate: {stations.join(", ")}.
                    </li>
                </ul>
            ) : null}
        </div>
    );
}

export default UnmappedTrains;
