import api from "./api";

/** The network summary: totals, delays and affected stations. */
export const getNetworkSummary = (signal) =>
    api.get("/operations/network", { signal });
