import { useCallback, useEffect, useMemo, useState } from "react";
import { getTrains } from "../services/trainService";
import PageHeader from "../components/ui/PageHeader";
import Badge from "../components/ui/Badge";
import ErrorState from "../components/state/ErrorState";
import EmptyState from "../components/state/EmptyState";
import { SkeletonStats, SkeletonTable } from "../components/ui/Skeleton";


function Trains() {
  const [trains, setTrains] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [loading, setLoading] = useState(true);
  // UI-4 needs to show when this page last heard from the API and to let the
  // user ask again. The request itself is unchanged -- the same
  // `getTrains()` call, in the same effect. The loader is lifted out of the
  // effect only so the refresh button can call it, and `updatedAt` records
  // when it finished.
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loadError, setLoadError] = useState("");

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("ALL");
  }, []);

  const loadTrains = useCallback(async () => {
    setLoading(true);

    try {
      const response = await getTrains();
      setTrains(response.data);
      setLoadError("");
      setUpdatedAt(new Date());
    } catch (error) {
      console.error("Failed to load trains:", error);
      setLoadError("Could not load trains.");
    } finally {
      setLoading(false);
    }
  }, []);

  // The first load stays an inline async function inside the effect, which
  // is the shape this file already used and the one
  // react-hooks/set-state-in-effect accepts: calling a setState-bearing
  // function from the effect body is flagged regardless of any await
  // inside it. `loadTrains` above serves the refresh button.
  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const response = await getTrains();
        if (!alive) return;

        setTrains(response.data);
        setLoadError("");
        setUpdatedAt(new Date());
      } catch (error) {
        console.error("Failed to load trains:", error);
        if (alive) setLoadError("Could not load trains.");
      } finally {
        if (alive) setLoading(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
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

  if (loading && trains.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Trains"
          subtitle="Monitor and manage trains across the railway network."
        />
        <SkeletonStats count={4} />
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SkeletonTable rows={6} columns={5} />
        </div>
      </div>
    );
  }

  if (loadError && trains.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Trains"
          subtitle="Monitor and manage trains across the railway network."
        />
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ErrorState
            message={loadError}
            hint="Check that the API is running, then try again."
            onRetry={loadTrains}
            retrying={loading}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      <PageHeader
        title="Trains"
        subtitle="Monitor and manage trains across the railway network."
        updatedAt={updatedAt}
        onRefresh={loadTrains}
        refreshing={loading}
      />


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
                className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
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

        {/* CARDS -- below md only. Same data, same `filteredTrains`, same
            click target; a 1000px table on a 360px screen is not a table,
            it is a drag. */}
        <div className="divide-y divide-slate-100 md:hidden">
          {filteredTrains.length > 0 ? (
            filteredTrains.map((train) => (
              <button
                key={train.trainNumber}
                type="button"
                onClick={() => setSelectedTrain(train)}
                className={`rp-press block w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 ${selectedTrain?.trainNumber === train.trainNumber ? "bg-orange-50/50" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{train.trainName}</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-600">
                      #{train.trainNumber}
                      {train.trainType ? ` \u00b7 ${train.trainType}` : ""}
                    </p>
                  </div>

                  <Badge status={train.status} />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div>
                    <dt className="text-xs text-slate-600">Route</dt>
                    <dd className="m-0 truncate font-medium text-slate-800">
                      {train.source} &rarr; {train.destination}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-slate-600">At</dt>
                    <dd className="m-0 truncate font-medium text-slate-800">
                      {train.currentStation || "Not recorded"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-slate-600">Type</dt>
                    <dd className="m-0 font-medium text-slate-800">
                      {train.trainType || "--"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-slate-600">Speed and delay</dt>
                    <dd className="m-0 font-medium text-slate-600">Not on this endpoint</dd>
                  </div>
                </dl>
              </button>
            ))
          ) : (
            <EmptyState
              title="No train matches these filters"
              hint="Clear the search box and set the status filter back to All."
              icon="\u2205"
              className="p-8"
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">

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
                  Speed and delay
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

                        <p className="mt-1 text-xs text-slate-500">
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

                        <p className="my-1 text-xs text-slate-500">
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

                        {/* GET /api/trains carries neither `speed` nor
                            `delay` -- both live on TrainEvent, which this
                            page does not read. This cell used to render
                            "undefined km/h", and the delay line below it
                            could never appear, so every train read as on
                            time next to whatever its status badge said. */}
                        <p className="text-sm text-slate-600">
                          Not on this endpoint
                        </p>

                      </div>

                    </td>


                    {/* STATUS */}

                    <td className="px-5 py-4">

                      <Badge status={train.status} />

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

                  <td colSpan="7" className="px-5 py-4">

                    <EmptyState
                      title="No train matches these filters"
                      hint={`${trains.length} ${trains.length === 1 ? "train is" : "trains are"} loaded; none of them match the current search and status.`}
                      icon="\u2205"
                      className="py-8"
                      actionLabel="Clear filters"
                      onAction={clearFilters}
                    />

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

          <p className="text-xs text-slate-500">
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

              <p className="text-sm font-medium text-slate-500">
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

              <Badge status={selectedTrain.status} />

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

            {/* Same gap as the table: neither figure is on /api/trains.
                "On time" here was not a measurement, it was the `else`
                branch of a comparison against undefined. */}
            <DetailItem
              label="Speed"
              value="Not on this endpoint"
            />

            <DetailItem
              label="Delay"
              value="Not on this endpoint"
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

      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
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

      <p className="mt-2 text-sm text-slate-500">
        {description}
      </p>

    </div>

  );
}


/* =========================================================
   STATUS BADGE
========================================================= */



export default Trains;