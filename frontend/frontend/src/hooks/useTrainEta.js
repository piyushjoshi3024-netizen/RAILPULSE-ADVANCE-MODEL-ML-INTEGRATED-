import { getTrainETA } from "../services/etaService";
import { useResource } from "./useResource";

/**
 * One train's ETA prediction from the ML service, via the Express API.
 *
 * `GET /api/trains/:id/eta` is the one data route that requires a token
 * (eta.routes.js), so this hook is only useful to a signed-in page. It stays
 * disabled until a train is chosen, which is why `enabled` is keyed on the id
 * rather than the hook being called conditionally.
 */
export function useTrainEta(trainId, { poll = 0 } = {}) {
    const resource = useResource((signal) => getTrainETA(trainId, signal), {
        enabled: Boolean(trainId),
        pollMs: poll,
        errorMessage: "Could not load the ETA prediction.",
        deps: [trainId],
    });

    return { ...resource, eta: resource.data || null };
}

export default useTrainEta;
