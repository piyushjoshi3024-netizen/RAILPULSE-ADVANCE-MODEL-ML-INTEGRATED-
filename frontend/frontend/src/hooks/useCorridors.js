import { getCorridors } from "../services/referenceService";
import { STATIC_POLL_MS } from "../config/polling";
import { useResource } from "./useResource";

/**
 * The corridors, already resolved into polyline coordinates.
 *
 * A corridor is stored as ordered station codes, deliberately without
 * geometry: the coordinates belong to the station list and a second copy would
 * drift from it. The resolution happens here so no page repeats it.
 *
 * The station list is passed in rather than fetched here. An earlier version
 * called `useStations` internally, which meant a page needing both -- every
 * page with a map -- asked for `/api/stations` twice per mount.
 *
 * A code with no station is dropped from the line rather than breaking it, and
 * `missing` reports what was dropped, so a page can say so instead of drawing
 * a silently shortened route.
 *
 * @param stations the result of `useStations()`
 */
export function useCorridors(stations) {
    const resource = useResource((signal) => getCorridors(signal), {
        pollMs: STATIC_POLL_MS,
        initialData: [],
        errorMessage: "Could not load corridors.",
    });

    const raw = Array.isArray(resource.data) ? resource.data : [];

    const corridors = raw.map((corridor) => {
        const resolved = (corridor.stations || []).map((code) => ({
            code,
            station: stations?.byCode?.get(code),
        }));

        return {
            ...corridor,
            positions: resolved
                .map(({ station }) => stations?.positionOf?.(station) || null)
                .filter(Boolean),
            missing: resolved.filter(({ station }) => !station).map(({ code }) => code),
        };
    });

    return {
        ...resource,
        corridors,
        // Either request failing leaves the map unable to draw a line.
        loading: resource.loading || Boolean(stations?.loading),
        error: resource.error || stations?.error || "",
    };
}

export default useCorridors;
