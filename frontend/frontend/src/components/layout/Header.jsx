import { Menu, UserCircle } from "lucide-react";

import { HEALTH_STYLES, useServiceHealth } from "../../hooks/useServiceHealth";
import { useAuth } from "../../context/AuthContext";

function Header({ onOpenSidebar = () => {}, menuButtonRef = null }) {
  const health = useServiceHealth();
  const healthStyle = HEALTH_STYLES[health.state];
  const { user } = useAuth();

  return (
    <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between gap-3 px-4 sm:px-8">

      <div className="flex items-center gap-3 min-w-0">

        <button
          type="button"
          ref={menuButtonRef}
          onClick={onOpenSidebar}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          aria-label="Open navigation"
          aria-controls="main-sidebar"
        >
          <Menu size={22} />
        </button>

        <p className="text-sm text-slate-500 truncate">
          Real-time railway intelligence and control
        </p>

      </div>

      <div className="flex items-center gap-3">
        {/* The label is the measured state of both services, not decoration. */}
        <div
          className={`hidden sm:flex items-center gap-2 px-4 py-2 rounded-full border ${healthStyle.chip}`}
          title="Measured from the API and ML health endpoints"
        >
          <span className={`w-2 h-2 rounded-full ${healthStyle.dot}`}></span>

          <span className={`text-sm font-medium ${healthStyle.text}`}>
            {health.label}
          </span>
        </div>

        <div
          className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0"
          title={user?.username ? `Signed in as ${user.username}` : "Signed in"}
        >
          <UserCircle size={22} className="text-blue-600" />
        </div>
      </div>

    </header>
  );
}

export default Header;
