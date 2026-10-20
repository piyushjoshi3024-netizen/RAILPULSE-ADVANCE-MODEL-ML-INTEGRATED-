import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { verifyStaffOTP } from "../services/authService";

const StaffOTP = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // The address arrives in router state from the staff registration step. A
    // reload or a bookmarked visit loses it, and the page used to go on and
    // verify an undefined address.
    const email = location.state?.email;

    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleVerify = async (e) => {
        e.preventDefault();

        try {
            setLoading(true);
            setError("");

            await verifyStaffOTP({
                email,
                otp,
            });

            navigate("/login");
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!email) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center px-4">
                <div className="w-full max-w-md text-center">

                    <h1 className="text-3xl font-bold mb-2">
                        Verify Staff Account
                    </h1>

                    <p className="text-gray-500 mb-8">
                        This page needs the address the code was sent to, and it
                        was not carried over. Start from staff registration again.
                    </p>

                    <Link
                        to="/register/staff"
                        className="inline-block w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg"
                    >
                        Back to staff registration
                    </Link>

                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white flex items-center justify-center px-4">
            <div className="w-full max-w-md">

                <h1 className="text-3xl font-bold text-center mb-2">
                    Verify Staff Account
                </h1>

                <p className="text-gray-500 text-center mb-8">
                    Enter the OTP sent to {email}
                </p>

                {error && (
                    <div className="bg-red-100 text-red-600 p-3 rounded-lg mb-4">
                        {error}
                    </div>
                )}

                <form
                    onSubmit={handleVerify}
                    className="space-y-4"
                >

                    <input
                        type="text"
                        maxLength="6"
                        placeholder="Enter 6-digit OTP"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        className="w-full border rounded-lg p-3 text-center text-xl tracking-widest"
                        required
                    />

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg"
                    >
                        {loading ? "Verifying..." : "Verify OTP"}
                    </button>

                </form>
            </div>
        </div>
    );
};

export default StaffOTP;