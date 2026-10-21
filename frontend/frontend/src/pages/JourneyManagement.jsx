import { useMemo, useState } from "react";
import { ArrowRight, Search, TrainFront } from "lucide-react";

import { planJourney } from "../services/journeyService";
import { useTrains } from "../hooks/useTrains";

import Button from "../components/ui/Button";
import PageHeader from "../components/ui/PageHeader";
import CountUp from "../components/ui/CountUp";
import Reveal from "../components/ui/Reveal";
import { useFirstReveal } from "../components/ui/useFirstReveal";
import { useToast } from "../components/ui/toastContext";
import EmptyState from "../components/state/EmptyState";
import ErrorState from "../components/state/ErrorState";
import { SkeletonCard } from "../components/ui/Skeleton";

/**
 * Journey Management.
 *
 * What was wrong here, and why "No journey found" came back for everything:
 *
 * The two station dropdowns held six names typed into the file by hand --
 * New Delhi, Mumbai Central, Agra, Jaipur, Kota, Bhopal -- left over from a
 * demo array that used to sit at the top of this module. The API matches a
 * journey by walking each train's `route` and requiring the origin to come
 * before the destination in it. Of those six hardcoded names, exactly one
 * (New Delhi) appears in any real train route, and it is the *destination*
 * of six trains and the origin of one. So every pair the user could pick
 * except one returned 404, and the page rendered its "No journey found"
 * panel. The data was never missing; the dropdown was asking for stations
 * that do not exist on this network.
 *
 * Both lists are now built from the train routes the API actually returns,
 * and the "To" list is narrowed to the stations reachable from the chosen
 * origin. A pair that returns nothing is no longer selectable, so the empty
 * state is reached only when the network genuinely changes under the user.
 *
 * The second bug was that a 404 and a dead API looked identical: the catch
 * block logged to the console and showed the same empty panel for both.
 * They are now told apart, and a real failure says so.
 */

/** Route stations, in sequence, for one train. */
const routeStations = (train) =>
    (train?.route || [])
        .slice()
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
        .map((item) => item.station)
        .filter(Boolean);

function JourneyManagement() {
    // One non-polling read. The dropdowns need the route graph, and the
    // search result needs each train's type, status and current station to
    // enrich an option -- the same answer serves both, so the handler no
    // longer fires its own second request for the train list.
    const {
        trains,
        loading: trainsLoading,
        error: trainsError,
        updatedAt,
        refetch,
    } = useTrains({ poll: false });

    const toast = useToast();

    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [options, setOptions] = useState([]);
    const [selectedNumber, setSelectedNumber] = useState(null);
    const [searching, setSearching] = useState(false);
    const [searchState, setSearchState] = useState("idle"); // idle | done | empty | failed
    const [failure, setFailure] = useState("");

    /**
     * Every ordered station pair this network can actually serve.
     *
     * Built the same way the API's filter is: for each train route, every
     * station can reach every station after it. Nothing is inferred across
     * trains -- there is no change-of-train logic in the API, so offering
     * one here would promise a journey the backend would then deny.
     */
    const reachable = useMemo(() => {
        const map = new Map();

        trains.forEach((train) => {
            const stations = routeStations(train);

            stations.forEach((origin, index) => {
                const onwards = stations.slice(index + 1);
                if (onwards.length === 0) return;

                const destinations = map.get(origin) || new Map();

                onwards.forEach((destination) => {
                    destinations.set(destination, (destinations.get(destination) || 0) + 1);
                });

                map.set(origin, destinations);
            });
        });

        return map;
    }, [trains]);

    const origins = useMemo(() => [...reachable.keys()].sort(), [reachable]);

    /**
     * The selects are *derived*, not seeded by an effect.
     *
     * `from` and `to` hold what the user picked, which is "" until the route
     * graph has loaded. Rather than writing a default into state once the
     * graph arrives -- an effect that sets state, and a render the user sees
     * with an empty select -- the rendered value falls back to the first
     * valid option. That also keeps the pair honest for free: the moment the
     * origin changes to one that cannot reach the current destination, the
     * destination falls back to one it can, so there is no window in which
     * the form holds a pair the API would 404 on.
     */
    const activeFrom = origins.includes(from) ? from : origins[0] || "";

    const destinations = useMemo(() => {
        const forOrigin = reachable.get(activeFrom);
        if (!forOrigin) return [];

        return [...forOrigin.entries()]
            .map(([station, trainCount]) => ({ station, trainCount }))
            .sort((a, b) => a.station.localeCompare(b.station));
    }, [reachable, activeFrom]);

    const activeTo = destinations.some((item) => item.station === to)
        ? to
        : destinations[0]?.station || "";

    const byNumber = useMemo(
        () => new Map(trains.map((train) => [train.trainNumber, train])),
        [trains]
    );

    const handleSearch = async () => {
        if (!activeFrom || !activeTo) return;

        setSearching(true);
        setFailure("");

        try {
            const response = await planJourney({
                source: activeFrom,
                destination: activeTo,
                date: new Date().toISOString(),
            });

            const returned = response.data?.options || [];

            // The API already returns type, status, departure, arrival,
            // distance, duration and the station slice. The only thing added
            // here is `currentStation`, which the timeline needs and the
            // journey endpoint does not send.
            const enriched = returned.map((option) => {
                const train = byNumber.get(option.trainNumber);

                return {
                    ...option,
                    stations: option.stations || [],
                    currentStation: train?.currentStation || null,
                    delay: option.currentDelay ?? 0,
                };
            });

            setOptions(enriched);
            setSelectedNumber(enriched[0]?.trainNumber ?? null);

            if (enriched.length === 0) {
                setSearchState("empty");
            } else {
                setSearchState("done");
                toast.success(
                    `${enriched.length} ${enriched.length === 1 ? "train" : "trains"} found`,
                    `${activeFrom} to ${activeTo}`
                );
            }
        } catch (error) {
            setOptions([]);
            setSelectedNumber(null);

            const status = error?.response?.status;
            const message = error?.response?.data?.message || "";

            // A 404 is the API saying "no train serves this pair" -- a real,
            // empty answer. Anything else is a failure, and saying "no
            // journey found" for a 500 or a dropped connection is how the
            // old version hid a broken API for weeks.
            if (status === 404) {
                setSearchState("empty");
            } else {
                setSearchState("failed");
                setFailure(message || "The journey service did not answer.");
                toast.error("Could not plan this journey", message || "The journey service did not answer.");
            }
        } finally {
            setSearching(false);
        }
    };

    const selected = useMemo(
        () => options.find((option) => option.trainNumber === selectedNumber) || null,
        [options, selectedNumber]
    );

    const optionsRevealed = useFirstReveal(options.length > 0);
    const timelineRevealed = useFirstReveal(Boolean(selected));

    return (
        <div className="space-y-8">

            <PageHeader
                title="Journey Management"
                subtitle="Plan and monitor train journeys across the railway network."
                updatedAt={updatedAt}
                onRefresh={refetch}
                refreshing={trainsLoading}
            />

            {/* SEARCH */}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

                <h2 className="text-lg font-semibold text-slate-900">Plan Journey</h2>

                <p className="mt-1 text-sm text-slate-600">
                    {trainsLoading
                        ? "Loading the station list..."
                        : origins.length > 0
                            ? `${origins.length} origin stations on this network. The destination list shows only stations a train actually reaches from the origin you pick.`
                            : "No train routes are available, so there is nothing to plan against."}
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-3">

                    {/* FROM */}

                    <div>
                        <label
                            htmlFor="journey-from"
                            className="mb-2 block text-sm font-medium text-slate-700"
                        >
                            From
                        </label>

                        <select
                            id="journey-from"
                            value={activeFrom}
                            onChange={(event) => setFrom(event.target.value)}
                            disabled={trainsLoading || origins.length === 0}
                            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-50 disabled:text-slate-500"
                        >
                            {origins.length === 0 ? (
                                <option value="">--</option>
                            ) : (
                                origins.map((station) => (
                                    <option key={station} value={station}>
                                        {station}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    {/* TO */}

                    <div>
                        <label
                            htmlFor="journey-to"
                            className="mb-2 block text-sm font-medium text-slate-700"
                        >
                            To
                        </label>

                        <select
                            id="journey-to"
                            value={activeTo}
                            onChange={(event) => setTo(event.target.value)}
                            disabled={trainsLoading || destinations.length === 0}
                            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-50 disabled:text-slate-500"
                        >
                            {destinations.length === 0 ? (
                                <option value="">No onward station</option>
                            ) : (
                                destinations.map(({ station, trainCount }) => (
                                    <option key={station} value={station}>
                                        {station} ({trainCount} {trainCount === 1 ? "train" : "trains"})
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    {/* BUTTON */}

                    <div className="flex items-end">
                        <Button
                            onClick={handleSearch}
                            loading={searching}
                            disabled={!activeFrom || !activeTo}
                            icon={Search}
                            size="lg"
                            fullWidth
                        >
                            {searching ? "Searching" : "Search Journey"}
                        </Button>
                    </div>

                </div>

                {activeFrom && activeTo ? (
                    <p className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                        <span className="font-semibold text-slate-900">{activeFrom}</span>
                        <ArrowRight size={15} className="text-slate-500" aria-hidden="true" />
                        <span className="font-semibold text-slate-900">{activeTo}</span>
                    </p>
                ) : null}

            </div>

            {/* The station list itself failed to load. Said plainly, with a
                retry, rather than shown as an empty journey result. */}
            {trainsError ? (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <ErrorState
                        message="Could not load the station list."
                        hint="The train routes are what the two dropdowns are built from, so planning is unavailable until this loads."
                        onRetry={refetch}
                        retrying={trainsLoading}
                    />
                </div>
            ) : null}

            {searching ? <SkeletonCard lines={4} /> : null}

            {/* A genuine failure of the journey service. */}
            {!searching && searchState === "failed" ? (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <ErrorState
                        message="Could not plan this journey."
                        hint={failure}
                        onRetry={handleSearch}
                    />
                </div>
            ) : null}

            {/* A real empty answer: the API was asked and said no train
                serves this pair. */}
            {!searching && searchState === "empty" ? (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <EmptyState
                        title="No train serves this pair"
                        hint={`Nothing runs from ${activeFrom} to ${activeTo} in that direction. The destination list is built from real routes, so this normally means the network changed since the page loaded.`}
                        icon="∅"
                        actionLabel="Reload station list"
                        onAction={refetch}
                    />
                </div>
            ) : null}

            {/* OPTIONS -- every train that serves the pair, not just the
                first. The old version stored the full list and then rendered
                only `options[0]`, so a second or third train was fetched and
                silently discarded. */}
            {!searching && options.length > 0 ? (
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                        {options.length} {options.length === 1 ? "train" : "trains"} on this route
                    </h2>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {options.map((option, index) => {
                            const isSelected = option.trainNumber === selectedNumber;

                            return (
                                <Reveal key={option.trainNumber} index={index} active={optionsRevealed}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedNumber(option.trainNumber)}
                                        aria-pressed={isSelected}
                                        className={`rp-press rp-lift h-full w-full rounded-2xl border bg-white p-5 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${isSelected
                                            ? "border-orange-500 ring-1 ring-orange-200"
                                            : "border-slate-200 hover:border-orange-300"
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="font-semibold leading-snug text-slate-900">
                                                    {option.trainName}
                                                </p>

                                                <p className="mt-0.5 text-xs font-medium text-slate-600">
                                                    #{option.trainNumber}
                                                    {option.type ? ` · ${option.type}` : ""}
                                                </p>
                                            </div>

                                            <StatusBadge status={option.status} delay={option.delay} />
                                        </div>

                                        <div className="mt-4 flex items-center justify-between gap-2 text-sm">
                                            <span className="font-medium text-slate-700">
                                                {option.departure || "--"}
                                            </span>

                                            <ArrowRight size={14} className="text-slate-500" aria-hidden="true" />

                                            <span className="font-medium text-slate-700">
                                                {option.arrival || "--"}
                                            </span>
                                        </div>

                                        <p className="mt-2 text-xs text-slate-600">
                                            {option.duration || "--"} · {option.distance ?? "--"} km
                                        </p>
                                    </button>
                                </Reveal>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {/* SELECTED JOURNEY */}

            {!searching && selected ? (
                <>
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">

                        <div className="flex flex-col gap-4 border-b border-slate-200 p-6 md:flex-row md:items-start md:justify-between">

                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-3">
                                    <h2 className="text-xl font-bold text-slate-900">
                                        {selected.trainName}
                                    </h2>

                                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                        #{selected.trainNumber}
                                    </span>

                                    {selected.type ? (
                                        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                            {selected.type}
                                        </span>
                                    ) : null}
                                </div>

                                <p className="mt-2 text-sm text-slate-600">
                                    {selected.source} → {selected.destination}
                                </p>
                            </div>

                            <StatusBadge status={selected.status} delay={selected.delay} />

                        </div>

                        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
                            <JourneyMetric label="Departure" value={selected.departure} />
                            <JourneyMetric label="Arrival" value={selected.arrival} />
                            <JourneyMetric label="Duration" value={selected.duration} />
                            <JourneyMetric
                                label="Distance"
                                value={
                                    typeof selected.distance === "number" ? (
                                        <>
                                            <CountUp value={selected.distance} /> km
                                        </>
                                    ) : null
                                }
                            />
                        </div>

                    </div>

                    <div className="grid gap-6 lg:grid-cols-3">

                        {/* TIMELINE */}

                        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">

                            <h2 className="text-lg font-semibold text-slate-900">Journey Timeline</h2>

                            <p className="mt-1 text-sm text-slate-600">
                                Stations along this journey, as recorded on the train's route.
                            </p>

                            <div className="mt-7">
                                {selected.stations.length === 0 ? (
                                    <EmptyState
                                        title="No stops are recorded"
                                        hint="This train's route has no station sequence stored, so there is nothing to lay out."
                                        icon="∅"
                                        className="py-8"
                                    />
                                ) : (
                                    selected.stations.map((station, index) => {
                                        const isFirst = index === 0;
                                        const isLast = index === selected.stations.length - 1;

                                        // The train's own `currentStation`, matched by name.
                                        // The version before UI-2 decided this with
                                        // `status === "DELAYED" ? station === "Surat" : index === 3`
                                        // -- a station name from the deleted demo array and
                                        // an arbitrary index. It drew a "Current location"
                                        // marker on a station the train was not at.
                                        const isCurrent =
                                            Boolean(selected.currentStation) &&
                                            station === selected.currentStation;

                                        return (
                                            <Reveal
                                                key={`${station}-${index}`}
                                                index={index}
                                                active={timelineRevealed}
                                                className="relative flex gap-4"
                                            >
                                                {!isLast && (
                                                    <div className="absolute left-[9px] top-5 h-full w-0.5 bg-slate-200" />
                                                )}

                                                <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center">
                                                    <span
                                                        className={`h-3 w-3 rounded-full border-2 ${isCurrent
                                                            ? "border-orange-500 bg-orange-500 ring-4 ring-orange-100"
                                                            : isFirst || isLast
                                                                ? "border-orange-500 bg-white"
                                                                : "border-slate-300 bg-white"
                                                            }`}
                                                    />
                                                </div>

                                                <div className="pb-7">
                                                    <p
                                                        className={`text-sm ${isCurrent
                                                            ? "font-bold text-orange-600"
                                                            : isFirst || isLast
                                                                ? "font-semibold text-slate-800"
                                                                : "text-slate-700"
                                                            }`}
                                                    >
                                                        {station}
                                                    </p>

                                                    {isCurrent && (
                                                        <p className="mt-1 text-xs font-semibold text-orange-600">
                                                            Current location
                                                        </p>
                                                    )}

                                                    {isFirst && (
                                                        <p className="mt-1 text-xs text-slate-500">Origin</p>
                                                    )}

                                                    {isLast && (
                                                        <p className="mt-1 text-xs text-slate-500">Destination</p>
                                                    )}
                                                </div>
                                            </Reveal>
                                        );
                                    })
                                )}
                            </div>

                        </div>

                        {/* SUMMARY */}

                        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

                            <h2 className="text-lg font-semibold text-slate-900">Journey Summary</h2>

                            <div className="mt-6 space-y-5">
                                <SummaryItem label="Train" value={selected.trainNumber} />
                                <SummaryItem label="Origin" value={selected.source} />
                                <SummaryItem label="Destination" value={selected.destination} />
                                <SummaryItem
                                    label="Stations"
                                    value={`${selected.stations.length} ${selected.stations.length === 1 ? "stop" : "stops"}`}
                                />
                                <SummaryItem
                                    label="Distance"
                                    value={
                                        typeof selected.distance === "number"
                                            ? `${selected.distance} km`
                                            : "--"
                                    }
                                />
                                <SummaryItem
                                    label="Current delay"
                                    value={selected.delay > 0 ? `+${selected.delay} min` : "On time"}
                                    danger={selected.delay > 0}
                                />

                                {/* Shown only when the ML service actually
                                    returned a prediction for this leg. */}
                                {typeof selected.predictedDelay === "number" ? (
                                    <SummaryItem
                                        label="Predicted delay"
                                        value={`+${selected.predictedDelay} min`}
                                        danger={selected.predictedDelay > 0}
                                    />
                                ) : null}

                                {selected.risk ? (
                                    <SummaryItem label="Risk" value={selected.risk} />
                                ) : null}
                            </div>

                            <div className="mt-7 rounded-xl border border-orange-100 bg-orange-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                                    Operational Status
                                </p>

                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                    {selected.delay > 0
                                        ? `Running ${selected.delay} ${selected.delay === 1 ? "minute" : "minutes"} behind schedule.`
                                        : "Running to schedule."}
                                    {selected.currentStation
                                        ? ` Last recorded at ${selected.currentStation}.`
                                        : " No current station is recorded."}
                                </p>
                            </div>

                        </div>

                    </div>
                </>
            ) : null}

            {/* Nothing searched yet. An instruction, not an error. */}
            {!searching && searchState === "idle" && !trainsLoading && !trainsError ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white shadow-sm">
                    <EmptyState
                        title="Pick an origin and a destination"
                        hint="Both lists come from the train routes on this network, so every pair offered has at least one train."
                        icon={<TrainFront size={20} />}
                        actionLabel={activeFrom && activeTo ? `Search ${activeFrom} to ${activeTo}` : ""}
                        onAction={activeFrom && activeTo ? handleSearch : null}
                    />
                </div>
            ) : null}

        </div>
    );
}

/* =========================================================
   JOURNEY METRIC
========================================================= */

function JourneyMetric({ label, value }) {
    return (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</p>

            <p className="mt-3 text-xl font-bold text-slate-900">
                {value === null || value === undefined || value === "" ? "--" : value}
            </p>
        </div>
    );
}

/* =========================================================
   SUMMARY ITEM
========================================================= */

function SummaryItem({ label, value, danger = false }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-600">{label}</span>

            <span
                className={`text-right text-sm font-semibold ${danger ? "text-red-700" : "text-slate-800"}`}
            >
                {value}
            </span>
        </div>
    );
}

/* =========================================================
   STATUS BADGE

   The label is always the status word, so the meaning does not live in the
   colour alone. A delay figure is appended only when there is one.
========================================================= */

const STATUS_STYLES = {
    RUNNING: { chip: "bg-green-100 text-green-800", dot: "bg-green-600" },
    DELAYED: { chip: "bg-red-100 text-red-800", dot: "bg-red-600" },
    AT_STATION: { chip: "bg-orange-100 text-orange-800", dot: "bg-orange-600" },
    CANCELLED: { chip: "bg-slate-200 text-slate-700", dot: "bg-slate-600" },
    COMPLETED: { chip: "bg-slate-100 text-slate-700", dot: "bg-slate-500" },
};

function StatusBadge({ status, delay = 0 }) {
    const style = STATUS_STYLES[status] || {
        chip: "bg-slate-100 text-slate-700",
        dot: "bg-slate-500",
    };

    return (
        <span
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${style.chip}`}
        >
            <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />

            {status ? status.replace(/_/g, " ") : "UNKNOWN"}
            {delay > 0 ? ` +${delay}m` : ""}
        </span>
    );
}

export default JourneyManagement;
