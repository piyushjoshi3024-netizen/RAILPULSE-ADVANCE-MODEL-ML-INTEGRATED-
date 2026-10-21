/**
 * The simulation presets.
 *
 * These are not data: they are the three branches
 * `POST /api/simulation/passenger` and `/staff` actually implement, so they
 * describe the code, not the database. Decision D-A1: they stay a source
 * constant and get no endpoint. Moved out of Simulation.jsx so the page holds
 * no array of its own.
 */
export const SIMULATION_SCENARIOS = [
    {
        id: 1,
        name: "Train Delay",
        description: "Simulate the effect of a delayed train on the network.",
    },
    {
        id: 2,
        name: "Platform Congestion",
        description: "Simulate platform availability constraints.",
    },
    {
        id: 3,
        name: "High Traffic",
        description: "Simulate increased traffic on a railway corridor.",
    },
];

export default SIMULATION_SCENARIOS;
