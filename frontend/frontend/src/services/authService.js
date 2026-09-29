const API_URL = "http://localhost:5000/api/auth";

export const registerStaff = async (data) => {
    const response = await fetch(`${API_URL}/register-staff`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "Staff registration failed");
    }

    return result;
};

export const sendStaffOTP = async (data) => {
    const response = await fetch(`${API_URL}/staff/send-otp`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "Failed to send OTP");
    }

    return result;
};

export const verifyStaffOTP = async (data) => {
    const response = await fetch(`${API_URL}/staff/verify-otp`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "OTP verification failed");
    }

    return result;
};