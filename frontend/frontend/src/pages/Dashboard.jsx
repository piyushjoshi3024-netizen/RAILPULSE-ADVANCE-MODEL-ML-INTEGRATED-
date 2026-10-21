import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  useAlerts,
  useCorridors,
  useNetworkSummary,
  useStations,
  useTrainEvents,
  useTrains,
} from "../hooks";

import Loading from "../components/state/Loading";
import EmptyState from "../components/state/EmptyState";
import ErrorState from "../components/state/ErrorState";

// The markers, lines and popups moved to components/map, so both this map
// and the Network Map page draw the same things the same way.
import { MapContainer, TileLayer } from "react-leaflet";

import "leaflet/dist/leaflet.css";
import L from "leaflet";

import TrainMarker from "../components/map/TrainMarker";
import StationMarker from "../components/map/StationMarker";
import CorridorLine from "../components/map/CorridorLine";
import UnmappedTrains from "../components/map/UnmappedTrains";
import { CRITICAL_DELAY_MINUTES, trainStatusFor } from "../components/map/mapStyle";
import CountUp from "../components/ui/CountUp";
import PageHeader from "../components/ui/PageHeader";
import Reveal from "../components/ui/Reveal";
import { useFirstReveal } from "../components/ui/useFirstReveal";
import { SkeletonStats } from "../components/ui/Skeleton";

// --------------------------------------------------
// LEAFLET ICON FIX
// --------------------------------------------------

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// --------------------------------------------------
// STATIONS AND CORRIDORS
// --------------------------------------------------
//
// Both lists used to be written out here, and NetworkMap.jsx carried its own
// slightly different copy of the same thing. They come from
// GET /api/stations and GET /api/corridors now, which is static reference
// data -- a station does not move while trains run -- so the hooks fetch it
// once per mount and never poll it.


// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

function Dashboard() {
  const navigate = useNavigate();

  // One hook per resource. Trains, events, the network summary and alerts
  // poll every fifteen seconds and pause while the tab is hidden; stations
  // and corridors are static and are fetched once.
  const trainsResource = useTrains();
  const eventsResource = useTrainEvents();
  const networkResource = useNetworkSummary();
  const alertsResource = useAlerts();
  const stationsResource = useStations();
  // The station list is handed to useCorridors so /api/stations is fetched
  // once for this page rather than once per hook that needs it.
  const corridorsResource = useCorridors(stationsResource);

  // UI-2: the entrance runs once, on the first answer, and is switched off
  // before the 15-second poll comes round. `!loading` rather than
  // `length > 0` so a genuinely empty alert list still settles rather than
  // waiting for data that is never coming.
  const statsRevealed = useFirstReveal(!networkResource.loading);
  const alertsRevealed = useFirstReveal(!alertsResource.loading);

  // The selection is held as a train number rather than a train object. The
  // old version stored the object and then ran an effect to re-point it at the
  // new object after every poll, which meant one extra render per poll and a
  // stale panel if that effect ever missed. Deriving it cannot go stale.
  const [selectedNumber, setSelectedNumber] = useState(null);

  const { latestByTrain } = eventsResource;
  const { byName, positionOf } = stationsResource;

  // The map shape the page renders. Cheap enough for a network's worth of
  // trains that memoising it would only hide where the work happens.
  const trains = trainsResource.trains.map((train) => {
    const event = latestByTrain.get(String(train._id));

    const currentStation =
      event?.station ||
      train.currentStation ||
      train.source;

    return {
      number: train.trainNumber,
      name: train.trainName,
      type: train.trainType || "UNKNOWN",
      status: event?.delayMinutes > 0 ? "DELAYED" : "RUNNING",
      // null rather than 0 where the event carried no reading: "standing at
      // a platform" and "we were not told" are different facts.
      speed: typeof event?.speed === "number" ? event.speed : null,
      delay: event?.delayMinutes || 0,
      currentStation,
      stationCode: byName.get(currentStation)?.code || null,
      destination: train.destination,
      // null, not a default point. This used to fall back to New Delhi for
      // any station it could not find, which put real trains at a coordinate
      // nobody had claimed they were at.
      position: positionOf(byName.get(currentStation)),
    };
  });

  const mappableTrains = trains.filter((train) => train.position);
  const unmappedTrains = trains.filter((train) => !train.position);
  const unmappedCount = unmappedTrains.length;

  // The same two joins the Network Map page makes, so the Dashboard's map
  // and that one cannot tell different stories about the same data.
  const trainsByStation = new Map();
  mappableTrains.forEach((train) => {
    if (!train.stationCode) return;
    trainsByStation.set(train.stationCode, [
      ...(trainsByStation.get(train.stationCode) || []),
      train,
    ]);
  });

  const trainsByCorridor = new Map();
  corridorsResource.corridors.forEach((corridor) => {
    const codes = new Set(corridor.stations || []);
    trainsByCorridor.set(
      corridor.corridorId,
      mappableTrains.filter((train) => train.stationCode && codes.has(train.stationCode))
    );
  });

  const selectedTrain =
    trains.find((train) => train.number === selectedNumber) ||
    trains[0] ||
    null;

  // The map cannot be drawn without trains, their events and the station
  // coordinates. The alerts panel and the stat cards report their own states.
  const mapLoading =
    trainsResource.loading || eventsResource.loading || stationsResource.loading;

  const mapError =
    trainsResource.error ||
    eventsResource.error ||
    stationsResource.error ||
    corridorsResource.error;

  const retryMap = () => {
    trainsResource.refetch();
    eventsResource.refetch();
    stationsResource.refetch();
    corridorsResource.refetch();
  };

  return (
    <div className="space-y-8">

      <PageHeader
        title="Dashboard"
        subtitle="Overview of the railway network and current operations."
        // The network summary is the figure the page leads with, so its
        // timestamp is the one that answers "is this current?". `retryMap`
        // already refetches all five resources.
        updatedAt={networkResource.updatedAt}
        onRefresh={retryMap}
        refreshing={networkResource.loading}
      />

      {/* -------------------------------------------
          STATS
      -------------------------------------------- */}

      {/* The first load gets skeletons shaped like the cards, not a bare
          spinner, so the four figures land in the space already reserved
          for them instead of pushing the map down the page. */}
      {networkResource.loading && alertsResource.loading ? (
        <SkeletonStats count={4} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">

          <StatCard
            index={0}
            revealed={statsRevealed}
            title="Active Trains"
            value={networkResource.loading ? null : networkResource.summary.activeTrains}
            description={networkResource.error ? "Summary unavailable" : "Currently operating"}
          />

          <StatCard
            index={1}
            revealed={statsRevealed}
            title="Delayed Trains"
            value={networkResource.loading ? null : networkResource.summary.delayedTrains}
            description={networkResource.error ? "Summary unavailable" : "Need attention"}
          />

          <StatCard
            index={2}
            revealed={statsRevealed}
            title="Network Status"
            value={networkResource.loading ? null : networkResource.networkStatus}
            description={networkResource.error ? "Summary unavailable" : "Current network condition"}
          />

          <StatCard
            index={3}
            revealed={statsRevealed}
            title="Active Alerts"
            value={alertsResource.loading ? null : alertsResource.alerts.length}
            description={alertsResource.error ? "Alerts unavailable" : "Requires monitoring"}
          />

        </div>
      )}

      {/* -------------------------------------------
          NETWORK + ALERTS
      -------------------------------------------- */}

      <div className="grid gap-6 lg:grid-cols-3">

        {/* =========================================
            NETWORK OVERVIEW
        ========================================== */}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">

          <div className="mb-5 flex items-center justify-between">

            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Network Overview
              </h2>

              <p className="text-sm text-slate-500">
                Railway traffic overview
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate("/map")}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              View Map
            </button>

          </div>

          {/* MAP + DETAILS */}

          <div className="grid gap-3 xl:grid-cols-[1fr_230px]">

            {/* =====================================
                MAP
            ====================================== */}

            <div className="h-[360px] overflow-hidden rounded-xl">

              {mapLoading ? (

                <Loading label="Loading the network map..." className="py-28" />

              ) : mapError ? (

                <ErrorState
                  message={mapError}
                  hint="The map needs trains, their latest events and the station list. Check that the API is running."
                  onRetry={retryMap}
                  className="py-24"
                />

              ) : (

              <MapContainer
                center={[23.5, 78.9]}
                zoom={5}
                // Off, unlike the Network Map page: this map is a panel in a
                // scrolling page, and a wheel over it should scroll the page
                // rather than zoom the map out from under the cursor.
                scrollWheelZoom={false}
                touchZoom
                tap
                className="rp-map w-full h-[300px] sm:h-[390px] rounded-xl"
              >

                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* ---------------------------------
                    RAILWAY CORRIDORS
                ---------------------------------- */}

                {corridorsResource.corridors.map((corridor) => (
                  <CorridorLine
                    key={corridor.corridorId}
                    corridor={corridor}
                    trains={trainsByCorridor.get(corridor.corridorId) || []}
                  />
                ))}

                {/* ---------------------------------
                    STATIONS
                ---------------------------------- */}

                {stationsResource.stations.map((station) => (
                  <StationMarker
                    key={station.code}
                    station={station}
                    trains={trainsByStation.get(station.code) || []}
                    onSelectTrain={setSelectedNumber}
                  />
                ))}

                {/* ---------------------------------
                    TRAINS
                ---------------------------------- */}

                {mappableTrains.map((train) => (
                  <TrainMarker
                    key={train.number}
                    train={train}
                    selected={selectedTrain?.number === train.number}
                    onSelect={setSelectedNumber}
                  />
                ))}

              </MapContainer>

              )}

            </div>

            {/* =====================================
                LIVE NETWORK DETAILS
            ====================================== */}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

              <div className="mb-4">

                <div className="flex items-center justify-between">

                  <h3 className="font-semibold text-slate-900">
                    Live Network
                  </h3>

                  {/* This said "LIVE" with a green dot whenever a train was
                      selected. Nothing here is a live feed: it is a
                      fifteen-second poll, so it reports when the data was last
                      read instead of claiming a stream. */}
                  {trainsResource.updatedAt && (
                    <span className="flex items-center gap-1 text-xs font-medium text-slate-500">

                      <span className="h-2 w-2 rounded-full bg-green-500"></span>

                      {trainsResource.updatedAt.toLocaleTimeString()}

                    </span>
                  )}

                </div>

                <p className="mt-1 text-xs text-slate-500">
                  Selected train details
                </p>

              </div>

              {/* SELECTED TRAIN */}

              {trainsResource.loading ? (

                <Loading label="Loading trains..." className="py-8" />

              ) : trainsResource.error ? (

                <ErrorState
                  message={trainsResource.error}
                  onRetry={trainsResource.refetch}
                  className="py-8"
                />

              ) : !selectedTrain ? (

                <EmptyState
                  title="No trains to show"
                  hint="No train has been recorded in this environment yet."
                  icon="\u2014"
                  className="rounded-xl border border-dashed border-slate-300 bg-white p-4"
                />

              ) : (

              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">

                <div className="flex items-start justify-between">

                  <div>

                    <p className="text-sm font-bold text-slate-900">
                      {selectedTrain?.name}
                    </p>

                    <p className="text-xs text-slate-500">
                      #{selectedTrain?.number}
                    </p>

                  </div>

                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold ${selectedTrain?.status === "DELAYED"
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                      }`}
                  >
                    {selectedTrain?.status}
                  </span>

                </div>

                <div className="mt-3 space-y-2">

                  <DetailRow
                    label="Type"
                    value={selectedTrain?.type}
                  />

                  <DetailRow
                    label="Speed"
                    value={`${selectedTrain?.speed} km/h`}
                  />

                  <DetailRow
                    label="Current"
                    value={selectedTrain?.currentStation}
                  />

                  <DetailRow
                    label="Destination"
                    value={selectedTrain?.destination}
                  />

                  <DetailRow
                    label="Delay"
                    value={`${selectedTrain?.delay} min`}
                    danger={selectedTrain?.delay > 0}
                  />

                </div>

              </div>

              )}

              {/* NETWORK SUMMARY */}

              <div className="mt-3 grid grid-cols-2 gap-2">

                <MiniStat
                  label="Running"
                  value={
                    trains.filter(
                      (train) => train.status === "RUNNING"
                    ).length
                  }
                />

                <MiniStat
                  label="Delayed"
                  value={
                    trains.filter(
                      (train) => train.status === "DELAYED"
                    ).length
                  }
                />

              </div>

              {/* TRAIN LIST */}

              <div className="mt-4">

                <p className="mb-2 text-xs font-semibold text-slate-500">
                  ACTIVE TRAINS
                </p>

                <div className="max-h-[115px] space-y-1 overflow-y-auto">

                  {trains.map((train) => (

                    <button
                      key={train.number}
                      onClick={() => setSelectedNumber(train.number)}
                      className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition ${selectedTrain?.number === train.number
                        ? "bg-orange-100"
                        : "hover:bg-white"
                        }`}
                    >

                      <div className="flex items-center gap-2">

                        <span
                          className={`h-2 w-2 rounded-full ${train.status === "DELAYED"
                            ? "bg-red-500"
                            : "bg-green-500"
                            }`}
                        />

                        <span className="text-xs font-medium text-slate-700">
                          {train.number}
                        </span>

                      </div>

                      <span className="text-[10px] text-slate-500">
                        {train.speed} km/h
                      </span>

                    </button>

                  ))}

                </div>

              </div>

            </div>

          </div>

          {/* MAP LEGEND */}

          <div className="mt-3 space-y-2">

            {/* The same three delay bands the Network Map uses, each naming
                the range it stands for. The old legend had two -- "Running"
                and "Delayed" -- and neither said what the colour meant in
                minutes. */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-700">

              {[
                trainStatusFor(0),
                trainStatusFor(1),
                trainStatusFor(CRITICAL_DELAY_MINUTES),
              ].map((band) => (
                <Legend key={band.key} color={band.color} text={band.legend} />
              ))}

              <Legend color="#fb923c" text="Railway corridor" shape="line" />
              <Legend text="Station" shape="station" />

            </div>

            {unmappedCount > 0 && (
              <div className="max-w-md">
                <UnmappedTrains trains={unmappedTrains} />
              </div>
            )}

          </div>

        </div>

        {/* =========================================
            RECENT ALERTS
        ========================================== */}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <h2 className="text-lg font-semibold text-slate-900">
            Recent Alerts
          </h2>

          <div className="mt-5 space-y-4">

            {alertsResource.loading ? (

              <Loading label="Loading alerts..." className="py-6" />

            ) : alertsResource.error ? (

              <ErrorState
                message={alertsResource.error}
                onRetry={alertsResource.refetch}
                className="py-6"
              />

            ) : alertsResource.alerts.length === 0 ? (

              <p className="text-sm text-slate-500">
                No alerts have been recorded.
              </p>

            ) : (
              alertsResource.alerts.slice(0, 3).map((alert, alertIndex) => (
                <AlertItem
                  key={alert._id}
                  index={alertIndex}
                  revealed={alertsRevealed}
                  title={alert.message}
                  time={
                    alert.createdAt
                      ? new Date(alert.createdAt).toLocaleTimeString()
                      : "Unknown"
                  }
                />
              ))
            )}

          </div>
        </div>

      </div>

    </div>
  );
}

// --------------------------------------------------
// STAT CARD
// --------------------------------------------------

function StatCard({
  title,
  value,
  description,
  index = 0,
  revealed = false,
}) {
  // Only a number counts up. "HIGH" is a network status, and a string has
  // nothing to count from; `null` means the figure has not arrived, which
  // renders as "--" rather than as a zero that would read as a real count.
  const isNumber = typeof value === "number" && Number.isFinite(value);

  return (
    <Reveal index={index} active={revealed}>
      <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <p className="text-sm font-medium text-slate-600">
          {title}
        </p>

        <p className="mt-3 text-3xl font-bold text-slate-900">
          {isNumber ? <CountUp value={value} /> : value ?? "--"}
        </p>

        <p className="mt-2 text-sm text-slate-500">
          {description}
        </p>

      </div>
    </Reveal>
  );
}

// --------------------------------------------------
// ALERT
// --------------------------------------------------

function AlertItem({
  title,
  time,
  index = 0,
  revealed = false,
}) {
  return (
    <Reveal index={index} active={revealed} className="flex gap-3 rounded-xl bg-orange-50 p-3">

      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />

      <div>

        <p className="text-sm font-medium text-slate-700">
          {title}
        </p>

        <p className="mt-1 text-xs text-slate-600">
          {time}
        </p>

      </div>

    </Reveal>
  );
}

// --------------------------------------------------
// DETAIL ROW
// --------------------------------------------------

function DetailRow({
  label,
  value,
  danger = false,
}) {
  return (
    <div className="flex items-center justify-between text-xs">

      <span className="text-slate-500">
        {label}
      </span>

      <span
        className={`font-semibold ${danger
          ? "text-red-600"
          : "text-slate-700"
          }`}
      >
        {value}
      </span>

    </div>
  );
}

// --------------------------------------------------
// MINI STAT
// --------------------------------------------------

function MiniStat({
  label,
  value,
}) {
  return (
    <div className="rounded-lg bg-white p-2 text-center">

      <p className="text-lg font-bold text-slate-900">
        {value}
      </p>

      <p className="text-[10px] text-slate-500">
        {label}
      </p>

    </div>
  );
}

// --------------------------------------------------
// LEGEND
// --------------------------------------------------


function Legend({ color = null, text, shape = "dot" }) {
  let visual;

  if (shape === "line") {
    visual = (
      <span
        className="h-[3px] w-5 shrink-0 rounded"
        style={{ background: color }}
        aria-hidden="true"
      />
    );
  } else if (shape === "station") {
    visual = (
      <span
        className="h-3 w-3 shrink-0 rounded-full border-2 border-slate-700 bg-white"
        aria-hidden="true"
      />
    );
  } else {
    visual = (
      <span
        className="h-3 w-3 shrink-0 rounded-full border-2 border-white shadow"
        style={{ background: color }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      {visual}
      <span>{text}</span>
    </div>
  );
}

export default Dashboard;