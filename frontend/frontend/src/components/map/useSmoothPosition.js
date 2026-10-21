import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const same = (a, b) =>
    Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];

/**
 * Slide a marker from where it was to where it now is.
 *
 * The rule this obeys, and the reason the code is shaped this way: both
 * endpoints are positions the API actually reported. It interpolates
 * *between two real consecutive readings* and does nothing else. It never
 * extrapolates, never advances a marker on a timer, and never moves a train
 * that the API has not moved.
 *
 * That matters here because this file's ancestor did the opposite. The old
 * `MovingTrain` ran a `setInterval` that slid a marker 0.008 of a corridor
 * segment every second -- motion nothing had measured, rendered identically
 * to motion that had been. It was deleted for that, and this is not it
 * coming back.
 *
 * A consequence worth knowing: on the current seed the API serves exactly
 * one event per train, so a poll returns the same station every time, the
 * target never changes, and this hook correctly animates nothing. It will
 * animate as soon as a train's reported station actually changes.
 */
export function useSmoothPosition(target, duration = 1200) {
    // The coordinate pair is destructured into primitives before it reaches
    // any dependency array. `target` is a fresh array on every render, so an
    // effect keyed on it would re-run every render, call setPosition with
    // another fresh array, and re-render forever.
    const lat = target?.[0] ?? null;
    const lng = target?.[1] ?? null;

    const [position, setPosition] = useState(target || null);
    const fromRef = useRef(target || null);
    const frameRef = useRef(0);

    useEffect(() => {
        if (lat === null || lng === null) return undefined;

        const to = [lat, lng];
        const from = fromRef.current;

        // First real position, a position appearing after none, or no actual
        // change: take it as given. Nothing to interpolate between.
        if (!from || same(from, to) || prefersReducedMotion()) {
            fromRef.current = to;
            setPosition(to);
            return undefined;
        }

        const start = performance.now();

        const step = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            // ease-in-out: leaves and arrives gently, so a train does not
            // appear to jump at either end of the leg.
            const eased =
                progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            setPosition([
                from[0] + (to[0] - from[0]) * eased,
                from[1] + (to[1] - from[1]) * eased,
            ]);

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(step);
            } else {
                // Land exactly on the reported coordinate, not on whatever
                // the last eased step happened to compute.
                fromRef.current = to;
                setPosition(to);
            }
        };

        frameRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frameRef.current);
    }, [lat, lng, duration]);

    return position || target;
}

export default useSmoothPosition;
