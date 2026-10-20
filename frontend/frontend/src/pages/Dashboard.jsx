import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTrains } from "../services/trainService";
import { getTrainEvents } from "../services/trainEventService";
import api from "../services/api";

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
// STATIONS
// --------------------------------------------------

const stations = [
  {
    name: "New Delhi",
    code: "NDLS",
    position: [28.6139, 77.209],
  },
  {
    name: "Gurugram",
    code: "GGN",
    position: [28.4595, 77.0266],
  },
  {
    name: "Rewari",
    code: "RE",
    position: [28.199, 76.619],
  },
  {
    name: "Jaipur",
    code: "JP",
    position: [26.9124, 75.7873],
  },
  {
    name: "Agra",
    code: "AGC",
    position: [27.1767, 78.0081],
  },
  {
    name: "Kota",
    code: "KOTA",
    position: [25.2138, 75.8648],
  },
  {
    name: "Bhopal",
    code: "BPL",
    position: [23.2599, 77.4126],
  },
  {
    name: "Mumbai Central",
    code: "MMCT",
    position: [19.076, 72.8777],
  },
  {
    name: "Surat",
    code: "ST",
    position: [21.1702, 72.8311],
  },
  {
    name: "Kanpur",
    code: "CNB",
    position: [26.4499, 80.3319],
  },
  {
    name: "Prayagraj",
    code: "PRYJ",
    position: [25.4358, 81.8463],
  },
  {
    name: "Kolkata",
    code: "HWH",
    position: [22.5726, 88.3639],
  },
];


// --------------------------------------------------
// RAILWAY CORRIDORS
// --------------------------------------------------

const corridors = [
  // Delhi -> Jaipur -> Mumbai
  [
    [28.6139, 77.209],
    [28.4595, 77.0266],
    [28.199, 76.619],
    [26.9124, 75.7873],
    [25.2138, 75.8648],
    [23.2599, 77.4126],
    [21.1702, 72.8311],
    [19.076, 72.8777],
  ],

  // Delhi -> Agra -> Bhopal
  [
    [28.6139, 77.209],
    [27.1767, 78.0081],
    [25.2138, 75.8648],
    [23.2599, 77.4126],
  ],

  // Delhi -> Kanpur -> Prayagraj -> Kolkata
  [
    [28.6139, 77.209],
    [26.4499, 80.3319],
    [25.4358, 81.8463],
    [22.5726, 88.3639],
  ],
];

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

  const [trains, setTrains] = useState([]);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [networkData, setNetworkData] = useState(null);
  const [alertsData, setAlertsData] = useState([]);

  useEffect(() => {
    const loadTrainData = async () => {
      try {

        const [
          trainsResponse,
          eventsResponse,
          networkResponse,
          alertsResponse,
        ] = await Promise.all([
          getTrains(),
          getTrainEvents(),
          api.get("/operations/network"),
          api.get("/alerts"),
        ]);

        const backendTrains = trainsResponse.data;
        const backendEvents = eventsResponse.data;
        setAlertsData(alertsResponse.data);

        setNetworkData(networkResponse.data);

        const latestEvents = new Map();

        backendEvents.forEach((event) => {
          const trainId = String(event.trainId);

          if (!latestEvents.has(trainId)) {
            latestEvents.set(trainId, event);
          }
        });

        const mapTrains = backendTrains.map((train) => {
          const event = latestEvents.get(String(train._id));

          const currentStation =
            event?.station ||
            train.currentStation ||
            train.source;

          const station = stations.find(
            (item) => item.name === currentStation
          );

          return {
            number: train.trainNumber,
            name: train.trainName,
            type: train.trainType || "UNKNOWN",
            status:
              event?.delayMinutes > 0
                ? "DELAYED"
                : "RUNNING",
            speed: event?.speed || 0,
            delay: event?.delayMinutes || 0,
            currentStation,
            destination: train.destination,
            position: station?.position || [28.6139, 77.209],
          };
        });

        setTrains(mapTrains);

        if (mapTrains.length > 0) {
          setSelectedTrain(mapTrains[0]);
        }
      } catch (error) {
        console.error("Failed to load dashboard train data:", error);
      } 
    };

    loadTrainData();
  }, []);

  // ------------------------------------------------
  // SMALL LIVE MOVEMENT
  // ------------------------------------------------



  // ------------------------------------------------
  // KEEP SELECTED TRAIN UPDATED
  // ------------------------------------------------

  useEffect(() => {
    const updated = trains.find(
      (train) => train.number === selectedTrain?.number
    );

    if (updated) {
      setSelectedTrain(updated);
    }
  }, [trains]);

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

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">

        <StatCard
          title="Active Trains"
          value={networkData?.summary?.activeTrains ?? "--"}
          description="Currently operating"
        />

        <StatCard
          title="Delayed Trains"
          value={networkData?.summary?.delayedTrains ?? "--"}
          description="Need attention"
        />

        <StatCard
          title="Network Status"
          value={networkData?.networkStatus ?? "--"}
          description="Current network condition"
        />

        <StatCard
          title="Active Alerts"
          value={alertsData.length}
          description="Requires monitoring"
        />

      </div>

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

                {corridors.map((corridor, index) => (
                  <Polyline
                    key={index}
                    positions={corridor}
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

                {stations.map((station) => (
                  <CircleMarker
                    key={station.code}
                    center={station.position}
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

                {trains.map((train) => (

                  <Marker
                    key={train.number}
                    position={train.position}
                    icon={createTrainIcon(
                      train.status,
                      selectedTrain?.number === train.number
                    )}
                    eventHandlers={{
                      click: () => setSelectedTrain(train),
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

                  <span className="flex items-center gap-1 text-xs font-medium text-green-600">

                    <span className="h-2 w-2 rounded-full bg-green-500"></span>

                    LIVE

                  </span>

                </div>

                <p className="mt-1 text-xs text-slate-500">
                  Selected train details
                </p>

              </div>

              {/* SELECTED TRAIN */}

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
                      onClick={() => setSelectedTrain(train)}
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

            {alertsData.slice(0, 3).map((alert) => (
              <AlertItem
                key={alert._id}
                title={alert.message}
                time={new Date(alert.createdAt).toLocaleTimeString()}
              />
            ))}

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
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p className="mt-3 text-3xl font-bold text-slate-900">
        {value}
      </p>

      <p className="mt-2 text-sm text-slate-400">
        {description}
      </p>

    </div>
  );
}

// --------------------------------------------------
// ALERT
// --------------------------------------------------

function AlertItem({
  title,
  time,
}) {
  return (
    <div className="flex gap-3 rounded-xl bg-orange-50 p-3">

      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />

      <div>

        <p className="text-sm font-medium text-slate-700">
          {title}
        </p>

        <p className="mt-1 text-xs text-slate-400">
          {time}
        </p>

      </div>

    </div>
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