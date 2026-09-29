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
import { useEffect, useState } from "react";

import { getTrains } from "../services/trainService";
import { getTrainEvents } from "../services/trainEventService";

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
   STATIONS
   PHASE 3 STATIC DATA
========================================================= */

const stations = [
  {
    name: "New Delhi",
    code: "NDLS",
    position: [28.6139, 77.2090],
  },
  {
    name: "Gurugram",
    code: "GGN",
    position: [28.4595, 77.0266],
  },
  {
    name: "Rewari",
    code: "RE",
    position: [28.1990, 76.6190],
  },
  {
    name: "Jaipur",
    code: "JP",
    position: [26.9124, 75.7873],
  },
  {
    name: "Kota",
    code: "KOTA",
    position: [25.2138, 75.8648],
  },
  {
    name: "Agra",
    code: "AGC",
    position: [27.1767, 78.0081],
  },
  {
    name: "Bhopal",
    code: "BPL",
    position: [23.2599, 77.4126],
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
  {
    name: "Surat",
    code: "ST",
    position: [21.1702, 72.8311],
  },
  {
    name: "Vadodara",
    code: "BRC",
    position: [22.3072, 73.1812],
  },
  {
    name: "Mumbai Central",
    code: "MMCT",
    position: [19.0760, 72.8777],
  },
];


/* =========================================================
   RAILWAY CORRIDORS
========================================================= */

const corridors = [
  {
    id: "delhi-mumbai",
    name: "Delhi–Mumbai Main Corridor",
    positions: [
      [28.6139, 77.2090],
      [27.1767, 78.0081],
      [25.2138, 75.8648],
      [23.2599, 77.4126],
      [22.3072, 73.1812],
      [21.1702, 72.8311],
      [19.0760, 72.8777],
    ],
  },

  {
    id: "delhi-jaipur",
    name: "Delhi–Jaipur Corridor",
    positions: [
      [28.6139, 77.2090],
      [28.4595, 77.0266],
      [28.1990, 76.6190],
      [26.9124, 75.7873],
    ],
  },

  {
    id: "delhi-kolkata",
    name: "Delhi–Kolkata East Corridor",
    positions: [
      [28.6139, 77.2090],
      [27.1767, 78.0081],
      [26.4499, 80.3319],
      [25.4358, 81.8463],
      [22.5726, 88.3639],
    ],
  },

  {
    id: "jaipur-mumbai",
    name: "Jaipur–Mumbai Corridor",
    positions: [
      [26.9124, 75.7873],
      [25.2138, 75.8648],
      [23.2599, 77.4126],
      [22.3072, 73.1812],
      [21.1702, 72.8311],
      [19.0760, 72.8777],
    ],
  },
];


/* =========================================================
   TRAINS
========================================================= */
const trains = [
  {
    number: "17002",
    position: [25.2138, 75.8648],
    corridor: "delhi-mumbai",
  },
  {
    number: "16003",
    position: [25.2138, 75.8648],
    corridor: "delhi-mumbai",
  },
  {
    number: "16001",
    position: [28.6139, 77.2090],
    corridor: "delhi-mumbai",
  },
  {
    number: "12961",
    position: [21.1702, 72.8311],
    corridor: "delhi-mumbai",
  },
  {
    number: "12952",
    position: [25.2138, 75.8648],
    corridor: "delhi-mumbai",
  },
  {
    number: "12951",
    position: [21.1702, 72.8311],
    corridor: "delhi-mumbai",
  },
];

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
   MOVING TRAIN
========================================================= */

function MovingTrain({ train, index }) {
  const corridor = corridors.find(
    (item) => item.id === train.corridor
  );

  const [position, setPosition] = useState(train.position);

  useEffect(() => {
    if (train.status !== "RUNNING") {
      return;
    }

    let segment = index % (corridor.positions.length - 1);
    let progress = 0;

    const timer = setInterval(() => {
      progress += 0.008;

      if (progress >= 1) {
        progress = 0;
        segment =
          (segment + 1) %
          (corridor.positions.length - 1);
      }

      const start =
        corridor.positions[segment];

      const end =
        corridor.positions[segment + 1];

      const lat =
        start[0] +
        (end[0] - start[0]) *
        progress;

      const lng =
        start[1] +
        (end[1] - start[1]) *
        progress;

      setPosition([lat, lng]);
    }, 1000);

    return () => clearInterval(timer);
  }, [train.status, train.corridor, index]);

  return (
    <Marker
      position={position}
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
  const [backendMapTrains, setBackendMapTrains] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTrainData = async () => {
      try {
        const [trainsResponse, eventsResponse] = await Promise.all([
          getTrains(),
          getTrainEvents(),
        ]);

        const backendTrains = trainsResponse.data;
        const backendEvents = eventsResponse.data;

        const latestEvents = new Map();

        backendEvents.forEach((event) => {
          const trainId = String(event.trainId);

          if (!latestEvents.has(trainId)) {
            latestEvents.set(trainId, event);
          }
        });
        const mapTrains = backendTrains.map((train) => {
          const event = latestEvents.get(String(train._id));

          return {
            number: train.trainNumber,
            name: train.trainName,
            type: train.trainType || "UNKNOWN",
            status: train.status || "RUNNING",
            speed: event?.speed || 0,
            delay: event?.delayMinutes || 0,
            currentStation: event?.station || train.currentStation || "Unknown",
            destination: train.destination,
            eventLocation: event?.location || null,
          };
        });
        setBackendMapTrains(mapTrains);

      } catch (error) {
        console.error("Failed to load map data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTrainData();
  }, []);
  const updatedTrains = trains.map((train) => {
    const backendTrain = backendMapTrains.find(
      (item) => item.number === train.number
    );

    if (!backendTrain) {
      return train;
    }

    return {
      ...train,
      name: backendTrain.name,
      type: backendTrain.type,
      speed: backendTrain.speed,
      delay: backendTrain.delay,
      status: backendTrain.status,
      currentStation: backendTrain.currentStation,
      destination: backendTrain.destination,
    };
  });

  return (
    <div className="relative h-full w-full">

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

        {corridors.map((corridor) => (
          <Polyline
            key={corridor.id}
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

        {stations.map((station) => (
          <CircleMarker
            key={station.code}
            center={station.position}
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

        {updatedTrains.map((train, index) => (
          <MovingTrain
            key={train.number}
            train={train}
            index={index}
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

      </div>

    </div>
  );
}

export default NetworkMap;