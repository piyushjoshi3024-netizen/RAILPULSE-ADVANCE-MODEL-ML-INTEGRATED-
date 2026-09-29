import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { TrainFront } from "lucide-react";

import {
    registerStaff,
    sendStaffOTP,
} from "../services/authService";

const StaffRegister = () => {
    const navigate = useNavigate();

    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        employeeId: "",
    });

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            setLoading(true);
            setError("");

            await registerStaff(form);

            await sendStaffOTP({
                employeeId: form.employeeId,
                email: form.email,
            });

            navigate("/staff/verify-otp", {
                state: {
                    email: form.email,
                },
            });
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">

            <div className="w-full max-w-5xl bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">

                <div className="grid grid-cols-1 md:grid-cols-2">

                    {/* ================= LEFT SIDE ================= */}

                    <div className="p-8 md:p-12 flex flex-col justify-center">

                        {/* Logo */}

                        <div className="flex items-center gap-3 mb-12">

                            <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center">
                                <TrainFront
                                    size={27}
                                    strokeWidth={2.2}
                                    className="text-white"
                                />
                            </div>

                            <div>
                                <h2 className="text-xl font-bold text-gray-900">
                                    RailPulse
                                </h2>

                                <p className="text-sm text-gray-400">
                                    Railway Intelligence
                                </p>
                            </div>

                        </div>

                        <p className="text-orange-500 font-semibold mb-3">
                            Railway Operations
                        </p>

                        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
                            Intelligence for{" "}
                            <span className="text-orange-500">
                                better journeys.
                            </span>
                        </h1>

                        <p className="text-gray-500 leading-7 mt-6 max-w-md">
                            Create your RailPulse staff account and access
                            railway operations, live train monitoring,
                            journey intelligence and operational tools.
                        </p>

                        {/* Features */}

                        <div className="grid grid-cols-3 gap-4 mt-10 max-w-md">

                            <div>
                                <p className="text-orange-500 font-bold text-lg">
                                    ETA
                                </p>
                                <p className="text-gray-400 text-sm">
                                    Prediction
                                </p>
                            </div>

                            <div>
                                <p className="text-orange-500 font-bold text-lg">
                                    Live
                                </p>
                                <p className="text-gray-400 text-sm">
                                    Monitoring
                                </p>
                            </div>

                            <div>
                                <p className="text-orange-500 font-bold text-lg">
                                    Risk
                                </p>
                                <p className="text-gray-400 text-sm">
                                    Analysis
                                </p>
                            </div>

                        </div>

                        <div className="flex items-center gap-2 mt-12">

                            <span className="w-2 h-2 bg-orange-500 rounded-full"></span>

                            <span className="text-sm text-gray-400">
                                Railway Intelligence Platform
                            </span>

                        </div>

                    </div>


                    {/* ================= RIGHT SIDE ================= */}

                    <div className="p-8 md:p-12">

                        <div className="max-w-md mx-auto">

                            <h1 className="text-3xl font-bold text-gray-900">
                                Staff Registration
                            </h1>

                            <p className="text-gray-500 mt-2 mb-8">
                                Register your railway staff account
                            </p>


                            {/* ERROR */}

                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-5 text-sm">
                                    {error}
                                </div>
                            )}


                            <form
                                onSubmit={handleSubmit}
                                className="space-y-5"
                            >

                                {/* NAME */}

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Full Name
                                    </label>

                                    <input
                                        type="text"
                                        name="name"
                                        placeholder="Enter your full name"
                                        value={form.name}
                                        onChange={handleChange}
                                        className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900 bg-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition"
                                        required
                                    />
                                </div>


                                {/* EMPLOYEE ID */}

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Employee ID
                                    </label>

                                    <input
                                        type="text"
                                        name="employeeId"
                                        placeholder="e.g. RP1003"
                                        value={form.employeeId}
                                        onChange={handleChange}
                                        className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900 bg-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition"
                                        required
                                    />
                                </div>


                                {/* EMAIL */}

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Official Email
                                    </label>

                                    <input
                                        type="email"
                                        name="email"
                                        placeholder="Enter your official email"
                                        value={form.email}
                                        onChange={handleChange}
                                        className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900 bg-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition"
                                        required
                                    />
                                </div>


                                {/* PASSWORD */}

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Password
                                    </label>

                                    <input
                                        type="password"
                                        name="password"
                                        placeholder="Create a password"
                                        value={form.password}
                                        onChange={handleChange}
                                        className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900 bg-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition"
                                        required
                                    />
                                </div>


                                {/* REGISTER BUTTON */}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold py-3.5 rounded-xl transition"
                                >
                                    {loading
                                        ? "Sending OTP..."
                                        : "Register & Send OTP"}
                                </button>

                            </form>


                            {/* PASSENGER REGISTRATION */}

                            <div className="text-center mt-7">

                                <p className="text-gray-500 text-sm">
                                    Want to register as a passenger?{" "}

                                    <Link
                                        to="/register"
                                        className="text-orange-500 font-semibold hover:text-orange-600"
                                    >
                                        Register as Passenger
                                    </Link>
                                </p>

                            </div>


                            {/* LOGIN */}

                            <p className="text-center mt-4 text-sm text-gray-500">

                                Already have an account?{" "}

                                <Link
                                    to="/login"
                                    className="text-orange-500 font-semibold hover:text-orange-600"
                                >
                                    Login
                                </Link>

                            </p>


                            {/* SECURITY */}

                            <div className="border-t border-gray-100 mt-8 pt-6 text-center">

                                <p className="text-xs text-gray-400">
                                    Secure RailPulse staff access
                                </p>

                            </div>

                        </div>

                    </div>

                </div>

            </div>

        </div>
    );
};

export default StaffRegister;