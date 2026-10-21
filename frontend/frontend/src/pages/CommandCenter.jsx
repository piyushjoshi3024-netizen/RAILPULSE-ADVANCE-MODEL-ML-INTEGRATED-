import { useEffect, useMemo, useState } from "react";
import {
  getRisk,
  getBottleneck,
  getPropagation,
  getRecovery,
} from "../services/operationsService";
import { getTrains } from "../services/trainService";
import { HEALTH_STYLES, useServiceHealth } from "../hooks/useServiceHealth";
import { getTrainEvents } from "../services/trainEventService";
import api from "../services/api";


const severityStyles = {
  CRITICAL: "bg-red-100 text-red-700 border-red-200",
  HIGH: "bg-orange-100 text-orange-700 border-orange-200",
  MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-200",
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
};

const statusStyles = {
  RUNNING: "bg-green-100 text-green-700",
  DELAYED: "bg-red-100 text-red-700",
  ACTIVE: "bg-red-100 text-red-700",
  ACKNOWLEDGED: "bg-yellow-100 text-yellow-700",
  RESOLVED: "bg-green-100 text-green-700",
};

function CommandCenter() {
  const health = useServiceHealth();
  const healthStyle = HEALTH_STYLES[health.state];

  const [trains, setTrains] = useState([]);
  const [incidents, setIncidents] = useState([]);

  const [selectedTrain, setSelectedTrain] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [bottleneckData, setBottleneckData] = useState(null);
  const [propagationData, setPropagationData] = useState(null);
  const [recoveryData, setRecoveryData] = useState(null);
  const [networkLoad, setNetworkLoad] = useState(0);

  // Which train the risk, bottleneck, propagation and recovery panels describe.
  // It used to be one id written into the source, so the panels described the
  // same train no matter which one was on screen.
  const [operationsTrainId, setOperationsTrainId] = useState(null);

  useEffect(() => {
    const loadTrainData = async () => {
      try {

        const [trainsResponse, eventsResponse, networkResponse, alertsResponse] =
          await Promise.all([
            getTrains(),
            getTrainEvents(),
            api.get("/operations/network"),
            api.get("/alerts"),
          ]);

        const networkData = networkResponse.data;

        const loadMap = {
          LOW: 30,
          MEDIUM: 60,
          HIGH: 85,
          CRITICAL: 100,
        };

        setNetworkLoad(loadMap[networkData.networkStatus] ?? 0);

        const backendTrains = trainsResponse.data;
        const backendEvents = eventsResponse.data;
        const backendAlerts = alertsResponse.data;

        const trainMap = new Map();

        backendTrains.forEach((train) => {
          trainMap.set(String(train._id), train);
        });

        const latestAlertsByTrain = new Map();

        backendAlerts
          .filter((alert) => alert.alertType === "DELAY")
          .forEach((alert) => {
            const trainId = String(alert.trainId);
            const existing = latestAlertsByTrain.get(trainId);

            if (
              !existing ||
              new Date(alert.createdAt) > new Date(existing.createdAt)
            ) {
              latestAlertsByTrain.set(trainId, alert);
            }
          });

        const mappedIncidents = Array.from(latestAlertsByTrain.values()).map(
          (alert) => {
            const train = trainMap.get(String(alert.trainId));

            return {
              id: alert._id,
              title: train
                ? `Train ${train.trainNumber} delayed`
                : "Train delay detected",
              location:
                train?.currentStation ||
                train?.source ||
                "Unknown",
              severity: alert.severity,
              status: "ACTIVE",
              time: alert.createdAt
                ? new Date(alert.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
                : "Unknown",
              description: alert.message,
            };
          }
        );

        setIncidents(mappedIncidents);

        setIncidents(mappedIncidents);

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
            id: train.trainNumber,
            trainId: String(train._id),
            name: train.trainName,
            type: train.trainType || "UNKNOWN",
            status:
              event?.delayMinutes > 0
                ? "DELAYED"
                : train.status || "RUNNING",
            location:
              event?.station ||
              train.currentStation ||
              train.source,
            speed: event?.speed || 0,
            delay: event?.delayMinutes || 0,
            destination: train.destination,
            priority: event?.delayMinutes > 10 ? "HIGH" : "NORMAL",
          };
        });

        setTrains(mapTrains);

        if (mapTrains.length > 0) {
          setOperationsTrainId((current) => current || mapTrains[0].trainId);
        }
      } catch (error) {
        console.error("Failed to load train data:", error);
      }
    };

    loadTrainData();
  }, []);

  useEffect(() => {
    if (!operationsTrainId) {
      return;
    }

    const loadRisk = async () => {
      try {
        const response = await getRisk(operationsTrainId);

        setRiskData(response.data);
      } catch (error) {
        console.error("Failed to load risk:", error);
        setRiskData(null);
      }
    };

    loadRisk();
  }, [operationsTrainId]);

  useEffect(() => {
    if (!operationsTrainId) {
      return;
    }

    const loadBottleneck = async () => {
      try {
        const response = await getBottleneck(operationsTrainId);

        setBottleneckData(response.data);
      } catch (error) {
        console.error("Failed to load bottleneck:", error);
        setBottleneckData(null);
      }
    };

    loadBottleneck();
  }, [operationsTrainId]);

  useEffect(() => {
    if (!operationsTrainId) {
      return;
    }

    const loadPropagation = async () => {
      try {
        const response = await getPropagation(operationsTrainId);

        setPropagationData(response.data);
      } catch (error) {
        console.error("Failed to load propagation:", error);
        setPropagationData(null);
      }
    };

    loadPropagation();
  }, [operationsTrainId]);

  useEffect(() => {
    if (!operationsTrainId) {
      return;
    }

    const loadRecovery = async () => {
      try {
        const response = await getRecovery(operationsTrainId);

        setRecoveryData(response.data);
      } catch (error) {
        console.error("Failed to load recovery:", error);
        setRecoveryData(null);
      }
    };

    loadRecovery();
  }, [operationsTrainId]);

  const [trainFilter, setTrainFilter] = useState("ALL");
  const [incidentFilter, setIncidentFilter] = useState("ALL");

  const operationsTrainName = (() => {
    const train = trains.find((item) => item.trainId === operationsTrainId);
    return train ? `Train ${train.id}` : "This train";
  })();

  const activeIncidents = incidents.filter(
    (incident) => incident.status !== "RESOLVED"
  ).length;

  const delayedTrains = trains.filter(
    (train) => train.status === "DELAYED"
  ).length;

  const runningTrains = trains.filter(
    (train) => train.status === "RUNNING"
  ).length;

  const filteredTrains = useMemo(() => {
    if (trainFilter === "ALL") return trains;

    return trains.filter((train) => train.status === trainFilter);
  }, [trains, trainFilter]);

  const filteredIncidents = useMemo(() => {
    if (incidentFilter === "ALL") {
      return incidents;
    }

    return incidents.filter(
      (incident) => incident.severity === incidentFilter
    );
  }, [incidents, incidentFilter]);

  function acknowledgeIncident(id) {
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === id
          ? {
            ...incident,
            status: "ACKNOWLEDGED",
            time: "Just now",
          }
          : incident
      )
    );

    setSelectedIncident((current) =>
      current?.id === id
        ? {
          ...current,
          status: "ACKNOWLEDGED",
          time: "Just now",
        }
        : current
    );
  }

  function resolveIncident(id) {
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === id
          ? {
            ...incident,
            status: "RESOLVED",
            time: "Just now",
          }
          : incident
      )
    );

    setSelectedIncident(null);
  }

  async function simulateRefresh() {

    try {
      const [trainsResponse, eventsResponse, networkResponse] =
        await Promise.all([
          getTrains(),
          getTrainEvents(),
          api.get("/operations/network"),
        ]);


      const backendTrains = trainsResponse.data;
      const backendEvents = eventsResponse.data;
      const networkData = networkResponse.data;

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
          id: train.trainNumber,
          trainId: String(train._id),
          name: train.trainName,
          type: train.trainType || "UNKNOWN",
          status:
            event?.delayMinutes > 0
              ? "DELAYED"
              : train.status || "RUNNING",
          location:
            event?.station ||
            train.currentStation ||
            train.source,
          speed: event?.speed || 0,
          delay: event?.delayMinutes || 0,
          destination: train.destination,
          priority:
            event?.delayMinutes > 10 ? "HIGH" : "NORMAL",
        };
      });

      setTrains(mapTrains);

      const loadMap = {
        LOW: 30,
        MEDIUM: 60,
        HIGH: 85,
        CRITICAL: 100,
      };

      setNetworkLoad(loadMap[networkData.networkStatus] ?? 0);
    } catch (error) {
      console.error("Failed to refresh operations:", error);
    }
  }

  return (
    <div className="min-h-full bg-slate-50 p-6 md:p-8">
      {/* HEADER */}
      <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Command Centre
          </h1>

          <p className="mt-1 text-slate-500">
            Operational control and real-time railway intelligence.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${healthStyle.chip} ${healthStyle.text}`}
          >
            <span className={`h-2 w-2 rounded-full ${healthStyle.dot}`} />
            {health.label}
          </div>

          <button
            onClick={simulateRefresh}
            className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600"
          >
            Refresh Operations
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Active Trains"
          value={trains.length}
          subtitle={`${runningTrains} currently running`}
        />

        <KpiCard
          title="Delayed Trains"
          value={delayedTrains}
          subtitle="Need attention"
          valueClass="text-red-600"
        />

        <KpiCard
          title="Network Load"
          value={`${networkLoad}%`}
          subtitle="Current utilization"
        />

        <KpiCard
          title="Active Incidents"
          value={activeIncidents}
          subtitle="Operational incidents"
          valueClass="text-orange-600"
        />
      </div>

      {/* MAIN GRID */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        {/* TRAIN OPERATIONS */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Train Operations
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Monitor currently active railway services.
                </p>
              </div>

              <div className="flex gap-2">
                {["ALL", "RUNNING", "DELAYED"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setTrainFilter(filter)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${trainFilter === filter
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-4">Train</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Location</th>
                  <th className="px-5 py-4">Speed</th>
                  <th className="px-5 py-4">Delay</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>

              <tbody>
                {filteredTrains.map((train) => (
                  <tr
                    key={train.id}
                    className="border-b border-slate-100 transition hover:bg-slate-50"
                  >
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {train.id}
                      </div>

                      <div className="text-xs text-slate-500">
                        {train.name}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[train.status]}`}
                      >
                        {train.status}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-600">
                      {train.location}
                    </td>

                    <td className="px-5 py-4 text-sm font-medium text-slate-700">
                      {train.speed} km/h
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {train.delay > 0 ? (
                        <span className="font-semibold text-red-600">
                          +{train.delay} min
                        </span>
                      ) : (
                        <span className="text-slate-400">On time</span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <button
                        onClick={() => {
                          setSelectedTrain(train);
                          setOperationsTrainId(train.trainId);
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* INCIDENTS */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Active Incidents
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Operational events requiring attention.
                </p>
              </div>

              <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
                {activeIncidents} ACTIVE
              </span>
            </div>

            <div className="mt-4 flex gap-2">
              {["ALL", "CRITICAL", "HIGH", "MEDIUM"].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setIncidentFilter(filter)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${incidentFilter === filter
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[520px] space-y-3 overflow-y-auto p-5">
            {filteredIncidents.map((incident) => (
              <button
                key={incident.id}
                onClick={() => setSelectedIncident(incident)}
                className="w-full rounded-xl border border-slate-200 p-4 text-left transition hover:border-orange-300 hover:bg-orange-50/30"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 h-3 w-3 shrink-0 rounded-full ${incident.status === "RESOLVED"
                      ? "bg-green-500"
                      : incident.severity === "CRITICAL"
                        ? "bg-red-500"
                        : incident.severity === "HIGH"
                          ? "bg-orange-500"
                          : "bg-yellow-500"
                      }`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {incident.title}
                      </h3>

                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-bold ${severityStyles[incident.severity]}`}
                      >
                        {incident.severity}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      {incident.location}
                    </p>

                    <div className="mt-3 flex items-center justify-between">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyles[incident.status]
                          }`}
                      >
                        {incident.status}
                      </span>

                      <span className="text-xs text-slate-400">
                        {incident.time}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}

            {filteredIncidents.length === 0 && (
              <div className="rounded-xl bg-green-50 p-6 text-center">
                <p className="font-semibold text-green-700">
                  No incidents found
                </p>

                <p className="mt-1 text-sm text-green-600">
                  Network operations are clear.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* OPERATIONS INTELLIGENCE */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Operational Intelligence
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Current system observations and recommended actions.
            </p>
          </div>

          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
            AI INSIGHTS
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InsightCard
            title="Delay Risk"
            text={
              riskData
                ? `${operationsTrainName} has ${riskData.riskLevel.toLowerCase()} delay risk with a risk score of ${riskData.riskScore}.`
                : "Risk data unavailable."
            }
          />

          <InsightCard
            title="Recovery Action"
            text={
              recoveryData
                ? recoveryData.recoveryAction
                : "Recovery data unavailable."
            }
          />

          <InsightCard
            title="Bottleneck"
            text={
              bottleneckData
                ? `${bottleneckData.section} has ${bottleneckData.severity.toLowerCase()} bottleneck severity with a score of ${bottleneckData.score}.`
                : "Bottleneck data unavailable."
            }
          />

          <InsightCard
            title="Delay Propagation"
            text={
              propagationData
                ? `${propagationData.totalAffectedStations} stations may be affected downstream from ${propagationData.fromStation}, with an estimated delay of ${propagationData.affectedStations[0]?.estimatedDelayMinutes ?? 0} minutes.`
                : "Propagation data unavailable."
            }
          />
        </div>
      </section>

      {/* TRAIN DETAILS MODAL */}
      {selectedTrain && (
        <Modal onClose={() => setSelectedTrain(null)}>
          <div className="flex items-start justify-between border-b border-slate-100 pb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Train {selectedTrain.id}
              </p>

              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                {selectedTrain.name}
              </h2>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[selectedTrain.status]}`}
            >
              {selectedTrain.status}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <Detail label="Train Type" value={selectedTrain.type} />
            <Detail label="Location" value={selectedTrain.location} />
            <Detail label="Speed" value={`${selectedTrain.speed} km/h`} />
            <Detail
              label="Delay"
              value={
                selectedTrain.delay > 0
                  ? `${selectedTrain.delay} min`
                  : "On time"
              }
            />
            <Detail
              label="Destination"
              value={selectedTrain.destination}
            />
            <Detail label="Priority" value={selectedTrain.priority} />
          </div>
        </Modal>
      )}

      {/* INCIDENT MODAL */}
      {selectedIncident && (
        <Modal onClose={() => setSelectedIncident(null)}>
          <div className="flex items-start justify-between border-b border-slate-100 pb-4">
            <div>
              <p className="text-sm text-slate-500">
                Incident #{selectedIncident.id}
              </p>

              <h2 className="mt-1 text-xl font-bold text-slate-900">
                {selectedIncident.title}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {selectedIncident.location}
              </p>
            </div>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold ${severityStyles[selectedIncident.severity]
                }`}
            >
              {selectedIncident.severity}
            </span>
          </div>

          <p className="mt-5 text-sm leading-6 text-slate-600">
            {selectedIncident.description}
          </p>

          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Current status</span>

              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[selectedIncident.status]
                  }`}
              >
                {selectedIncident.status}
              </span>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => setSelectedIncident(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>

            {selectedIncident.status === "ACTIVE" && (
              <button
                onClick={() =>
                  acknowledgeIncident(selectedIncident.id)
                }
                className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-white hover:bg-yellow-600"
              >
                Acknowledge
              </button>
            )}

            {selectedIncident.status !== "RESOLVED" && (
              <button
                onClick={() => resolveIncident(selectedIncident.id)}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                Resolve Incident
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  valueClass = "text-slate-900",
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>

      <p className={`mt-3 text-3xl font-bold ${valueClass}`}>
        {value}
      </p>

      <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
    </div>
  );
}

function InsightCard({ title, text }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <p className="text-sm font-bold text-slate-900">{title}</p>

      <p className="mt-2 text-sm leading-6 text-slate-500">
        {text}
      </p>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default CommandCenter;