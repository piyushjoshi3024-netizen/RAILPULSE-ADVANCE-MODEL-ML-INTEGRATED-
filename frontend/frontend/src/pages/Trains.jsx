import { useEffect, useMemo, useState } from "react";
import { getTrains } from "../services/trainService";


function Trains() {
  const [trains, setTrains] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTrains = async () => {
      try {
        const response = await getTrains();
        setTrains(response.data);
      } catch (error) {
        console.error("Failed to load trains:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTrains();
  }, []);


  const filteredTrains = useMemo(() => {
    return trains.filter((train) => {
      const searchText = search.toLowerCase();

      const matchesSearch =
        train.trainNumber.toLowerCase().includes(searchText) ||
        train.trainName.toLowerCase().includes(searchText) ||
        train.currentStation.toLowerCase().includes(searchText);

      const matchesStatus =
        statusFilter === "ALL" || train.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [trains, search, statusFilter]);

  const totalTrains = trains.length;

  const runningTrains = trains.filter(
    (train) => train.status === "RUNNING"
  ).length;

  const delayedTrains = trains.filter(
    (train) => train.status === "DELAYED"
  ).length;

  const stationTrains = trains.filter(
    (train) => train.status === "AT STATION"
  ).length;

  if (loading) {
    return <div>Loading trains...</div>;
  }

  return (
    <div className="space-y-8 p-8">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Trains
        </h1>

        <p className="mt-2 text-slate-500">
          Monitor and manage trains across the railway network.
        </p>
      </div>


      {/* =====================================================
          SUMMARY CARDS
      ===================================================== */}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">

        <SummaryCard
          title="Total Trains"
          value={totalTrains}
          description="Tracked across network"
        />

        <SummaryCard
          title="Running"
          value={runningTrains}
          description="Currently operating"
          indicator="green"
        />

        <SummaryCard
          title="Delayed"
          value={delayedTrains}
          description="Requires attention"
          indicator="red"
        />

        <SummaryCard
          title="At Station"
          value={stationTrains}
          description="Currently stationed"
          indicator="orange"
        />

      </div>


      {/* =====================================================
          TRAIN MANAGEMENT CARD
      ===================================================== */}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        {/* TOP BAR */}

        <div className="border-b border-slate-200 p-5">

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

            {/* SEARCH */}

            <div className="relative w-full lg:max-w-md">

              <svg
                className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                />
              </svg>

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search train number, name or station..."
                className="
                  w-full
                  rounded-lg
                  border
                  border-slate-200
                  bg-slate-50
                  py-2.5
                  pl-10
                  pr-4
                  text-sm
                  outline-none
                  transition
                  focus:border-orange-400
                  focus:bg-white
                  focus:ring-2
                  focus:ring-orange-100
                "
              />

            </div>


            {/* FILTER */}

            <div className="flex flex-wrap gap-2">

              {[
                "ALL",
                "RUNNING",
                "DELAYED",
                "AT STATION",
              ].map((status) => (

                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`
                    rounded-lg
                    px-3
                    py-2
                    text-xs
                    font-semibold
                    transition
                    ${statusFilter === status
                      ? "bg-orange-500 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }
                  `}
                >
                  {status === "ALL"
                    ? "All"
                    : status
                      .toLowerCase()
                      .replace(/\b\w/g, (char) =>
                        char.toUpperCase()
                      )}
                </button>

              ))}

            </div>

          </div>

        </div>


        {/* ===================================================
            TABLE
        =================================================== */}

        <div className="overflow-x-auto">

          <table className="w-full min-w-[1000px]">

            <thead className="bg-slate-50">

              <tr className="border-b border-slate-200">

                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Train
                </th>

                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Type
                </th>

                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Route
                </th>

                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Current Station
                </th>

                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Speed
                </th>

                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>

                <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Action
                </th>

              </tr>

            </thead>


            <tbody className="divide-y divide-slate-100">

              {filteredTrains.length > 0 ? (

                filteredTrains.map((train) => (

                  <tr
                    key={train.trainNumber}
                    className={`
                      transition
                      hover:bg-slate-50
                      ${selectedTrain?.trainNumber === train.trainNumber
                        ? "bg-orange-50/50"
                        : ""
                      }
                    `}
                  >

                    {/* TRAIN */}

                    <td className="px-5 py-4">

                      <div>

                        <p className="font-semibold text-slate-900">
                          {train.trainName}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          #{train.trainNumber}
                        </p>

                      </div>

                    </td>


                    {/* TYPE */}

                    <td className="px-5 py-4">

                      <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {train.trainType}
                      </span>

                    </td>


                    {/* ROUTE */}

                    <td className="px-5 py-4">

                      <div className="text-sm">

                        <p className="font-medium text-slate-700">
                          {train.source}
                        </p>

                        <p className="my-1 text-xs text-slate-400">
                          ↓
                        </p>

                        <p className="font-medium text-slate-700">
                          {train.destination}
                        </p>

                      </div>

                    </td>


                    {/* CURRENT */}

                    <td className="px-5 py-4">

                      <p className="text-sm font-medium text-slate-700">
                        {train.currentStation}
                      </p>

                    </td>


                    {/* SPEED */}

                    <td className="px-5 py-4">

                      <div>

                        <p className="text-sm font-semibold text-slate-700">
                          {train.speed} km/h
                        </p>

                        {train.delay > 0 && (

                          <p className="mt-1 text-xs text-red-500">
                            +{train.delay} min delay
                          </p>

                        )}

                      </div>

                    </td>


                    {/* STATUS */}

                    <td className="px-5 py-4">

                      <StatusBadge status={train.status} />

                    </td>


                    {/* ACTION */}

                    <td className="px-5 py-4 text-right">

                      <button
                        onClick={() => setSelectedTrain(train)}
                        className="
                          rounded-lg
                          border
                          border-slate-200
                          px-3
                          py-2
                          text-xs
                          font-semibold
                          text-slate-600
                          transition
                          hover:border-orange-300
                          hover:bg-orange-50
                          hover:text-orange-600
                        "
                      >
                        View
                      </button>

                    </td>

                  </tr>

                ))

              ) : (

                <tr>

                  <td
                    colSpan="7"
                    className="px-5 py-12 text-center"
                  >

                    <p className="font-medium text-slate-600">
                      No trains found
                    </p>

                    <p className="mt-1 text-sm text-slate-400">
                      Try changing your search or filter.
                    </p>

                  </td>

                </tr>

              )}

            </tbody>

          </table>

        </div>


        {/* ===================================================
            FOOTER
        =================================================== */}

        <div className="border-t border-slate-100 px-5 py-3">

          <p className="text-xs text-slate-400">
            Showing {filteredTrains.length} of {totalTrains} trains
          </p>

        </div>

      </div>


      {/* =====================================================
          SELECTED TRAIN DETAILS
      ===================================================== */}

      {selectedTrain && (

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          {/* HEADER */}

          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <p className="text-sm font-medium text-slate-400">
                Selected Train
              </p>

              <h2 className="mt-1 text-xl font-bold text-slate-900">
                {selectedTrain.trainName}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Train #{selectedTrain.trainNumber}
              </p>

            </div>


            <div className="flex items-center gap-3">

              <StatusBadge status={selectedTrain.status} />

              <button
                onClick={() => setSelectedTrain(null)}
                className="
                  rounded-lg
                  border
                  border-slate-200
                  px-3
                  py-2
                  text-sm
                  font-medium
                  text-slate-600
                  transition
                  hover:bg-slate-50
                "
              >
                Close
              </button>

            </div>

          </div>


          {/* DETAILS */}

          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">

            <DetailItem
              label="Train Type"
              value={selectedTrain.trainType}
            />

            <DetailItem
              label="Current Station"
              value={selectedTrain.currentStation}
            />

            <DetailItem
              label="Speed"
              value={`${selectedTrain.speed} km/h`}
            />

            <DetailItem
              label="Delay"
              value={
                selectedTrain.delay > 0
                  ? `+${selectedTrain.delay} min`
                  : "On time"
              }
              danger={selectedTrain.delay > 0}
            />

            <DetailItem
              label="Source"
              value={selectedTrain.source}
            />

            <DetailItem
              label="Destination"
              value={selectedTrain.destination}
            />

          </div>


          {/* ROUTE */}

          <div className="border-t border-slate-100 px-6 py-5">

            <p className="text-sm font-semibold text-slate-700">
              Current Route
            </p>

            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">

              {/* SOURCE */}

              <div className="flex items-center gap-2">

                <span className="h-3 w-3 shrink-0 rounded-full bg-slate-400" />

                <span className="text-sm font-medium text-slate-700">
                  {selectedTrain.source}
                </span>

              </div>


              {/* LINE */}

              <div className="hidden h-px flex-1 bg-slate-200 sm:block" />


              {/* CURRENT */}

              <div className="flex items-center gap-2 rounded-full bg-orange-50 px-3 py-2">

                <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />

                <span className="text-xs font-semibold text-orange-600">
                  {selectedTrain.currentStation}
                </span>

              </div>


              {/* LINE */}

              <div className="hidden h-px flex-1 bg-slate-200 sm:block" />


              {/* DESTINATION */}

              <div className="flex items-center gap-2">

                <span className="h-3 w-3 shrink-0 rounded-full bg-slate-900" />

                <span className="text-sm font-medium text-slate-700">
                  {selectedTrain.destination}
                </span>

              </div>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}


/* =========================================================
   DETAIL ITEM
========================================================= */

function DetailItem({
  label,
  value,
  danger = false,
}) {
  return (

    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">

      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p
        className={`
          mt-2
          text-sm
          font-semibold
          ${danger ? "text-red-600" : "text-slate-800"}
        `}
      >
        {value}
      </p>

    </div>

  );
}


/* =========================================================
   SUMMARY CARD
========================================================= */

function SummaryCard({
  title,
  value,
  description,
  indicator,
}) {
  const indicatorClasses = {
    green: "bg-green-500",
    red: "bg-red-500",
    orange: "bg-orange-500",
  };

  return (

    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

      <div className="flex items-center justify-between">

        <p className="text-sm font-medium text-slate-500">
          {title}
        </p>

        {indicator && (

          <span
            className={`
              h-2.5
              w-2.5
              rounded-full
              ${indicatorClasses[indicator]}
            `}
          />

        )}

      </div>

      <p className="mt-3 text-3xl font-bold text-slate-900">
        {value}
      </p>

      <p className="mt-2 text-sm text-slate-400">
        {description}
      </p>

    </div>

  );
}


/* =========================================================
   STATUS BADGE
========================================================= */

function StatusBadge({ status }) {

  const styles = {
    RUNNING: "bg-green-100 text-green-700",
    DELAYED: "bg-red-100 text-red-700",
    "AT STATION": "bg-orange-100 text-orange-700",
    CANCELLED: "bg-slate-100 text-slate-600",
  };

  const dotStyles = {
    RUNNING: "bg-green-500",
    DELAYED: "bg-red-500",
    "AT STATION": "bg-orange-500",
    CANCELLED: "bg-slate-500",
  };

  return (

    <span
      className={`
        inline-flex
        items-center
        gap-1.5
        rounded-full
        px-2.5
        py-1
        text-xs
        font-semibold
        ${styles[status] || "bg-slate-100 text-slate-600"}
      `}
    >

      <span
        className={`
          h-1.5
          w-1.5
          rounded-full
          ${dotStyles[status] || "bg-slate-500"}
        `}
      />

      {status}

    </span>

  );

}


export default Trains;