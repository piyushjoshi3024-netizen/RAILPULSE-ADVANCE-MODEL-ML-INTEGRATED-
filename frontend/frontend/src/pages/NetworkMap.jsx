import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Popup,
  Polyline,
  Tooltip,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import L from "leaflet";

import {
  useCorridors,
  useStations,
  useTrainEvents,
  useTrains,
} from "../hooks";

import Loading from "../components/state/Loading";
import ErrorState from "../components/state/ErrorState";

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
   STATIONS, CORRIDORS AND TRAINS

   All three were written out here, and Dashboard.jsx carried its own
   diverging copy of the first two. They come from GET /api/stations,
   GET /api/corridors, GET /api/trains and GET /api/train-events now.

   The six-train array mattered most: the map rendered *it*, merging in
   whatever the API happened to know about those six numbers. A train the
   database had and the array did not simply never appeared.
========================================================= */
/* =========================================================
   TRAIN ICON
========================================================= */

function createTrainIcon(status) {
  const color =
    status === "DELAYED"
      ? "#dc2626"
      : "#16a34a";

  return L.divIcon({
    className: "train-marker",
    html: `
      <div style="
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: ${color};
        border: 3px solid white;
        box-shadow: 0 1px 6px rgba(0,0,0,0.45);
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}


/* =========================================================
   TRAIN MARKER

   This used to be MovingTrain: a setInterval that slid the marker along a
   corridor by 0.008 of a segment every second. Nothing measured that motion.
   It was an animation of an invented position, and it looked exactly like a
   tracked one.

   The marker now sits at the station the train's latest event reports, and a
   train whose station has no recorded coordinate is not drawn at all.
========================================================= */

function TrainMarker({ train }) {
  return (
    <Marker
      position={train.position}
      icon={createTrainIcon(train.status)}
    >
      <Tooltip
        direction="top"
        offset={[0, -8]}
        opacity={0.95}
      >
        <strong>
          {train.number}
        </strong>{" "}
        • {train.name}
      </Tooltip>

      <Popup>
        <div className="min-w-[220px]">

          <div className="flex items-center justify-between">

            <div>
              <h3 className="font-bold text-slate-900">
                {train.name}
              </h3>

              <p className="text-xs text-slate-500">
                Train {train.number}
              </p>
            </div>

            <span
              style={{
                background:
                  train.status === "DELAYED"
                    ? "#fee2e2"
                    : "#dcfce7",
                color:
                  train.status === "DELAYED"
                    ? "#b91c1c"
                    : "#15803d",
              }}
              className="rounded-full px-2 py-1 text-xs font-semibold"
            >
              {train.status}
            </span>

          </div>

          <div className="mt-3 space-y-1 text-sm">

            <p>
              <strong>Type:</strong>{" "}
              {train.type}
            </p>

            <p>
              <strong>Speed:</strong>{" "}
              {train.speed} km/h
            </p>

            <p>
              <strong>Current:</strong>{" "}
              {train.currentStation}
            </p>

            <p>
              <strong>Destination:</strong>{" "}
              {train.destination}
            </p>

            <p>
              <strong>Delay:</strong>{" "}
              <span
                className={
                  train.delay > 0
                    ? "font-semibold text-red-600"
                    : "font-semibold text-green-600"
                }
              >
                {train.delay} min
              </span>
            </p>

          </div>

        </div>
      </Popup>
    </Marker>
  );
}


/* =========================================================
   MAP
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

  // Every train the database has, not the six that were listed here. The map
  // shape is built the same way the Dashboard builds it.
  const allTrains = trainsResource.trains.map((train) => {
    const event = latestByTrain.get(String(train._id));

    const currentStation =
      event?.station ||
      train.currentStation ||
      train.source ||
      "Unknown";

    return {
      number: train.trainNumber,
      name: train.trainName,
      type: train.trainType || "UNKNOWN",
      status: event?.delayMinutes > 0 ? "DELAYED" : train.status || "RUNNING",
      speed: event?.speed || 0,
      delay: event?.delayMinutes || 0,
      currentStation,
      destination: train.destination,
      position: positionOf(byName.get(currentStation)),
    };
  });

  const mappableTrains = allTrains.filter((train) => train.position);
  const unmappedCount = allTrains.length - mappableTrains.length;

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

  return (
    <div className="relative h-full w-full">

      {loading ? (

        <Loading label="Loading the network map..." className="py-32" />

      ) : error ? (

        <ErrorState
          message={error}
          hint="The map needs the station list, the corridors and the trains. Check that the API is running."
          onRetry={retry}
          className="py-28"
        />

      ) : (

      <>

      <MapContainer
        center={[24.5, 78.0]}
        zoom={5}
        scrollWheelZoom={true}
        className="h-full w-full"
      >

        {/* Base map */}
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />


        {/* =================================================
            RAILWAY CORRIDORS
        ================================================= */}

        {corridorsResource.corridors.map((corridor) => (
          <Polyline
            key={corridor.corridorId}
            positions={corridor.positions}
            pathOptions={{
              color: "#f97316",
              weight: 4,
              opacity: 0.75,
              lineCap: "round",
              lineJoin: "round",
            }}
          >
            <Tooltip sticky>
              {corridor.name}
            </Tooltip>
          </Polyline>
        ))}


        {/* =================================================
            STATIONS
        ================================================= */}

        {stationsResource.stations.map((station) => (
          <CircleMarker
            key={station.code}
            center={[station.lat, station.lng]}
            radius={4}
            pathOptions={{
              color: "#334155",
              fillColor: "#ffffff",
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -4]}
            >
              <strong>
                {station.name}
              </strong>
              <br />
              {station.code}
            </Tooltip>

            <Popup>
              <div className="min-w-[150px]">
                <h3 className="font-bold text-slate-900">
                  {station.name}
                </h3>

                <p className="text-sm text-slate-500">
                  Station Code: {station.code}
                </p>
              </div>
            </Popup>

          </CircleMarker>
        ))}


        {/* =================================================
            TRAINS
        ================================================= */}

        {mappableTrains.map((train) => (
          <TrainMarker
            key={train.number}
            train={train}
          />
        ))}

      </MapContainer>


      {/* =================================================
          MAP LEGEND
      ================================================= */}

      <div
        className="
          absolute
          bottom-3
          left-3
          z-[1000]
          rounded-lg
          bg-white/95
          px-3
          py-2
          text-xs
          shadow-md
        "
      >

        <div className="mb-2 font-semibold text-slate-700">
          Network Status
        </div>

        <div className="flex items-center gap-2 text-slate-700">
          <span
            className="h-3 w-3 rounded-full"
            style={{
              background: "#16a34a",
            }}
          />
          Running Train
        </div>

        <div className="mt-1 flex items-center gap-2 text-slate-700">
          <span
            className="h-3 w-3 rounded-full"
            style={{
              background: "#dc2626",
            }}
          />
          Delayed Train
        </div>

        <div className="mt-1 flex items-center gap-2 text-slate-700">
          <span
            className="h-[3px] w-4"
            style={{
              background: "#f97316",
            }}
          />
          Railway Corridor
        </div>

        <div className="mt-1 flex items-center gap-2 text-slate-700">
          <span
            className="
              h-2.5
              w-2.5
              rounded-full
              border-2
              border-slate-700
              bg-white
            "
          />
          Station
        </div>

        {unmappedCount > 0 && (
          <div className="mt-2 max-w-[200px] border-t border-slate-200 pt-2 text-slate-500">
            {unmappedCount} train{unmappedCount === 1 ? "" : "s"} not shown: no
            coordinate is recorded for the station it is at.
          </div>
        )}

      </div>

      </>

      )}

    </div>
  );
}

export default NetworkMap;