import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getTrainETA } from "../services/etaService";

import { useNetworkSummary, useTrainEvents, useTrains } from "../hooks";
import Loading from "../components/state/Loading";
import EmptyState from "../components/state/EmptyState";
import ErrorState from "../components/state/ErrorState";
const trains = [
  {
    trainNumber: "12951",
    trainName: "Mumbai Rajdhani",
    type: "EXPRESS",
    current: "Surat",
    destination: "Mumbai Central",
    source: "New Delhi",
    speed: 82,
    delay: 18,
    estimatedArrival: "22:45",
    confidence: 94,
    traffic: "Medium",
    status: "DELAYED",
    progress: 72,
    stations: [
      { name: "New Delhi", completed: true },
      { name: "Rewari", completed: true },
      { name: "Jaipur", completed: true },
      { name: "Kota", completed: true },
      { name: "Ratlam", completed: true },
      { name: "Surat", current: true },
      { name: "Mumbai Central", completed: false },
    ],
  },

  {
    trainNumber: "12952",
    trainName: "Mumbai Rajdhani",
    type: "EXPRESS",
    current: "Jhansi",
    destination: "Mumbai Central",
    source: "New Delhi",
    speed: 82,
    delay: 0,
    estimatedArrival: "06:20",
    confidence: 97,
    traffic: "Low",
    status: "RUNNING",
    progress: 48,
    stations: [
      { name: "New Delhi", completed: true },
      { name: "Agra", completed: true },
      { name: "Gwalior", completed: true },
      { name: "Jhansi", current: true },
      { name: "Bhopal", completed: false },
      { name: "Kota", completed: false },
      { name: "Mumbai Central", completed: false },
    ],
  },

  {
    trainNumber: "12002",
    trainName: "Bhopal Shatabdi",
    type: "SUPERFAST",
    current: "Agra",
    destination: "Bhopal",
    source: "New Delhi",
    speed: 96,
    delay: 3,
    estimatedArrival: "20:35",
    confidence: 91,
    traffic: "Medium",
    status: "RUNNING",
    progress: 54,
    stations: [
      { name: "New Delhi", completed: true },
      { name: "Agra", current: true },
      { name: "Gwalior", completed: false },
      { name: "Jhansi", completed: false },
      { name: "Bhopal", completed: false },
    ],
  },

  {
    trainNumber: "12301",
    trainName: "Howrah Rajdhani",
    type: "EXPRESS",
    current: "Kanpur",
    destination: "Howrah",
    source: "New Delhi",
    speed: 74,
    delay: 12,
    estimatedArrival: "07:15",
    confidence: 89,
    traffic: "High",
    status: "DELAYED",
    progress: 39,
    stations: [
      { name: "New Delhi", completed: true },
      { name: "Kanpur", current: true },
      { name: "Prayagraj", completed: false },
      { name: "Varanasi", completed: false },
      { name: "Gaya", completed: false },
      { name: "Howrah", completed: false },
    ],
  },
];

function ETAPrediction() {
  // This defaulted to the hardcoded "12951", a train number that belongs to
  // the demo array this page no longer renders and that the database does not
  // have. The display fell back to the first real train, but Predict ETA
  // looked up "12951" strictly, found nothing, logged to the console and did
  // nothing at all -- a button that looked enabled and never worked. The
  // selection is empty until chosen, and the effective train is derived.
  // The map's "View ETA" button links here as /eta?train=12621, so a train
  // picked on the map is the one this page opens on. The parameter is only
  // the initial selection -- once the user picks another train from the
  // list, their choice wins and the URL is not fought over.
  const [searchParams] = useSearchParams();
  const [selectedNumber, setSelectedNumber] = useState(
    () => searchParams.get("train") || ""
  );
  const [predictionGenerated, setPredictionGenerated] = useState(false);
  const [etaData, setEtaData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [predictionError, setPredictionError] = useState("");

  const trainsResource = useTrains();
  const eventsResource = useTrainEvents();
  const networkResource = useNetworkSummary();

  const backendTrains = trainsResource.trains;
  const trainEvents = eventsResource.events;

  const selectedTrain =
    backendTrains.find(
      (train) => train.trainNumber === selectedNumber
    ) || backendTrains[0];

  // What the button acts on: whatever the page is actually showing.
  const effectiveNumber = selectedTrain?.trainNumber || "";
  const selectedTrainEvent = trainEvents.find(
    (event) => String(event.trainId) === String(selectedTrain?._id)
  );
 

  const routeStations =
    selectedTrain?.route?.map((routeItem) => ({
      name: routeItem.station,
      completed:
        routeItem.station === selectedTrain.currentStation
          ? false
          : routeItem.sequence <
          (selectedTrain.route.find(
            (item) => item.station === selectedTrain.currentStation
          )?.sequence || 0),
      current: routeItem.station === selectedTrain.currentStation,
    })) || [];

  const currentRouteIndex = selectedTrain?.route?.findIndex(
    (routeItem) => routeItem.station === selectedTrainEvent?.station
  );

  const routeProgress =
    selectedTrain?.route?.length > 1 && currentRouteIndex >= 0
      ? Math.round(
        (currentRouteIndex / (selectedTrain.route.length - 1)) * 100
      )
      : 0;

  const handlePrediction = async () => {
    try {
      setLoading(true);
      setPredictionGenerated(false);

      setPredictionError("");

      const train = backendTrains.find(
        (item) => item.trainNumber === effectiveNumber
      );

      if (!train) {
        setPredictionError("Choose a train before predicting an arrival.");
        return;
      }

      const response = await getTrainETA(train._id);

      setEtaData(response.data);
      setPredictionGenerated(true);
    } catch (error) {
      // The failure now reaches the screen. It used to go to the console only,
      // so a failed prediction looked identical to never having pressed it.
      setPredictionError(
        error.response?.data?.message ||
        error.message ||
        "The arrival estimate could not be produced."
      );
    } finally {
      setLoading(false);
    }
  };
  if (trainsResource.loading) {
    return <Loading label="Loading trains..." />;
  }

  if (trainsResource.error) {
    return (
      <ErrorState
        message={trainsResource.error}
        onRetry={trainsResource.refetch}
      />
    );
  }

  if (backendTrains.length === 0) {
    return (
      <EmptyState
        title="No trains to predict for"
        hint="The API has no trains stored in this environment."
        icon="\u2014"
      />
    );
  }
  return (
    <div className="space-y-8 p-8">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          ETA Prediction
        </h1>

        <p className="mt-2 text-slate-500">
          Predict train arrival times using current operational data.
        </p>

        {etaData && <ModelStatusBadge eta={etaData} />}
      </div>


      {/* =====================================================
          SELECT TRAIN
      ===================================================== */}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">

          <div className="w-full lg:max-w-md">

            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Select Train
            </label>

            <select
              value={effectiveNumber}
              onChange={(e) => {
                setSelectedNumber(e.target.value);
                setPredictionGenerated(false);
                setEtaData(null);
              }}
              className="
                w-full
                rounded-lg
                border
                border-slate-200
                bg-white
                px-4
                py-3
                text-sm
                text-slate-700
                outline-none
                transition
                focus:border-orange-400
                focus:ring-2
                focus:ring-orange-100
              "
            >
              {backendTrains.map((train) => (
                <option
                  key={train.trainNumber}
                  value={train.trainNumber}
                >
                  {train.trainNumber} — {train.trainName}
                </option>
              ))}
            </select>

          </div>


          <button
            onClick={handlePrediction}
            disabled={loading || !effectiveNumber}
            className="
              rounded-lg
              bg-orange-500
              px-6
              py-3
              text-sm
              font-semibold
              text-white
              shadow-sm
              transition
              hover:bg-orange-600
              active:scale-[0.98]
              disabled:bg-orange-300
            "
          >
            {loading ? "Predicting..." : "Predict ETA"}
          </button>

        </div>

        {predictionError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {predictionError}
          </div>
        )}

      </div>


      {/* =====================================================
          MAIN TRAIN CARD
      ===================================================== */}

      {predictionGenerated && (

        <>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            {/* HEADER */}

            <div className="flex flex-col gap-4 border-b border-slate-200 p-6 sm:flex-row sm:items-start sm:justify-between">

              <div>

                <div className="flex flex-wrap items-center gap-3">

                  <h2 className="text-xl font-bold text-slate-900">
                    {selectedTrain.trainName}
                  </h2>

                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    #{selectedTrain.trainNumber}
                  </span>

                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {selectedTrain.type}
                  </span>

                </div>

                <p className="mt-2 text-sm text-slate-500">
                  {selectedTrain.source} → {selectedTrain.destination}
                </p>

              </div>


              <StatusBadge status={selectedTrain.status} />

            </div>


            {/* =================================================
                KEY METRICS
            ================================================= */}

            <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">

              <MetricCard
                label="Current Location"
                value={selectedTrainEvent?.station || "--"}
              />

              <MetricCard
                label="Current Speed"
                value={
                  selectedTrainEvent
                    ? `${selectedTrainEvent.speed} km/h`
                    : "--"
                }
              />

              <MetricCard
                label="Current Delay"
                value={
                  selectedTrainEvent?.delayMinutes > 0
                    ? `+${selectedTrainEvent.delayMinutes} min`
                    : "On Time"
                }
                danger={selectedTrainEvent?.delayMinutes > 0}
              />

              <MetricCard
                label="Estimated Arrival"
                value={
                  etaData
                    ? new Date(etaData.predictedEta).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                    : "--"
                }
                highlight
              />

            </div>

          </div>


          {/* =================================================
              ROUTE PROGRESS
          ================================================= */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="flex items-center justify-between">

              <div>

                <h2 className="text-lg font-semibold text-slate-900">
                  Route Progress
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Current journey progress
                </p>

              </div>

              <span className="text-sm font-bold text-orange-500">
                {routeProgress}%
              </span>

            </div>


            {/* PROGRESS BAR */}

            <div className="mt-7">

              <div className="relative h-2 rounded-full bg-slate-100">

                <div
                  className="absolute left-0 top-0 h-2 rounded-full bg-orange-500 transition-all duration-500"
                  style={{
                    width: `${routeProgress}%`,
                  }}
                />

                <div
                  className="
                    absolute
                    top-1/2
                    h-5
                    w-5
                    -translate-y-1/2
                    rounded-full
                    border-4
                    border-white
                    bg-orange-500
                    shadow-md
                  "
                  style={{
                    left: `calc(${routeProgress}% - 10px)`,
                  }}
                />

              </div>


              {/* STATIONS */}

              <div className="mt-5 flex justify-between gap-3 overflow-x-auto pb-2">

                {routeStations.map((station, index) => (

                  <div
                    key={`${station.name}-${index}`}
                    className="min-w-max text-center"
                  >

                    <div className="flex justify-center">

                      <span
                        className={`
                          h-3
                          w-3
                          rounded-full
                          border-2
                          ${station.current
                            ? "border-orange-500 bg-orange-500 ring-4 ring-orange-100"
                            : station.completed
                              ? "border-green-500 bg-green-500"
                              : "border-slate-300 bg-white"
                          }
                        `}
                      />

                    </div>

                    <p
                      className={`
                        mt-2
                        text-xs
                        ${station.current
                          ? "font-bold text-orange-600"
                          : station.completed
                            ? "font-medium text-slate-600"
                            : "text-slate-400"
                        }
                      `}
                    >
                      {station.name}
                    </p>

                    {station.current && (

                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-orange-500">
                        Current
                      </p>

                    )}

                  </div>

                ))}

              </div>

            </div>

          </div>


          {/* =================================================
              PREDICTION ANALYSIS
          ================================================= */}

          <div className="grid gap-6 lg:grid-cols-3">

            {/* PREDICTION */}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">

              <div>

                <h2 className="text-lg font-semibold text-slate-900">
                  Prediction Analysis
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Factors currently influencing the ETA prediction.
                </p>

              </div>


              <div className="mt-6 grid gap-4 sm:grid-cols-3">

                <AnalysisCard
                  title="Speed"
                  value={`${selectedTrainEvent?.speed ?? "--"} km/h`}
                  description="Current running speed"
                  icon="↗"
                />

                <AnalysisCard
                  title="Delay"
                  value={
                    selectedTrainEvent?.delayMinutes > 0
                      ? `+${selectedTrainEvent.delayMinutes} min`
                      : "On Time"
                  }
                  description="Accumulated delay"
                  icon="◷"
                  danger={selectedTrain.delay > 0}
                />

                <AnalysisCard
                  title="Network Status"
                  value={networkResource.loading ? "--" : networkResource.networkStatus}
                  description="Current network condition"
                  icon="≋"
                />

              </div>


              {etaData?.predictionSource === "ml" && (
                <div className="mt-6 rounded-xl border border-slate-100 p-4">

                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-500">
                      Model delay quantiles
                    </p>
                    <span className="text-xs text-slate-400">
                      {etaData.modelVersion}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-4">
                    <QuantileCell label="P10" value={etaData.delayP10Minutes} />
                    <QuantileCell label="P50" value={etaData.delayP50Minutes} highlight />
                    <QuantileCell label="P90" value={etaData.delayP90Minutes} />
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Delay &gt; 15 min
                      </p>
                      <p className="mt-2 text-xl font-bold text-slate-900">
                        {Number.isFinite(etaData.probabilityDelayOver15)
                          ? `${Math.round(etaData.probabilityDelayOver15 * 100)}%`
                          : "--"}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-400">
                    Likely delay range {formatMinutes(etaData.delayP10Minutes)} to{" "}
                    {formatMinutes(etaData.delayP90Minutes)} at {selectedTrain.destination}.
                  </p>

                </div>
              )}


              {/* INFO BOX */}

              <div className="mt-6 rounded-xl border border-orange-100 bg-orange-50 p-4">

                <div className="flex gap-3">

                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                    !
                  </div>

                  <div>

                    <p className="text-sm font-semibold text-slate-800">
                      Prediction insight
                    </p>

                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {etaData?.predictionSource === "ml"
                        ? "The delay model used the train, route, scheduled arrival and calendar features. Current speed and delay were sent but are not used by the model."
                        : "Current speed, accumulated delay and remaining route distance are being used to estimate the arrival time."}
                    </p>

                    {etaData?.predictionSource !== "ml" && etaData?.fallbackReason && (
                      <p className="mt-2 text-xs text-slate-400">
                        Model not used: {FALLBACK_REASONS[etaData.fallbackReason] || etaData.fallbackReason}
                      </p>
                    )}

                  </div>

                </div>

              </div>

            </div>


            {/* CONFIDENCE */}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

              <p className="text-sm font-medium text-slate-500">
                Prediction Confidence
              </p>

              <div className="mt-4 flex items-end gap-2">

                <span className="text-4xl font-bold text-slate-900">
                  ±{etaData?.confidenceMinutes ?? "--"} min
                </span>

                <span className="mb-1 text-sm text-slate-500">
                  {etaData?.predictionSource === "ml"
                    ? "half the P10–P90 range"
                    : "fixed rule-based margin"}
                </span>

              </div>


              <p className="mt-4 text-sm leading-6 text-slate-500">
                {etaData?.predictionSource === "ml"
                  ? "Interval produced by the model's P10 and P90 quantiles."
                  : "Rule-based estimate: a fixed margin, not a measured interval."}
              </p>


              <div className="mt-6 border-t border-slate-100 pt-5">

                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Estimated Arrival
                </p>

                <p className="mt-2 text-2xl font-bold text-orange-500">
                  {etaData
                    ? new Date(etaData.predictedEta).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                    : "--"}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  At {selectedTrain.destination}
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
   METRIC CARD
========================================================= */

function MetricCard({
  label,
  value,
  danger = false,
  highlight = false,
}) {
  return (

    <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">

      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p
        className={`
          mt-3
          text-xl
          font-bold
          ${danger
            ? "text-red-600"
            : highlight
              ? "text-orange-500"
              : "text-slate-900"
          }
        `}
      >
        {value}
      </p>

    </div>

  );
}


/* =========================================================
   ANALYSIS CARD
========================================================= */

function AnalysisCard({
  title,
  value,
  description,
  icon,
  danger = false,
}) {
  return (

    <div className="rounded-xl border border-slate-100 p-4">

      <div className="flex items-center justify-between">

        <p className="text-sm font-medium text-slate-500">
          {title}
        </p>

        <span className="text-lg text-orange-500">
          {icon}
        </span>

      </div>

      <p
        className={`
          mt-3
          text-xl
          font-bold
          ${danger ? "text-red-600" : "text-slate-900"}
        `}
      >
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-400">
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
  };

  const dots = {
    RUNNING: "bg-green-500",
    DELAYED: "bg-red-500",
    "AT STATION": "bg-orange-500",
  };

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
        ${styles[status] || "bg-slate-100 text-slate-600"}
      `}
    >

      <span
        className={`
          h-2
          w-2
          rounded-full
          ${dots[status] || "bg-slate-500"}
        `}
      />

      {status}

    </span>

  );
}


/* =========================================================
   MODEL STATUS
========================================================= */

const FALLBACK_REASONS = {
  disabled: "the ML bridge is switched off",
  model_unavailable: "the model service has no model registered",
  ml_timeout: "the model service did not answer in time",
  ml_unreachable: "the model service could not be reached",
  ml_auth_failed: "the model service rejected the service credentials",
  ml_rejected_payload: "the model service rejected the request payload",
};

function formatMinutes(value) {
  return Number.isFinite(value) ? `${Math.round(value)} min` : "--";
}

function QuantileCell({ label, value, highlight = false }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={`mt-2 text-xl font-bold ${highlight ? "text-orange-500" : "text-slate-900"}`}
      >
        {formatMinutes(value)}
      </p>
    </div>
  );
}

function ModelStatusBadge({ eta }) {
  const usingMl = eta?.predictionSource === "ml";
  const synthetic = (eta?.dataProvenance || "").toLowerCase() === "synthetic";

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">

      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
          usingMl ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${usingMl ? "bg-green-500" : "bg-amber-500"}`}
        />
        {usingMl ? `ML model · ${eta.modelVersion}` : "Rule-based fallback"}
      </span>

      {usingMl && synthetic && (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700">
          Trained on synthetic data
        </span>
      )}

      {usingMl && eta.trainKnownToModel === false && (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
          Train not in training data
        </span>
      )}

      {usingMl && eta.beatsBaseline === false && (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
          Does not beat its baseline
        </span>
      )}

      {!usingMl && eta?.fallbackReason && (
        <span className="text-xs text-slate-500">
          {FALLBACK_REASONS[eta.fallbackReason] || eta.fallbackReason}
        </span>
      )}

    </div>
  );
}


export default ETAPrediction;