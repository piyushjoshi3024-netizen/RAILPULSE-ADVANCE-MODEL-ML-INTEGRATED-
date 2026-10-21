/**
 * "updated 12s ago", from a Date.
 *
 * Deliberately coarse past a minute: on a 15-second poll, second-level
 * precision past "a minute ago" is noise, and a figure that changes every
 * render is harder to read than one that changes every minute.
 */
export function relativeTime(date) {
    if (!date) return "";

    const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000));

    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    return new Date(date).toLocaleDateString();
}
