import api from "./api";

/**
 * Static reference geography.
 *
 * Stations and corridors do not change while trains run, so these are fetched
 * once per mount and never polled. The coordinates live only in the station
 * list; a corridor names station codes, and the client resolves them.
 */
export const getStations = (signal) => api.get("/stations", { signal });

export const getCorridors = (signal) => api.get("/corridors", { signal });
