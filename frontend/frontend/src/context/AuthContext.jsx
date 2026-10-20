import { createContext, useContext, useEffect, useState } from "react";
import authApi from "../services/authApi";
import {
    clearStoredSession,
    consumeMlHandoff,
    getToken,
    mlLogoutUrl,
    storeSession,
} from "../services/session";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = getToken();

        if (!token) {
            setLoading(false);
            return;
        }

        const verifyUser = async () => {
            try {
                // FastAPI answers with the user object itself:
                // { username, role, full_name }.
                const response = await authApi.get("/auth/me");

                setUser(response.data);
                storeSession(token, response.data);
            } catch (error) {
                console.error("Authentication verification failed");

                clearStoredSession();
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        verifyUser();
    }, []);

    const login = (token, userData) => {
        storeSession(token, userData);
        setUser(userData);
    };

    /**
     * End the session here, and in the ML app when one was handed to it.
     *
     * The two applications are different origins, so this page cannot reach
     * the ML app's storage. The only reliable way to clear it is a real
     * top-level visit to its sign-out route, which then returns here. That
     * round trip is visible, so it is only made when this browser actually
     * handed a session over; otherwise sign-out stays local and instant.
     *
     * Neither path revokes the token server-side. It stays valid until it
     * expires, which is 60 minutes after it was issued.
     *
     * @returns {boolean} true when the caller should navigate itself, false
     *   when a cross-app sign-out has taken over the page.
     */
    const logout = () => {
        const handedToMl = consumeMlHandoff();

        clearStoredSession();
        setUser(null);

        if (handedToMl) {
            window.location.assign(
                mlLogoutUrl(`${window.location.origin}/login?signedout=1`)
            );
            return false;
        }

        return true;
    };

    const value = {
        user,
        loading,
        isAuthenticated: !!user,
        login,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}