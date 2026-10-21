import { getTrains } from "../services/trainService";
import { LIVE_POLL_MS } from "../config/polling";
import { useResource } from "./useResource";

/**
 * Every train the API knows.
 *
 * `data` is always an array, so a page can map over it before the first
 * answer arrives and does not need its own `|| []`.
 */
export function useTrains({ poll = true } = {}) {
    const resource = useResource((signal) => getTrains(signal), {
        pollMs: poll ? LIVE_POLL_MS : 0,
        initialData: [],
        errorMessage: "Could not load trains.",
    });

    return { ...resource, trains: Array.isArray(resource.data) ? resource.data : [] };
}

export default useTrains;
