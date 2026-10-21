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

import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import L from "leaflet";

import CountUp from "../components/ui/CountUp";
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
// TRAIN ICON
// --------------------------------------------------

function createTrainIcon(status, selected = false) {
  const color = status === "DELAYED" ? "#dc2626" : "#16a34a";

  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],

    html: `
      <div style="
        width: ${selected ? "28px" : "22px"};
        height: ${selected ? "28px" : "22px"};
        border-radius: 50%;
        background: ${color};
        border: ${selected ? "4px" : "3px"} solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        display:flex;
        align-items:center;
        justify-content:center;
      ">
        <div style="
          width:7px;
          height:7px;
          background:white;
          border-radius:50%;
        "></div>
      </div>
    `,
  });
}

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
      speed: event?.speed || 0,
      delay: event?.delayMinutes || 0,
      currentStation,
      destination: train.destination,
      // null, not a default point. This used to fall back to New Delhi for
      // any station it could not find, which put real trains at a coordinate
      // nobody had claimed they were at.
      position: positionOf(byName.get(currentStation)),
    };
  });

  const mappableTrains = trains.filter((train) => train.position);
  const unmappedCount = trains.length - mappableTrains.length;

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

      {/* -------------------------------------------
          PAGE HEADING
      -------------------------------------------- */}

      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Dashboard
        </h1>

        <p className="mt-2 text-slate-500">
          Overview of the railway network and current operations.
        </p>
      </div>

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
                scrollWheelZoom={true}
                className=" w-full h-[390px] rounded-xl"
              >

                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* ---------------------------------
                    RAILWAY CORRIDORS
                ---------------------------------- */}

                {corridorsResource.corridors.map((corridor) => (
                  <Polyline
                    key={corridor.corridorId}
                    positions={corridor.positions}
                    pathOptions={{
                      color: "#f97316",
                      weight: 4,
                      opacity: 0.8,
                    }}
                  />
                ))}

                {/* ---------------------------------
                    STATIONS
                ---------------------------------- */}

                {stationsResource.stations.map((station) => (
                  <CircleMarker
                    key={station.code}
                    center={[station.lat, station.lng]}
                    radius={4}
                    pathOptions={{
                      color: "#1e293b",
                      fillColor: "#ffffff",
                      fillOpacity: 1,
                      weight: 2,
                    }}
                  >
                    <Popup>

                      <div className="min-w-[150px]">

                        <p className="font-bold text-slate-900">
                          {station.name}
                        </p>

                        <p className="text-xs text-slate-500">
                          Station Code: {station.code}
                        </p>

                        <div className="mt-2 border-t pt-2 text-xs">
                          Railway Network Station
                        </div>

                      </div>

                    </Popup>

                  </CircleMarker>
                ))}

                {/* ---------------------------------
                    TRAINS
                ---------------------------------- */}

                {mappableTrains.map((train) => (

                  <Marker
                    key={train.number}
                    position={train.position}
                    icon={createTrainIcon(
                      train.status,
                      selectedTrain?.number === train.number
                    )}
                    eventHandlers={{
                      click: () => setSelectedNumber(train.number),
                    }}
                  >

                    <Popup>

                      <div className="min-w-[190px]">

                        <p className="font-bold text-slate-900">
                          {train.name}
                        </p>

                        <p className="text-xs text-slate-500">
                          Train {train.number}
                        </p>

                        <div className="mt-2 space-y-1 text-sm">

                          <p>
                            <b>Status:</b>{" "}
                            <span
                              className={
                                train.status === "DELAYED"
                                  ? "text-red-600"
                                  : "text-green-600"
                              }
                            >
                              {train.status}
                            </span>
                          </p>

                          <p>
                            <b>Speed:</b> {train.speed} km/h
                          </p>

                          <p>
                            <b>Current:</b>{" "}
                            {train.currentStation}
                          </p>

                          <p>
                            <b>Destination:</b>{" "}
                            {train.destination}
                          </p>

                        </div>

                      </div>

                    </Popup>

                  </Marker>

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

                      <span className="text-[10px] text-slate-400">
                        {train.speed} km/h
                      </span>

                    </button>

                  ))}

                </div>

              </div>

            </div>

          </div>

          {/* MAP LEGEND */}

          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">

            <Legend
              type="green"
              text="Running Train"
            />

            <Legend
              type="red"
              text="Delayed Train"
            />

            <Legend
              type="orange"
              text="Railway Corridor"
            />

            <Legend
              type="station"
              text="Station"
            />

            {unmappedCount > 0 && (
              <span className="text-slate-400">
                {unmappedCount} train{unmappedCount === 1 ? "" : "s"} not shown:
                no coordinate is recorded for the station it is at.
              </span>
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

              <p className="text-sm text-slate-400">
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

      <span className="text-slate-400">
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

      <p className="text-[10px] text-slate-400">
        {label}
      </p>

    </div>
  );
}

// --------------------------------------------------
// LEGEND
// --------------------------------------------------

function Legend({
  type,
  text,
}) {
  let visual;

  if (type === "orange") {
    visual = (
      <span className="h-[3px] w-5 rounded bg-orange-500" />
    );
  } else if (type === "station") {
    visual = (
      <span className="h-3 w-3 rounded-full border-2 border-slate-700 bg-white" />
    );
  } else {
    visual = (
      <span
        className={`h-3 w-3 rounded-full ${type === "red"
          ? "bg-red-500"
          : "bg-green-500"
          }`}
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