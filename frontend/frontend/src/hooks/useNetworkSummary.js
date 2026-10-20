import { getNetworkSummary } from "../services/networkService";
import { LIVE_POLL_MS } from "../config/polling";
import { useResource } from "./useResource";

/**
 * The network summary.
 *
 * `summary` is defaulted to zeroes so a card can read `summary.totalTrains`
 * before the first answer. A zero here is a real zero, not a placeholder: the
 * database is empty until the demo seed is applied.
 */
const EMPTY_SUMMARY = {
    totalTrains: 0,
    activeTrains: 0,
    delayedTrains: 0,
    averageDelayMinutes: 0,
    highDelayTrains: 0,
};

export function useNetworkSummary({ poll = true } = {}) {
    const resource = useResource((signal) => getNetworkSummary(signal), {
        pollMs: poll ? LIVE_POLL_MS : 0,
        errorMessage: "Could not load the network summary.",
    });

    return {
        ...resource,
        summary: resource.data?.summary || EMPTY_SUMMARY,
        networkStatus: resource.data?.networkStatus || "UNKNOWN",
        affectedStations: resource.data?.affectedStations || [],
    };
}

export default useNetworkSummary;
