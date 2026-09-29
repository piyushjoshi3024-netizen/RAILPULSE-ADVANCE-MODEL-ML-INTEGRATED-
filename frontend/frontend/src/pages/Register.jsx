import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { TrainFront } from "lucide-react";
const Register = () => {
    const navigate = useNavigate();

    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
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

            const response = await fetch(
                "http://localhost:5000/api/auth/register",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(form),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Registration failed");
            }

            alert("Passenger account created successfully!");

            navigate("/login");
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">

            <div className="w-full max-w-5xl bg-white rounded-2xl shadow-lg overflow-hidden grid md:grid-cols-2">

                {/* LEFT SIDE */}
                <div className="hidden md:flex bg-white p-12 flex-col justify-center border-r">

                    <div className="flex items-center gap-3 mb-10">
                        <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center">
                            <TrainFront
                                size={26}
                                strokeWidth={2.5}
                                className="text-white"
                            />
                        </div>

                        <div>
                            <h2 className="text-xl font-bold text-gray-900">
                                RailPulse
                            </h2>

                            <p className="text-sm text-gray-500">
                                Railway Intelligence
                            </p>
                        </div>
                    </div>

                    <p className="text-orange-500 font-semibold mb-3">
                        Railway Operations
                    </p>

                    <h1 className="text-4xl font-bold text-gray-900 leading-tight">
                        Intelligence for
                        <span className="text-orange-500">
                            {" "}better journeys.
                        </span>
                    </h1>

                    <p className="text-gray-500 mt-5 leading-relaxed">
                        Create your RailPulse passenger account and
                        access railway intelligence, journey information
                        and live train updates.
                    </p>

                    <div className="grid grid-cols-3 gap-3 mt-8">

                        <div className="border rounded-xl p-4">
                            <p className="font-bold text-orange-500">ETA</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Prediction
                            </p>
                        </div>

                        <div className="border rounded-xl p-4">
                            <p className="font-bold text-orange-500">Live</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Monitoring
                            </p>
                        </div>

                        <div className="border rounded-xl p-4">
                            <p className="font-bold text-orange-500">Risk</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Analysis
                            </p>
                        </div>

                    </div>

                </div>

                {/* RIGHT SIDE */}
                <div className="p-8 md:p-12">

                    <h1 className="text-3xl font-bold text-gray-900">
                        Create Account
                    </h1>

                    <p className="text-gray-500 mt-2 mb-8">
                        Register as a passenger
                    </p>

                    {/* ERROR */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-5">
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
                                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 bg-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                                required
                            />
                        </div>

                        {/* EMAIL */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Email
                            </label>

                            <input
                                type="email"
                                name="email"
                                placeholder="Enter your email"
                                value={form.email}
                                onChange={handleChange}
                                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 bg-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
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
                                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 bg-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                                required
                            />
                        </div>
                        {/* REGISTER BUTTON */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg"
                        >
                            {loading ? "Creating Account..." : "Register"}
                        </button>

                    </form>

                    {/* STAFF */}
                    <div className="text-center mt-7">

                        <p className="text-gray-500">
                            Are you railway staff?
                        </p>

                        <Link
                            to="/register/staff"
                            className="text-orange-500 font-semibold hover:underline"
                        >
                            Register as Staff
                        </Link>

                    </div>

                    {/* LOGIN */}
                    <p className="text-center mt-5 text-gray-500">
                        Already have an account?{" "}

                        <Link
                            to="/login"
                            className="text-orange-500 font-semibold hover:underline"
                        >
                            Login
                        </Link>
                    </p>

                </div>

            </div>

        </div>
    );
};

export default Register;