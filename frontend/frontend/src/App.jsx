import { BrowserRouter, Routes, Route } from "react-router-dom";

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

import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          {/* =========================
              PUBLIC ROUTES
          ========================= */}

          {/* Open registration first */}
          <Route path="/" element={<Register />} />

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