import { getAlerts } from "../services/alertService";
import { ALERTS_POLL_MS } from "../config/polling";
import { useResource } from "./useResource";

/**
 * The stored alerts.
 *
 * Note the endpoint: `GET /api/alerts`. `GET /api/alerts/:trainId` does not
 * read an alert, it creates one, which is why opening the old Alerts page
 * wrote a row every time. Nothing here calls it.
 */
export function useAlerts({ poll = true } = {}) {
    const resource = useResource((signal) => getAlerts(signal), {
        pollMs: poll ? ALERTS_POLL_MS : 0,
        initialData: [],
        errorMessage: "Could not load alerts.",
    });

    return { ...resource, alerts: Array.isArray(resource.data) ? resource.data : [] };
}

export default useAlerts;
