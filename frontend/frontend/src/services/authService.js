import { API_BASE_URL } from "../config";

// Retained for reference only: every endpoint below now answers 410 Gone, and
// the two pages that used them no longer submit. See StaffRegister.jsx.
const API_URL = API_BASE_URL;

/**
 * POST a JSON body and return the parsed response.
 *
 * Express answers an unknown route with an HTML 404 page, so parsing the body
 * as JSON unconditionally turned "that route does not exist" into a syntax
 * error on the user's screen. The content type is checked first, and a
 * non-JSON reply is reported as what it is.
 */
const postJson = async (path, data) => {
    const response = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    });

    const isJson = (response.headers.get("content-type") || "")
        .includes("application/json");

    if (!isJson) {
        throw new Error(
            `The server did not return a JSON response (HTTP ${response.status}) for ${path}.`
        );
    }

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || `Request to ${path} failed`);
    }

    return result;
};

export const registerStaff = async (data) => {
    return postJson("/auth/register-staff", data);
};

// The OTP endpoints are mounted on /api/staff-auth, not under /api/auth.
export const sendStaffOTP = async (data) => {
    return postJson("/staff-auth/send-otp", data);
};

export const verifyStaffOTP = async (data) => {
    return postJson("/staff-auth/verify-otp", data);
};
