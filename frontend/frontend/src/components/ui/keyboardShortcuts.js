/**
 * The shortcut table, in one place so the handler and the help overlay cannot
 * disagree about what a key does.
 *
 * Navigation is a Gmail-style chord: press `g`, then a letter. A chord avoids
 * giving single letters global meaning, which would fight with any future
 * type-ahead and would fire the moment a key was pressed anywhere.
 */
export const NAV_SHORTCUTS = [
    { keys: ["g", "d"], label: "Go to Dashboard", path: "/dashboard" },
    { keys: ["g", "c"], label: "Go to Command Centre", path: "/operations", staffOnly: true },
    { keys: ["g", "t"], label: "Go to Trains", path: "/trains" },
    { keys: ["g", "m"], label: "Go to Network Map", path: "/map" },
    { keys: ["g", "j"], label: "Go to Journey Management", path: "/journey" },
    { keys: ["g", "e"], label: "Go to ETA Prediction", path: "/eta" },
    { keys: ["g", "s"], label: "Go to Simulation", path: "/simulation", staffOnly: true },
    { keys: ["g", "a"], label: "Go to Alerts", path: "/alerts" },
];

export const ACTION_SHORTCUTS = [
    { keys: ["\\"], label: "Toggle light / dark theme", action: "theme" },
    { keys: ["?"], label: "Show this shortcuts list", action: "help" },
];

/** True when the event target is somewhere the user is typing. */
export function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable === true
    );
}
