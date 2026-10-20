import { useEffect, useState } from "react";
import { getTrains } from "../services/trainService";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const canManageAlerts =
    user?.role === "STAFF" || user?.role === "ADMIN";

  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    // Read the alerts the backend has stored. The previous version asked for
    // one hardcoded train id, and that endpoint does not read an alert -- it
    // creates one -- so opening this page wrote a row every time.
    const loadAlerts = async () => {
      try {
        setLoading(true);
        setLoadError("");

        const [alertsResponse, trainsResponse] = await Promise.all([
          api.get("/alerts"),
          getTrains(),
        ]);

        const trainsById = new Map(
          (trainsResponse.data || []).map((train) => [
            String(train._id),
            train,
          ])
        );

        const formatted = (alertsResponse.data || []).map((alert) => {
          const train = trainsById.get(String(alert.trainId));

          return {
            id: alert._id,
            title: train
              ? `Train ${train.trainNumber} delayed`
              : "Train delay detected",
            type: alert.alertType || "ALERT",
            severity: alert.severity || "LOW",
            location:
              alert.affectedSection ||
              train?.currentStation ||
              train?.source ||
              "Unknown",
            time: alert.createdAt
              ? new Date(alert.createdAt).toLocaleTimeString()
              : "Unknown",
            description: alert.message || "",
            status: "ACTIVE",
          };
        });

        setAlerts(formatted);
      } catch (error) {
        console.error("Failed to load alerts:", error);
        setLoadError(
          error.response?.data?.message ||
          "Alerts could not be loaded from the backend."
        );
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    };

    loadAlerts();
  }, []);

  /* ---------------------------------------------
     FILTER ALERTS
  --------------------------------------------- */

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSeverity =
      severityFilter === "ALL" ||
      alert.severity === severityFilter;

    const matchesStatus =
      statusFilter === "ALL" ||
      alert.status === statusFilter;

    const searchText = search.toLowerCase();

    const matchesSearch =
      alert.title.toLowerCase().includes(searchText) ||
      alert.type.toLowerCase().includes(searchText) ||
      alert.location.toLowerCase().includes(searchText) ||
      alert.description.toLowerCase().includes(searchText);

    return (
      matchesSeverity &&
      matchesStatus &&
      matchesSearch
    );
  });

  /* ---------------------------------------------
     SUMMARY COUNTS
  --------------------------------------------- */

  const activeCount = alerts.filter(
    (alert) => alert.status === "ACTIVE"
  ).length;

  const criticalCount = alerts.filter(
    (alert) =>
      alert.status === "ACTIVE" &&
      alert.severity === "CRITICAL"
  ).length;

  const warningCount = alerts.filter(
    (alert) =>
      alert.status === "ACTIVE" &&
      (alert.severity === "HIGH" ||
        alert.severity === "MEDIUM")
  ).length;

  const resolvedCount = alerts.filter(
    (alert) => alert.status === "RESOLVED"
  ).length;

  /* ---------------------------------------------
     RESOLVE / REOPEN
  --------------------------------------------- */

  const toggleAlertStatus = (id) => {
    if (!canManageAlerts) {
      return;
    }

    setAlerts((currentAlerts) =>
      currentAlerts.map((alert) => {
        if (alert.id !== id) {
          return alert;
        }

        return {
          ...alert,
          status:
            alert.status === "ACTIVE"
              ? "RESOLVED"
              : "ACTIVE",
        };
      })
    );
  };

  return (
    <div className="space-y-8 p-8">

      {/* =========================================
          PAGE HEADER
      ========================================== */}

      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Alerts
        </h1>

        <p className="mt-2 text-slate-500">
          Monitor operational alerts and incidents across
          the railway network.
        </p>
      </div>


      {/* =========================================
          SUMMARY CARDS
      ========================================== */}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">

        <AlertStat
          title="Active Alerts"
          value={activeCount}
          description="Requires monitoring"
        />

        <AlertStat
          title="Critical"
          value={criticalCount}
          description="Immediate attention"
          danger
        />

        <AlertStat
          title="Warnings"
          value={warningCount}
          description="Needs attention"
        />

        <AlertStat
          title="Resolved"
          value={resolvedCount}
          description="Previously handled"
        />

      </div>


      {/* =========================================
          FILTERS
      ========================================== */}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="grid gap-5 lg:grid-cols-[1fr_auto]">

          {/* SEARCH */}

          <div>

            <label className="mb-2 block text-sm font-medium text-slate-600">
              Search Alerts
            </label>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by train, type, location..."
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />

          </div>


          {/* FILTERS */}

          <div className="grid grid-cols-2 gap-4">

            <div>

              <label className="mb-2 block text-sm font-medium text-slate-600">
                Severity
              </label>

              <select
                value={severityFilter}
                onChange={(e) =>
                  setSeverityFilter(e.target.value)
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              >
                <option value="ALL">
                  All Severity
                </option>

                <option value="HIGH">
                  High
                </option>

                <option value="MEDIUM">
                  Medium
                </option>

                <option value="LOW">
                  Low
                </option>
              </select>

            </div>


            <div>

              <label className="mb-2 block text-sm font-medium text-slate-600">
                Status
              </label>

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value)
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              >
                <option value="ALL">
                  All Status
                </option>

                <option value="ACTIVE">
                  Active
                </option>

                <option value="RESOLVED">
                  Resolved
                </option>
              </select>

            </div>

          </div>

        </div>

      </div>


      {/* =========================================
          ALERT FEED
      ========================================== */}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">

        {/* FEED HEADER */}

        <div className="border-b border-slate-200 p-6">

          <div className="flex items-center justify-between">

            <div>

              <h2 className="text-lg font-semibold text-slate-900">
                Alert Feed
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Recent operational events and network incidents.
              </p>

            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
              {filteredAlerts.length} alerts
            </span>

          </div>

        </div>


        {/* ALERTS */}

        {loading ? (

          <div className="p-12 text-center">

            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />

            <p className="mt-4 text-sm text-slate-500">
              Loading alerts...
            </p>

          </div>

        ) : loadError ? (

          <div className="p-12 text-center">

            <p className="font-semibold text-red-600">
              {loadError}
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Check that the API is running, then reload the page.
            </p>

          </div>

        ) : filteredAlerts.length === 0 ? (

          <div className="p-12 text-center">

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">

              <span className="text-lg text-slate-400">
                ✓
              </span>

            </div>

            <p className="mt-4 font-semibold text-slate-700">
              No alerts found
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Try changing your search or filters.
            </p>

          </div>

        ) : (

          <div className="divide-y divide-slate-100">

            {filteredAlerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onToggleStatus={toggleAlertStatus}
                canManageAlerts={canManageAlerts}
              />
            ))}

          </div>

        )}

      </div>

    </div>
  );
}


/* =========================================================
   ALERT SUMMARY CARD
========================================================= */

function AlertStat({
  title,
  value,
  description,
  danger = false,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p
        className={`mt-3 text-3xl font-bold ${
          danger
            ? "text-red-600"
            : "text-slate-900"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-sm text-slate-400">
        {description}
      </p>

    </div>
  );
}


/* =========================================================
   ALERT ROW
========================================================= */

function AlertRow({
  alert,
  onToggleStatus,
  canManageAlerts,
}) {
  const isResolved = alert.status === "RESOLVED";

  return (
    <div
      className={`p-6 transition ${
        isResolved
          ? "bg-slate-50/50"
          : "hover:bg-slate-50"
      }`}
    >

      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

        {/* LEFT SIDE */}

        <div className="flex gap-4">

          {/* SEVERITY DOT */}

          <div
            className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
              isResolved
                ? "bg-slate-300"
                : alert.severity === "CRITICAL"
                  ? "bg-red-600"
                  : alert.severity === "HIGH"
                    ? "bg-red-500"
                    : alert.severity === "MEDIUM"
                      ? "bg-orange-500"
                      : "bg-yellow-400"
            }`}
          />


          {/* CONTENT */}

          <div className="min-w-0">

            {/* TITLE + BADGES */}

            <div className="flex flex-wrap items-center gap-2">

              <h3
                className={`font-semibold ${
                  isResolved
                    ? "text-slate-500"
                    : "text-slate-900"
                }`}
              >
                {alert.title}
              </h3>

              <SeverityBadge
                severity={alert.severity}
              />

              <StatusBadge
                status={alert.status}
              />

            </div>


            {/* DESCRIPTION */}

            <p
              className={`mt-2 text-sm ${
                isResolved
                  ? "text-slate-400"
                  : "text-slate-600"
              }`}
            >
              {alert.description}
            </p>


            {/* META */}

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">

              <span>
                Type:{" "}
                <span className="font-medium text-slate-500">
                  {alert.type}
                </span>
              </span>

              <span>
                Location:{" "}
                <span className="font-medium text-slate-500">
                  {alert.location}
                </span>
              </span>

              <span>
                {alert.time}
              </span>

            </div>

          </div>

        </div>


        {/* ACTION */}

        {canManageAlerts && (
          <button
            type="button"
            onClick={() => onToggleStatus(alert.id)}
            className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
              isResolved
                ? "border-orange-200 bg-white text-orange-600 hover:bg-orange-50"
                : "border-slate-200 bg-white text-slate-600 hover:border-green-300 hover:bg-green-50 hover:text-green-700"
            }`}
          >
            {isResolved
              ? "Reopen Alert"
              : "Mark Resolved"}
          </button>
        )}

      </div>

    </div>
  );
}


/* =========================================================
   SEVERITY BADGE
========================================================= */

function SeverityBadge({ severity }) {

  const styles = {
    CRITICAL:
      "bg-red-100 text-red-700",

    HIGH:
      "bg-orange-100 text-orange-700",

    MEDIUM:
      "bg-yellow-100 text-yellow-700",

    LOW:
      "bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        styles[severity] ||
        "bg-slate-100 text-slate-600"
      }`}
    >
      {severity}
    </span>
  );
}


/* =========================================================
   STATUS BADGE
========================================================= */

function StatusBadge({ status }) {

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        status === "ACTIVE"
          ? "bg-red-50 text-red-600"
          : "bg-green-50 text-green-600"
      }`}
    >
      {status}
    </span>
  );
}


export default Alerts;