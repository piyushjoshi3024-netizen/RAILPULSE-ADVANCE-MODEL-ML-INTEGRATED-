import { getTrainEvents } from "../services/trainEventService";
import { LIVE_POLL_MS } from "../config/polling";
import { useResource } from "./useResource";

/**
 * The event stream, plus the "latest event per train" view every page builds.
 *
 * Three pages wrote that same reduction by hand (Dashboard, CommandCenter and
 * the network service on the server). It is computed once here, keyed by the
 * train id as a string because a Mongo ObjectId and its string form are not
 * the same Map key.
 */
export function useTrainEvents({ poll = true } = {}) {
    const resource = useResource((signal) => getTrainEvents(signal), {
        pollMs: poll ? LIVE_POLL_MS : 0,
        initialData: [],
        errorMessage: "Could not load train events.",
    });

    const events = Array.isArray(resource.data) ? resource.data : [];

    const latestByTrain = new Map();
    [...events]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .forEach((event) => {
            const key = String(event.trainId);
            if (!latestByTrain.has(key)) latestByTrain.set(key, event);
        });

    return { ...resource, events, latestByTrain };
}

export default useTrainEvents;
