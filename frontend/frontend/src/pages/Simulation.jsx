import { useEffect, useState } from "react";
import { runStaffSimulation } from "../services/simulationService";
import { getTrains } from "../services/trainService";

const scenarios = [
  {
    id: 1,
    name: "Train Delay",
    description: "Simulate the effect of a delayed train on the network.",
  },
  {
    id: 2,
    name: "Platform Congestion",
    description: "Simulate platform availability constraints.",
  },
  {
    id: 3,
    name: "High Traffic",
    description: "Simulate increased traffic on a railway corridor.",
  },
];

function Simulation() {
  const [scenario, setScenario] = useState("Train Delay");
  const [delay, setDelay] = useState(20);
  const [traffic, setTraffic] = useState("High");
  const [platforms, setPlatforms] = useState(2);
  const [simulated, setSimulated] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);

  // Each scenario used to carry a train id written into the source. Two of the
  // three did not exist in the database, so those scenarios always failed and
  // said nothing about it. The trains come from the API now, and the operator
  // chooses one.
  const [trains, setTrains] = useState([]);
  const [trainId, setTrainId] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const loadTrains = async () => {
      try {
        const response = await getTrains();
        const available = response.data || [];

        setTrains(available);

        if (available.length > 0) {
          setTrainId(String(available[0]._id));
        } else {
          setError("No trains are available to simulate.");
        }
      } catch (loadError) {
        console.error("Failed to load trains:", loadError);
        setError("The list of trains could not be loaded.");
      }
    };

    loadTrains();
  }, []);

  const selectedScenario = scenarios.find(
    (item) => item.name === scenario
  );

  const selectedTrain = trains.find(
    (item) => String(item._id) === trainId
  );

  const runSimulation = async () => {
    if (!trainId) {
      setError("Choose a train before running the simulation.");
      setSimulated(false);
      return;
    }

    setRunning(true);
    setError("");

    try {
      const response = await runStaffSimulation({
        trainId,
        additionalDelayMinutes: Number(delay || 0),
      });

      setSimulationResult(response.data);
      setSimulated(true);
    } catch (runError) {
      console.error("Failed to run simulation:", runError);
      setError(
        runError.response?.data?.message ||
        "The simulation could not be run. Check that the API is reachable."
      );
      setSimulationResult(null);
      setSimulated(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-8 p-8">

      {/* PAGE HEADER */}

      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          What-If Simulation
        </h1>

        <p className="mt-2 text-slate-500">
          Simulate operational scenarios and analyze their impact
          on railway traffic.
        </p>
      </div>


      {/* SCENARIO SELECTION */}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Simulation Scenario
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Select a scenario and configure its operational parameters.
          </p>
        </div>


        <div className="mt-6">

          <label className="mb-2 block text-sm font-medium text-slate-600">
            Scenario
          </label>

          <select
            value={scenario}
            onChange={(e) => {
              setScenario(e.target.value);
              setSimulated(false);
            }}
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          >
            {scenarios.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>

        </div>


        <div className="mt-6">

          <label
            htmlFor="simulation-train"
            className="mb-2 block text-sm font-medium text-slate-600"
          >
            Train
          </label>

          <select
            id="simulation-train"
            value={trainId}
            onChange={(e) => {
              setTrainId(e.target.value);
              setSimulated(false);
            }}
            disabled={trains.length === 0}
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-50 disabled:text-slate-400"
          >
            {trains.length === 0 ? (
              <option value="">No trains available</option>
            ) : (
              trains.map((train) => (
                <option key={train._id} value={String(train._id)}>
                  {train.trainNumber} - {train.trainName}
                </option>
              ))
            )}
          </select>

        </div>


        {/* SCENARIO DESCRIPTION */}

        <div className="mt-5 rounded-xl bg-orange-50 p-4">

          <p className="text-sm font-semibold text-orange-700">
            {selectedScenario.name}
          </p>

          <p className="mt-1 text-sm text-slate-600">
            {selectedScenario.description}
          </p>

          <p className="mt-2 text-xs text-slate-500">
            Selected train:{" "}
            {selectedTrain
              ? `${selectedTrain.trainNumber} - ${selectedTrain.trainName}`
              : "none selected"}
          </p>

        </div>

      </div>


      {/* PARAMETERS */}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Scenario Parameters
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Adjust the operational conditions for this simulation.
          </p>
        </div>


        <div className="mt-6 grid gap-6 md:grid-cols-3">

          {/* DELAY */}

          <div>

            <label className="mb-2 block text-sm font-medium text-slate-600">
              Delay
            </label>

            <div className="relative">

              <input
                type="number"
                min="0"
                value={delay}
                onChange={(e) => {
                  const value = e.target.value;
                  setDelay(value === "" ? "" : Number(value));
                  setSimulated(false);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                min
              </span>

            </div>

          </div>


          {/* TRAFFIC */}

          <div>

            <label className="mb-2 block text-sm font-medium text-slate-600">
              Traffic Level
            </label>

            <select
              value={traffic}
              onChange={(e) => {
                setTraffic(e.target.value);
                setSimulated(false);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>

          </div>


          {/* PLATFORMS */}

          <div>

            <label className="mb-2 block text-sm font-medium text-slate-600">
              Available Platforms
            </label>

            <input
              type="number"
              min="1"
              max="20"
              value={platforms}
              onChange={(e) => {
                const value = e.target.value;
                setPlatforms(value === "" ? "" : Number(value));
                setSimulated(false);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </div>

        </div>


        {/* RUN BUTTON */}

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end">

          <button
            type="button"
            onClick={runSimulation}
            disabled={running || !trainId}
            className="rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:bg-orange-300"
          >
            {running ? "Running..." : "Run Simulation"}
          </button>

        </div>

      </div>


      {/* RESULTS */}

      {simulated && (

        <div className="space-y-6">

          {/* RESULT HEADER */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

              <div>

                <h2 className="text-lg font-semibold text-slate-900">
                  Simulation Results
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Projected operational impact based on the selected scenario.
                </p>

              </div>

              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700">

                <span className="h-2 w-2 rounded-full bg-green-500" />

                Simulation Complete

              </span>

            </div>

          </div>


          {/* IMPACT METRICS */}

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">

            <ResultCard
              title="Projected Delay"
              value={
                simulationResult
                  ? `+${simulationResult.simulatedDelay} min`
                  : "--"
              }
              description="Expected additional delay"
            />

            <ResultCard
              title="Affected Trains"
              value={
                traffic === "High"
                  ? "8"
                  : traffic === "Medium"
                    ? "5"
                    : "3"
              }
              description="Potentially impacted"
            />

            <ResultCard
              title="Affected Stations"
              value={
                simulationResult
                  ? simulationResult.affectedStations.length
                  : "--"
              }
              description="Operational impact"
            />

            <ResultCard
              title="Traffic Level"
              value={simulationResult ? simulationResult.simulatedRisk : "--"}
              description="Simulated network condition"
            />

          </div>


          {/* ANALYSIS */}

          <div className="grid gap-6 lg:grid-cols-3">

            {/* CURRENT SITUATION */}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

              <h2 className="text-lg font-semibold text-slate-900">
                Current Situation
              </h2>

              <div className="mt-5 space-y-4">

                <InfoRow
                  label="Selected Train"
                  value={
                    simulationResult
                      ? simulationResult.trainNumber
                      : "--"
                  }
                />

                <InfoRow
                  label="Delay"
                  value={
                    simulationResult
                      ? `+${simulationResult.currentDelay} min`
                      : "--"
                  }
                  danger
                />

                <InfoRow
                  label="Traffic"
                  value={
                    simulationResult
                      ? simulationResult.simulatedRisk
                      : "--"
                  }
                />

                <InfoRow
                  label="Platforms"
                  value={platforms}
                />

              </div>

            </div>


            {/* PROJECTED IMPACT */}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

              <h2 className="text-lg font-semibold text-slate-900">
                Projected Impact
              </h2>

              <div className="mt-5 space-y-4">

                <ImpactItem
                  title="Train Schedule"
                  value={
                    simulationResult
                      ? simulationResult.impact
                      : "--"
                  }
                />

                <ImpactItem
                  title="Platform Operations"
                  value={
                    platforms <= 2
                      ? "High impact"
                      : "Low impact"
                  }
                />

                <ImpactItem
                  title="Network Traffic"
                  value={
                    simulationResult
                      ? simulationResult.bottleneckImpact
                      : "--"
                  }
                />

              </div>

            </div>


            {/* RECOMMENDATIONS */}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

              <h2 className="text-lg font-semibold text-slate-900">
                Operational Recommendations
              </h2>

              <div className="mt-5 space-y-3">

                <Recommendation
                  text={
                    simulationResult
                      ? simulationResult.recommendedResponse
                      : "--"
                  }
                />

                <Recommendation
                  text={
                    simulationResult
                      ? simulationResult.propagationImpact
                      : "--"
                  }
                />

                <Recommendation
                  text={
                    simulationResult
                      ? simulationResult.bottleneckImpact
                      : "--"
                  }
                />

              </div>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}


/* =========================================================
   RESULT CARD
========================================================= */

function ResultCard({
  title,
  value,
  description,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p className="mt-3 text-2xl font-bold text-slate-900">
        {value}
      </p>

      <p className="mt-2 text-sm text-slate-400">
        {description}
      </p>

    </div>
  );
}


/* =========================================================
   INFO ROW
========================================================= */

function InfoRow({
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
   IMPACT ITEM
========================================================= */

function ImpactItem({
  title,
  value,
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">

      <p className="text-sm font-medium text-slate-700">
        {title}
      </p>

      <p className="mt-1 text-sm text-orange-600">
        {value}
      </p>

    </div>
  );
}


/* =========================================================
   RECOMMENDATION
========================================================= */

function Recommendation({ text }) {
  return (
    <div className="flex gap-3 rounded-xl bg-orange-50 p-3">

      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />

      <p className="text-sm leading-5 text-slate-600">
        {text}
      </p>

    </div>
  );
}


export default Simulation;