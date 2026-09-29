import { useState } from "react";
import { TrainFront } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

function Login() {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();

        setLoading(true);
        setError("");

        try {
            const response = await api.post("/auth/login", {
                email,
                password,
            });

            const { token, user } = response.data;

            login(token, user);

            navigate("/dashboard");
        } catch (error) {
            console.error(error);

            setError(
                error.response?.data?.message ||
                "Invalid email or password"
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-10">
            <div className="w-full max-w-5xl">
                <div className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden">
                    <div className="grid md:grid-cols-2">

                        <div className="relative bg-white p-10 lg:p-12 flex flex-col justify-between border-b md:border-b-0 md:border-r border-gray-200">

                            <div className="absolute top-0 left-0 w-full h-1 bg-orange-500" />

                            <div>
                                <div className="flex items-center gap-3 mb-12">
                                    <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center shadow-sm">
                                        <TrainFront size={24} className="text-white" />
                                    </div>

                                    <div>
                                        <h1 className="text-xl font-bold text-black">
                                            RailPulse
                                        </h1>

                                        <p className="text-xs text-gray-500">
                                            Railway Intelligence
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-orange-500 text-sm font-semibold mb-3">
                                        Railway Operations
                                    </p>

                                    <h2 className="text-3xl lg:text-4xl font-bold text-black leading-tight">
                                        Intelligence for
                                        <br />
                                        <span className="text-orange-500">
                                            better journeys.
                                        </span>
                                    </h2>

                                    <p className="text-gray-500 mt-5 leading-relaxed max-w-sm">
                                        Monitor trains, track operations,
                                        predict delays and stay informed
                                        with RailPulse.
                                    </p>
                                </div>

                                <div className="mt-10 grid grid-cols-3 gap-3">

                                    <div className="border border-gray-200 rounded-xl p-4">
                                        <div className="text-orange-500 font-bold text-lg">
                                            ETA
                                        </div>

                                        <p className="text-xs text-gray-500 mt-1">
                                            Prediction
                                        </p>
                                    </div>

                                    <div className="border border-gray-200 rounded-xl p-4">
                                        <div className="text-orange-500 font-bold text-lg">
                                            Live
                                        </div>

                                        <p className="text-xs text-gray-500 mt-1">
                                            Monitoring
                                        </p>
                                    </div>

                                    <div className="border border-gray-200 rounded-xl p-4">
                                        <div className="text-orange-500 font-bold text-lg">
                                            Risk
                                        </div>

                                        <p className="text-xs text-gray-500 mt-1">
                                            Analysis
                                        </p>
                                    </div>

                                </div>
                            </div>

                            <div className="mt-12 flex items-center gap-2 text-xs text-gray-400">
                                <span className="w-2 h-2 rounded-full bg-orange-500" />
                                Railway Intelligence Platform
                            </div>

                        </div>

                        <div className="p-8 sm:p-10 lg:p-12 flex items-center">

                            <div className="w-full max-w-md mx-auto">

                                <div className="mb-8">
                                    <h2 className="text-3xl font-bold text-black">
                                        Welcome back
                                    </h2>

                                    <p className="text-gray-500 mt-2">
                                        Sign in to access your RailPulse dashboard.
                                    </p>
                                </div>

                                <form
                                    onSubmit={handleSubmit}
                                    className="space-y-5"
                                >

                                    <div>
                                        <label className="block text-sm font-semibold text-black mb-2">
                                            Email
                                        </label>

                                        <div className="relative">

                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                                <svg
                                                    width="18"
                                                    height="18"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                >
                                                    <rect
                                                        x="3"
                                                        y="5"
                                                        width="18"
                                                        height="14"
                                                        rx="2"
                                                    />

                                                    <path d="m3 7 9 6 9-6" />
                                                </svg>
                                            </div>

                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) =>
                                                    setEmail(e.target.value)
                                                }
                                                placeholder="Enter email"
                                                required
                                                className="w-full pl-11 pr-4 py-3.5 border border-gray-300 rounded-xl outline-none bg-white !text-black !placeholder:text-gray-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all"
                                            />

                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-black mb-2">
                                            Password
                                        </label>

                                        <div className="relative">

                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                                <svg
                                                    width="18"
                                                    height="18"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                >
                                                    <rect
                                                        x="4"
                                                        y="10"
                                                        width="16"
                                                        height="11"
                                                        rx="2"
                                                    />

                                                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                                                </svg>
                                            </div>

                                            <input
                                                type="password"
                                                value={password}
                                                onChange={(e) =>
                                                    setPassword(e.target.value)
                                                }
                                                placeholder="Enter password"
                                                required
                                                className="w-full pl-11 pr-4 py-3.5 border border-gray-300 rounded-xl outline-none bg-white !text-black !placeholder:text-gray-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all"
                                            />

                                        </div>
                                    </div>

                                    {error && (
                                        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                                            {error}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold transition-all shadow-sm"
                                    >
                                        {loading ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                Signing in...
                                            </span>
                                        ) : (
                                            "Sign In"
                                        )}
                                    </button>

                                </form>

                            {/* Navigation options */}
                            <div className="mt-6 flex items-center justify-between">

                                {/* Back */}
                                <button
                                    type="button"
                                    onClick={() => navigate("/register")}
                                    className="text-sm text-gray-500 hover:text-gray-700 font-medium"
                                >
                                    ← Back
                                </button>

                                {/* Register */}
                                <p className="text-sm text-gray-500">
                                    Not registered?{" "}
                                    <button
                                        type="button"
                                        onClick={() => navigate("/register")}
                                        className="text-orange-500 font-semibold hover:text-orange-600 hover:underline"
                                    >
                                        Register
                                    </button>
                                </p>

                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-100">

                                    <div className="flex items-center justify-center gap-2 text-xs text-gray-400">

                                        <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />
                                            <path d="m9 12 2 2 4-4" />
                                        </svg>

                                        Secure RailPulse access

                                    </div>

                                </div>

                            </div>

                        </div>

                    </div>
                </div>

                <p className="text-center text-xs text-gray-400 mt-6">
                    RailPulse · Railway Intelligence
                </p>

            </div>
        </div>
    );
}

export default Login;