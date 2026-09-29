import { useState } from "react";
import { planJourney } from "../services/journeyService";
import { getTrains } from "../services/trainService";

const journeys = [
  {
    trainNumber: "12951",
    trainName: "Mumbai Rajdhani",
    type: "EXPRESS",
    from: "New Delhi",
    to: "Mumbai Central",
    departure: "16:55",
    arrival: "08:35",
    duration: "15h 40m",
    status: "DELAYED",
    delay: 18,
    distance: "1,384 km",
    stations: [
      "New Delhi",
      "Gurugram",
      "Rewari",
      "Jaipur",
      "Kota",
      "Ratlam",
      "Vadodara",
      "Surat",
      "Mumbai Central",
    ],
  },
  {
    trainNumber: "12952",
    trainName: "Delhi Rajdhani",
    type: "EXPRESS",
    from: "Mumbai Central",
    to: "New Delhi",
    departure: "17:00",
    arrival: "08:32",
    duration: "15h 32m",
    status: "RUNNING",
    delay: 0,
    distance: "1,384 km",
    stations: [
      "Mumbai Central",
      "Surat",
      "Vadodara",
      "Ratlam",
      "Kota",
      "Jaipur",
      "Rewari",
      "Gurugram",
      "New Delhi",
    ],
  },
  {
    trainNumber: "12002",
    trainName: "Bhopal Shatabdi",
    type: "SUPERFAST",
    from: "New Delhi",
    to: "Bhopal",
    departure: "06:00",
    arrival: "14:00",
    duration: "8h 00m",
    status: "RUNNING",
    delay: 3,
    distance: "704 km",
    stations: [
      "New Delhi",
      "Agra",
      "Gwalior",
      "Jhansi",
      "Bhopal",
    ],
  },
];

function JourneyManagement() {
  const [from, setFrom] = useState("New Delhi");
  const [to, setTo] = useState("Mumbai Central");
  const [selectedJourney, setSelectedJourney] = useState(null);
  const [journeyOptions, setJourneyOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);

  const handleSearch = async () => {
    setSearchPerformed(true);
    try {
      setLoading(true);

      const [journeyResponse, trainsResponse] = await Promise.all([
        planJourney({
          source: from,
          destination: to,
          date: new Date().toISOString(),
        }),
        getTrains(),
      ]);

      const options = journeyResponse.data.options || [];
      const backendTrains = trainsResponse.data || [];

      const enrichedOptions = options.map((option) => {
        const train = backendTrains.find(
          (item) => item.trainNumber === option.trainNumber
        );

        return {
          ...option,
          type: train?.trainType || "--",
          status: train?.status || "RUNNING",
          stations: option.stations || [],
          departure:
            train?.route?.find(
              (routeItem) => routeItem.station === option.source
            )?.scheduledDeparture || "--",
          arrival:
            train?.route?.find(
              (routeItem) => routeItem.station === option.destination
            )?.scheduledArrival || "--",
          delay: option.currentDelay ?? 0,
          from: option.source,
          to: option.destination,
        };
      });

      setJourneyOptions(enrichedOptions);

      if (enrichedOptions.length > 0) {
        setSelectedJourney(enrichedOptions[0]);
      } else {
        setSelectedJourney(null);
      }

    } catch (error) {
      console.error("Failed to plan journey:", error);
      setJourneyOptions([]);
      setSelectedJourney(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 p-8">

      {/* HEADER */}

      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Journey Management
        </h1>

        <p className="mt-2 text-slate-500">
          Plan and monitor train journeys across the railway network.
        </p>
      </div>


      {/* SEARCH */}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <h2 className="text-lg font-semibold text-slate-900">
          Plan Journey
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Select origin and destination to view available journeys.
        </p>


        <div className="mt-6 grid gap-4 md:grid-cols-3">

          {/* FROM */}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">
              From
            </label>

            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            >
              <option>New Delhi</option>
              <option>Mumbai Central</option>
              <option>Agra</option>
              <option>Jaipur</option>
              <option>Kota</option>
              <option>Bhopal</option>
            </select>
          </div>


          {/* TO */}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">
              To
            </label>

            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            >
              <option>Mumbai Central</option>
              <option>New Delhi</option>
              <option>Bhopal</option>
              <option>Agra</option>
              <option>Jaipur</option>
              <option>Kota</option>
            </select>
          </div>


          {/* BUTTON */}

          <div className="flex items-end">

            <button
              onClick={handleSearch}
              disabled={loading}
              className="w-full rounded-lg bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Searching..." : "Search Journey"}
            </button>

          </div>

        </div>

      </div>


      {/* JOURNEY RESULT */}

      {!searchPerformed ? null : !selectedJourney ? (

        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">

          <p className="text-lg font-semibold text-slate-700">
            No journey found
          </p>

          <p className="mt-2 text-sm text-slate-400">
            Try selecting a different origin and destination.
          </p>

        </div>

      ) : (

        <>

          {/* JOURNEY CARD */}

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex flex-col gap-4 border-b border-slate-200 p-6 md:flex-row md:items-start md:justify-between">

              <div>

                <div className="flex flex-wrap items-center gap-3">

                  <h2 className="text-xl font-bold text-slate-900">
                    {selectedJourney.trainName}
                  </h2>

                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    #{selectedJourney.trainNumber}
                  </span>

                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {selectedJourney.type}
                  </span>

                </div>

                <p className="mt-2 text-sm text-slate-500">
                  {selectedJourney.from} → {selectedJourney.to}
                </p>

              </div>


              <StatusBadge status={selectedJourney.status} />

            </div>


            {/* JOURNEY METRICS */}

            <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">

              <JourneyMetric
                label="Departure"
                value={selectedJourney.departure}
              />

              <JourneyMetric
                label="Arrival"
                value={selectedJourney.arrival}
              />

              <JourneyMetric
                label="Duration"
                value={selectedJourney.duration}
              />

              <JourneyMetric
                label="Distance"
                value={`${selectedJourney.distance} km`}
              />

            </div>

          </div>


          {/* LOWER SECTION */}

          <div className="grid gap-6 lg:grid-cols-3">


            {/* TIMELINE */}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">

              <h2 className="text-lg font-semibold text-slate-900">
                Journey Timeline
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Major stations along the selected journey.
              </p>


              <div className="mt-7">

                {(selectedJourney.stations || []).map((station, index) => {

                  const isFirst = index === 0;
                  const isLast =
                    index === (selectedJourney.stations || []).length - 1;

                  const isCurrent =
                    selectedJourney.status === "DELAYED"
                      ? station === "Surat"
                      : index === 3;

                  return (

                    <div
                      key={station}
                      className="relative flex gap-4"
                    >

                      {/* LINE */}

                      {!isLast && (

                        <div className="absolute left-[9px] top-5 h-full w-0.5 bg-slate-200" />

                      )}


                      {/* DOT */}

                      <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center">

                        <span
                          className={`
                              h-3
                              w-3
                              rounded-full
                              border-2
                              ${isCurrent
                              ? "border-orange-500 bg-orange-500 ring-4 ring-orange-100"
                              : isFirst || isLast
                                ? "border-orange-500 bg-white"
                                : "border-slate-300 bg-white"
                            }
                            `}
                        />

                      </div>


                      {/* STATION */}

                      <div className="pb-7">

                        <p
                          className={`
                              text-sm
                              ${isCurrent
                              ? "font-bold text-orange-600"
                              : isFirst || isLast
                                ? "font-semibold text-slate-800"
                                : "text-slate-600"
                            }
                            `}
                        >
                          {station}
                        </p>

                        {isCurrent && (

                          <p className="mt-1 text-xs font-medium text-orange-500">
                            Current location
                          </p>

                        )}

                        {isFirst && (

                          <p className="mt-1 text-xs text-slate-400">
                            Origin
                          </p>

                        )}

                        {isLast && (

                          <p className="mt-1 text-xs text-slate-400">
                            Destination
                          </p>

                        )}

                      </div>

                    </div>

                  );
                }
                )}

              </div>

            </div>


            {/* SUMMARY */}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

              <h2 className="text-lg font-semibold text-slate-900">
                Journey Summary
              </h2>

              <div className="mt-6 space-y-5">

                <SummaryItem
                  label="Train"
                  value={selectedJourney.trainNumber}
                />

                <SummaryItem
                  label="Origin"
                  value={selectedJourney.from}
                />

                <SummaryItem
                  label="Destination"
                  value={selectedJourney.to}
                />

                <SummaryItem
                  label="Stations"
                  value={`${(selectedJourney.stations || []).length} stops`}
                />

                <SummaryItem
                  label="Distance"
                  value={`${selectedJourney.distance} km`}
                />

                <SummaryItem
                  label="Delay"
                  value={
                    selectedJourney.delay > 0
                      ? `+${selectedJourney.delay} min`
                      : "On Time"
                  }
                  danger={selectedJourney.delay > 0}
                />

              </div>


              <div className="mt-7 rounded-xl bg-orange-50 p-4">

                <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                  Operational Status
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedJourney.status === "DELAYED"
                    ? `Train is currently running ${selectedJourney.delay} minutes behind schedule.`
                    : "Train is currently operating normally."}
                </p>

              </div>

            </div>

          </div>

        </>

      )}

    </div>
  );
}


/* =========================================================
   JOURNEY METRIC
========================================================= */

function JourneyMetric({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">

      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-3 text-xl font-bold text-slate-900">
        {value}
      </p>

    </div>
  );
}


/* =========================================================
   SUMMARY ITEM
========================================================= */

function SummaryItem({
  label,
  value,
  danger = false,
}) {
  return (
    <div className="flex items-center justify-between gap-4">

      <span className="text-sm text-slate-500">
        {label}
      </span>

      <span
        className={`text-sm font-semibold ${danger
          ? "text-red-600"
          : "text-slate-800"
          }`}
      >
        {value}
      </span>

    </div>
  );
}


/* =========================================================
   STATUS BADGE
========================================================= */

function StatusBadge({ status }) {

  const isDelayed = status === "DELAYED";

  return (
    <span
      className={`
        inline-flex
        items-center
        gap-2
        rounded-full
        px-3
        py-1.5
        text-xs
        font-semibold
        ${isDelayed
          ? "bg-red-100 text-red-700"
          : "bg-green-100 text-green-700"
        }
      `}
    >

      <span
        className={`
          h-2
          w-2
          rounded-full
          ${isDelayed
            ? "bg-red-500"
            : "bg-green-500"
          }
        `}
      />

      {status}

    </span>
  );
}


export default JourneyManagement;