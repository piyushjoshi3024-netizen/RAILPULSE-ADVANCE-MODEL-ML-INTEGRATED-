import { useEffect, useState } from "react";

import { API_HEALTH_URL, ML_HEALTH_URL } from "../config";

const POLL_MS = 30000;

/**
 * The real state of the two backends.
 *
 * The sidebar and the header used to print "Operational" and "System Online"
 * as literal text, which stayed green with every service down. This asks the
 * two health endpoints instead, and reports "unknown" until an answer
 * arrives rather than assuming the happy one.
 *
 * Both endpoints are unauthenticated reads and neither writes anything.
 */
export function useServiceHealth() {
    const [health, setHealth] = useState({ api: "unknown", ml: "unknown" });

    useEffect(() => {
        let cancelled = false;
        let timer = null;

        const probe = async (url) => {
            try {
                const response = await fetch(url, { headers: { Accept: "application/json" } });
                return response.ok ? "ok" : "down";
            } catch {
                return "down";
            }
        };

        const check = async () => {
            const [api, ml] = await Promise.all([
                probe(API_HEALTH_URL),
                probe(ML_HEALTH_URL),
            ]);

            if (cancelled) return;

            setHealth({ api, ml });
            timer = window.setTimeout(check, POLL_MS);
        };

        check();

        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
        };
    }, []);

    const { api, ml } = health;

    if (api === "unknown" || ml === "unknown") {
        return { ...health, state: "unknown", label: "Checking services" };
    }

    if (api === "ok" && ml === "ok") {
        return { ...health, state: "ok", label: "Operational" };
    }

    if (api === "down" && ml === "down") {
        return { ...health, state: "down", label: "Both services unreachable" };
    }

    return {
        ...health,
        state: "degraded",
        label: api === "down" ? "Main API unreachable" : "ML service unreachable",
    };
}

/** Tailwind classes per state, kept here so the two surfaces agree. */
export const HEALTH_STYLES = {
    ok: { dot: "bg-green-500", text: "text-green-700", chip: "border-green-200 bg-green-50" },
    degraded: { dot: "bg-amber-500", text: "text-amber-700", chip: "border-amber-200 bg-amber-50" },
    down: { dot: "bg-red-500", text: "text-red-700", chip: "border-red-200 bg-red-50" },
    unknown: { dot: "bg-slate-400", text: "text-slate-600", chip: "border-slate-200 bg-slate-50" },
};
