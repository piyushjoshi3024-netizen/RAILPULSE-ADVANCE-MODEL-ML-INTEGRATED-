import { getStations } from "../services/referenceService";
import { STATIC_POLL_MS } from "../config/polling";
import { useResource } from "./useResource";

/**
 * The station list, and the two lookups the maps need.
 *
 * This replaces the identical array that was written into both Dashboard.jsx
 * and NetworkMap.jsx. It is static reference data and is never polled.
 *
 * `byCode` and `byName` exist because the two joins in this app key
 * differently: a corridor names codes, while a TrainEvent names a station by
 * its name. A station missing from the lookup yields `undefined`, and the
 * caller is expected to draw nothing rather than invent a point.
 */
export function useStations() {
    const resource = useResource((signal) => getStations(signal), {
        pollMs: STATIC_POLL_MS,
        initialData: [],
        errorMessage: "Could not load stations.",
    });

    const stations = Array.isArray(resource.data) ? resource.data : [];

    const byCode = new Map(stations.map((station) => [station.code, station]));
    const byName = new Map(stations.map((station) => [station.name, station]));

    /** Leaflet wants [lat, lng]; the API stores them as named fields. */
    const positionOf = (station) =>
        station && typeof station.lat === "number" && typeof station.lng === "number"
            ? [station.lat, station.lng]
            : null;

    return { ...resource, stations, byCode, byName, positionOf };
}

export default useStations;
