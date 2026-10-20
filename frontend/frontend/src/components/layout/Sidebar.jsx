import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { HEALTH_STYLES, useServiceHealth } from "../../hooks/useServiceHealth";
import { getToken, markMlHandoff, mlHandoffUrl } from "../../services/session";

import {
  LayoutDashboard,
  Radio,
  TrainFront,
  Map,
  Route,
  Clock3,
  FlaskConical,
  TriangleAlert,
  Activity,
  LogOut,
  X,
} from "lucide-react";

const navigation = [
  {
    name: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Command Center",
    path: "/operations",
    icon: Radio,
  },
  {
    name: "Trains",
    path: "/trains",
    icon: TrainFront,
  },
  {
    name: "Network Map",
    path: "/map",
    icon: Map,
  },
  {
    name: "Journey Management",
    path: "/journey",
    icon: Route,
  },
  {
    name: "ETA Prediction",
    path: "/eta",
    icon: Clock3,
  },
  {
    name: "Simulation",
    path: "/simulation",
    icon: FlaskConical,
  },
  {
    name: "Alerts",
    path: "/alerts",
    icon: TriangleAlert,
  },
];

/** The ML page each role should land on when it opens the ML app. */
const ML_LANDING = {
  PASSENGER: "passenger/train",
  STAFF: "staff/train",
  ADMIN: "admin/train",
};

function Sidebar({ open = false, onClose = () => {} }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const health = useServiceHealth();
  const healthStyle = HEALTH_STYLES[health.state];

  const handleLogout = () => {
    onClose();

    // Returns false when it has started a cross-app sign-out, which navigates
    // the page itself; navigating here as well would cancel it.
    if (logout()) {
      navigate("/login");
    }
  };

  /**
   * Open the ML app already signed in, on the page this role should see.
   *
   * The token travels in the URL fragment, which browsers never send to a
   * server, and the ML app strips it from the address as soon as it has read
   * it. It is built at click time rather than rendered into an href, so the
   * token is not sitting in the DOM. Without a token the link still works --
   * the ML app simply asks for a sign-in.
   */
  const openMlApp = (event) => {
    event.preventDefault();
    onClose();

    const token = getToken();

    if (!token) {
      window.location.assign(mlHandoffUrl("", ""));
      return;
    }

    markMlHandoff();
    window.location.assign(mlHandoffUrl(token, ML_LANDING[user?.role] || ""));
  };

  const visibleNavigation = navigation.filter((item) => {
    if (
      item.path === "/operations" ||
      item.path === "/simulation"
    ) {
      return (
        user?.role === "STAFF" ||
        user?.role === "ADMIN"
      );
    }

    return true;
  });

  return (
    <aside
      id="main-sidebar"
      // Off-canvas below md, static from md up. The desktop appearance is
      // unchanged: the same width, border and background as before.
      className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col overflow-y-auto transition-transform duration-200 md:static md:min-h-screen md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
      aria-label="Main navigation"
    >

      {/* Logo */}
      <div className="h-20 px-6 flex items-center border-b border-slate-200">

        <div className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center">
          <TrainFront size={24} className="text-white" />
        </div>

        <div className="ml-3">
          <h1 className="text-xl font-bold text-slate-900">
            RailPulse
          </h1>

          <p className="text-xs text-slate-500">
            Railway Intelligence
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>

      </div>

      {/* Navigation */}
      <div className="px-4 py-6">

        <p className="px-3 mb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Navigation
        </p>

        <nav className="space-y-1.5">

          {visibleNavigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${isActive
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-slate-700 hover:bg-orange-50 hover:text-orange-600"
                  }`
                }
              >

                {({ isActive }) => (
                  <>
                    <Icon
                      size={19}
                      strokeWidth={isActive ? 2.3 : 2}
                    />

                    <span>{item.name}</span>
                  </>
                )}

              </NavLink>
            );
          })}

          <a
            href="#ml-app"
            onClick={openMlApp}
            className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-slate-700 hover:bg-orange-50 hover:text-orange-600"
          >
            <Clock3 size={19} strokeWidth={2} />
            <span>ETA prediction using ML model</span>
          </a>

        </nav>
      </div>

      {/* System Status */}
      <div className="mt-auto p-4">

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

          <div className="flex items-center gap-2">

            <Activity
              size={17}
              className="text-slate-500"
            />

            <p className="text-xs font-medium text-slate-500">
              System Status
            </p>

          </div>

          <div className="flex items-center gap-2 mt-3">

            <span className="relative flex h-3 w-3">

              {health.state === "ok" && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-40 animate-ping"></span>
              )}

              <span className={`relative inline-flex h-3 w-3 rounded-full ${healthStyle.dot}`}></span>

            </span>

            <span className={`text-sm font-semibold ${healthStyle.text}`}>
              {health.label}
            </span>

          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full mt-4 pt-3 border-t border-slate-200 flex items-center gap-3 text-slate-600 font-medium hover:text-orange-600 transition-all"
          >

            <LogOut size={18} />

            <span>
              Logout
            </span>

          </button>

        </div>

      </div>

    </aside>
  );
}

export default Sidebar;
