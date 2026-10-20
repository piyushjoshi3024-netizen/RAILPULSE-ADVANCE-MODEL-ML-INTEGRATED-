import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import MainLayout from "./components/layout/MainLayout";

import Dashboard from "./pages/Dashboard";
import CommandCenter from "./pages/CommandCenter";
import Trains from "./pages/Trains";
import NetworkMap from "./pages/NetworkMap";
import JourneyManagement from "./pages/JourneyManagement";
import ETAPrediction from "./pages/ETAPrediction";
import Simulation from "./pages/Simulation";
import Alerts from "./pages/Alerts";

import Login from "./pages/Login";
import Register from "./pages/Register";
import StaffRegister from "./pages/StaffRegister";
import StaffOTP from "./pages/StaffOTP";

import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";

/**
 * The entry point sends people where they can actually go: the dashboard when
 * they are signed in, the login form when they are not. It used to render the
 * registration form, which meant the sidebar's own "Dashboard" link and every
 * wrong-role redirect landed a signed-in user on a signup page.
 */
function Entry() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Navigate
      to={isAuthenticated ? "/dashboard" : "/login"}
      replace
    />
  );
}

/** Shown inside the app shell for a path that does not exist. */
function NotFound() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">
        Page not found
      </h1>

      <p className="mt-2 text-slate-500">
        This address does not match any page in RailPulse.
      </p>

      <a
        href="/dashboard"
        className="mt-6 inline-block rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
      >
        Go to the dashboard
      </a>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          {/* =========================
              PUBLIC ROUTES
          ========================= */}

          {/* Entry point: dashboard when signed in, login when not */}
          <Route path="/" element={<Entry />} />

          <Route
            path="/register"
            element={<Register />}
          />

          <Route
            path="/login"
            element={<Login />}
          />

          {/* Staff Registration */}
          <Route
            path="/register/staff"
            element={<StaffRegister />}
          />

          {/* Staff OTP Verification */}
          <Route
            path="/staff/verify-otp"
            element={<StaffOTP />}
          />


          {/* =========================
              PROTECTED APPLICATION
          ========================= */}

          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <MainLayout>

                  <Routes>

                    {/* Dashboard */}
                    <Route
                      path="/dashboard"
                      element={<Dashboard />}
                    />

                    {/* Operations */}
                    <Route
                      path="/operations"
                      element={
                        <RoleRoute
                          allowedRoles={["STAFF", "ADMIN"]}
                        >
                          <CommandCenter />
                        </RoleRoute>
                      }
                    />

                    {/* Trains */}
                    <Route
                      path="/trains"
                      element={<Trains />}
                    />

                    {/* Network Map */}
                    <Route
                      path="/map"
                      element={<NetworkMap />}
                    />

                    {/* Journey */}
                    <Route
                      path="/journey"
                      element={<JourneyManagement />}
                    />

                    {/* ETA */}
                    <Route
                      path="/eta"
                      element={<ETAPrediction />}
                    />

                    {/* Simulation */}
                    <Route
                      path="/simulation"
                      element={
                        <RoleRoute
                          allowedRoles={["STAFF", "ADMIN"]}
                        >
                          <Simulation />
                        </RoleRoute>
                      }
                    />

                    {/* Alerts */}
                    <Route
                      path="/alerts"
                      element={<Alerts />}
                    />

                    {/* Anything else inside the shell */}
                    <Route
                      path="*"
                      element={<NotFound />}
                    />

                  </Routes>

                </MainLayout>
              </ProtectedRoute>
            }
          />

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;