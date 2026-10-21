import { useCallback, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { MapContainer, TileLayer } from "react-leaflet";

import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { useCorridors, useStations, useTrainEvents, useTrains } from "../hooks";

import ErrorState from "../components/state/ErrorState";
import EmptyState from "../components/state/EmptyState";
import { SkeletonMap } from "../components/ui/Skeleton";

import TrainMarker from "../components/map/TrainMarker";
import StationMarker from "../components/map/StationMarker";
import CorridorLine from "../components/map/CorridorLine";
import UnmappedTrains from "../components/map/UnmappedTrains";
import {
  FitToNetwork,
  FlyToTrain,
  Legend,
  MapButtons,
  StatusFilter,
  TrainSearch,
} from "../components/map/MapControls";
import { corridorStatusFor, trainStatusFor } from "../components/map/mapStyle";

/* =========================================================
   LEAFLET ICON FIX
========================================================= */

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/* =========================================================
   NETWORK MAP

   Stations, corridors and trains all come from the API:
   GET /api/stations, /api/corridors, /api/trains, /api/train-events.
   Nothing on this map is drawn from a coordinate this file invented. A
   train whose station has no recorded coordinate is not placed at a
   plausible-looking point -- it is left off and counted in the note at the
   bottom of the panel, which now opens to name those trains.
========================================================= */

function NetworkMap() {
  // Stations and corridors are static reference data, fetched once. Trains and
  // their events poll every fifteen seconds and pause while the tab is hidden.
  const stationsResource = useStations();
  const corridorsResource = useCorridors(stationsResource);
  const trainsResource = useTrains();
  const eventsResource = useTrainEvents();

  const { latestByTrain } = eventsResource;
  const { byName, positionOf } = stationsResource;

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedNumber, setSelectedNumber] = useState(null);
  const [fitKey, setFitKey] = useState(0);
  const [flyKey, setFlyKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  // Below sm the panel would cover most of a 360px-tall map, so it collapses
  // to its one-line summary and the two buttons. From sm up it is always
  // open and this flag is ignored.
  const [panelOpen, setPanelOpen] = useState(false);

  // Every train the database has, shaped for the map. `position` is the
  // coordinate of the station the latest event names, or null -- never a
  // substitute.
  const allTrains = useMemo(
    () =>
      trainsResource.trains.map((train) => {
        const event = latestByTrain.get(String(train._id));

        const currentStation =
          event?.station || train.currentStation || train.source || "";

        const station = byName.get(currentStation);

        return {
          number: train.trainNumber,
          name: train.trainName,
          type: train.trainType || "UNKNOWN",
          delay: event?.delayMinutes ?? 0,
          speed: typeof event?.speed === "number" ? event.speed : null,
          currentStation,
          stationCode: station?.code || null,
          destination: train.destination,
          position: positionOf(station),
        };
      }),
    [trainsResource.trains, latestByTrain, byName, positionOf]
  );

  const mappableTrains = useMemo(
    () => allTrains.filter((train) => train.position),
    [allTrains]
  );

  const unmappedTrains = useMemo(
    () => allTrains.filter((train) => !train.position),
    [allTrains]
  );

  const statusCounts = useMemo(() => {
    const counts = { ALL: mappableTrains.length, ON_TIME: 0, DELAYED: 0, CRITICAL: 0 };
    mappableTrains.forEach((train) => {
      counts[trainStatusFor(train.delay).key] += 1;
    });
    return counts;
  }, [mappableTrains]);

  const visibleTrains = useMemo(
    () =>
      statusFilter === "ALL"
        ? mappableTrains
        : mappableTrains.filter((train) => trainStatusFor(train.delay).key === statusFilter),
    [mappableTrains, statusFilter]
  );

  const searchMatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];

    return mappableTrains
      .filter(
        (train) =>
          train.number.toLowerCase().includes(term) ||
          train.name.toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [mappableTrains, search]);

  /** Trains standing at each station, keyed by station code. */
  const trainsByStation = useMemo(() => {
    const map = new Map();
    mappableTrains.forEach((train) => {
      if (!train.stationCode) return;
      map.set(train.stationCode, [...(map.get(train.stationCode) || []), train]);
    });
    return map;
  }, [mappableTrains]);

  /** Trains on each corridor: those whose current station is one of its stops. */
  const trainsByCorridor = useMemo(() => {
    const map = new Map();

    corridorsResource.corridors.forEach((corridor) => {
      const codes = new Set(corridor.stations || []);
      map.set(
        corridor.corridorId,
        mappableTrains.filter((train) => train.stationCode && codes.has(train.stationCode))
      );
    });

    return map;
  }, [corridorsResource.corridors, mappableTrains]);

  const corridorCounts = useMemo(() => {
    const counts = {};
    corridorsResource.corridors.forEach((corridor) => {
      const key = corridorStatusFor(trainsByCorridor.get(corridor.corridorId)).key;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [corridorsResource.corridors, trainsByCorridor]);

  /** Everything the map draws, for fit-to-network. */
  const allPoints = useMemo(
    () => [
      ...stationsResource.stations
        .map((station) => positionOf(station))
        .filter(Boolean),
      ...mappableTrains.map((train) => train.position),
    ],
    [stationsResource.stations, positionOf, mappableTrains]
  );

  const selectedTrain = useMemo(
    () => mappableTrains.find((train) => train.number === selectedNumber) || null,
    [mappableTrains, selectedNumber]
  );

  const handlePick = useCallback((number) => {
    setSelectedNumber(number);
    setSearch("");
    setFlyKey((key) => key + 1);
  }, []);

  const loading =
    stationsResource.loading || corridorsResource.loading || trainsResource.loading;

  const error =
    stationsResource.error ||
    corridorsResource.error ||
    trainsResource.error ||
    eventsResource.error;

  const retry = () => {
    stationsResource.refetch();
    corridorsResource.refetch();
    trainsResource.refetch();
    eventsResource.refetch();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageTitle />
        <SkeletonMap className="h-[60vh] min-h-[380px]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageTitle />
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ErrorState
            message={error}
            hint="The map needs the station list, the corridors and the trains. Check that the API is running."
            onRetry={retry}
          />
        </div>
      </div>
    );
  }

  // The API answered and there is nothing to draw. Not an error, and not a
  // reason to show an empty grey rectangle with no explanation.
  if (stationsResource.stations.length === 0) {
    return (
      <div className="space-y-6">
        <PageTitle />
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <EmptyState
            title="No stations are recorded"
            hint="The map is drawn from the station list, and the API returned none. There is nothing to place trains or corridors against."
            icon="∅"
            actionLabel="Try again"
            onAction={retry}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={fullscreen ? "fixed inset-0 z-[1400] bg-slate-50 p-3" : "space-y-6"}>

      {!fullscreen ? <PageTitle /> : null}

      <div
        className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${fullscreen
          ? "h-full"
          : "h-[64vh] min-h-[400px] sm:h-[calc(100vh-15rem)] sm:min-h-[460px]"
          }`}
      >
        <MapContainer
          center={[24.5, 78.0]}
          zoom={5}
          // On a dedicated map page the wheel belongs to the map. The
          // Dashboard's embedded map turns this off so the page can scroll.
          scrollWheelZoom
          // Two-finger pinch zooms; one finger pans. `tap` is left on so a
          // marker responds to a tap rather than needing a click event that
          // a touch screen never sends.
          touchZoom
          tap
          className="rp-map h-full w-full"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            // Standard OSM tiles. A pale third-party basemap would suit the
            // theme better, but every one worth having (Carto Positron,
            // Stadia/Stamen) now wants an API key, and a map stamped "API
            // KEY REQUIRED" is worse than a busy one. The `.rp-map` class in
            // index.css desaturates these tiles in CSS instead, which costs
            // no key and no request, and leaves the orange, amber, green and
            // red of the network legible on top.
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitToNetwork points={allPoints} fitKey={fitKey} />
          <FlyToTrain position={selectedTrain?.position} flyKey={flyKey} />

          {corridorsResource.corridors.map((corridor) => (
            <CorridorLine
              key={corridor.corridorId}
              corridor={corridor}
              trains={trainsByCorridor.get(corridor.corridorId) || []}
            />
          ))}

          {stationsResource.stations.map((station) => (
            <StationMarker
              key={station.code}
              station={station}
              trains={trainsByStation.get(station.code) || []}
              onSelectTrain={handlePick}
            />
          ))}

          {visibleTrains.map((train) => (
            <TrainMarker
              key={train.number}
              train={train}
              selected={train.number === selectedNumber}
              onSelect={setSelectedNumber}
            />
          ))}
        </MapContainer>

        {/* CONTROL PANEL
            Above the tiles but below Leaflet's own popups. On a phone it
            sits across the top so it never covers the map's centre; from sm
            up it is a panel in the corner. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] p-2 sm:inset-x-auto sm:left-3 sm:top-3 sm:w-64 sm:p-0">
          <div className="pointer-events-auto rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm">

            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => setPanelOpen((current) => !current)}
                aria-expanded={panelOpen}
                className="rp-press flex items-center gap-1.5 rounded text-xs font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 sm:pointer-events-none sm:cursor-default"
              >
                <ChevronDown
                  size={13}
                  className={`shrink-0 transition-transform sm:hidden ${panelOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
                {visibleTrains.length} of {mappableTrains.length} trains shown
              </button>

              <MapButtons
                onFit={() => setFitKey((key) => key + 1)}
                isFullscreen={fullscreen}
                onToggleFullscreen={() => setFullscreen((current) => !current)}
              />
            </div>

            <div className={panelOpen ? "block" : "hidden sm:block"}>

            <div className="mt-2.5">
              <TrainSearch
                value={search}
                onChange={setSearch}
                matches={searchMatches}
                onPick={handlePick}
              />
            </div>

            <div className="mt-2.5">
              <StatusFilter
                value={statusFilter}
                onChange={setStatusFilter}
                counts={statusCounts}
              />
            </div>

            {/* The legend is a lot of rows on a phone; it is collapsed into
                a details element below sm rather than taking half the map. */}
            <details className="mt-2.5 sm:hidden">
              <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                Legend
              </summary>
              <div className="mt-2">
                <Legend corridorCounts={corridorCounts} />
              </div>
            </details>

            <div className="mt-2.5 hidden sm:block">
              <Legend corridorCounts={corridorCounts} />
            </div>

            <div className="mt-2.5">
              <UnmappedTrains trains={unmappedTrains} />
            </div>

            {/* The filter can empty the map. Say so, rather than leaving the
                user looking at corridors and wondering where the trains went. */}
            {visibleTrains.length === 0 && mappableTrains.length > 0 ? (
              <p className="mt-2.5 border-t border-slate-200 pt-2 text-xs text-slate-700">
                No train matches this filter.{" "}
                <button
                  type="button"
                  onClick={() => setStatusFilter("ALL")}
                  className="font-semibold text-orange-600 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                >
                  Show all
                </button>
              </p>
            ) : null}

            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function PageTitle() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-900">Network Map</h1>

      <p className="mt-2 text-slate-600">
        Live train positions, stations and corridors across the network.
      </p>
    </div>
  );
}

export default NetworkMap;
