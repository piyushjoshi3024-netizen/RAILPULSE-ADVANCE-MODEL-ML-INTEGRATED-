import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up to itself -- once.
 *
 * The brief asks for a count-up "on first load only". That qualifier is the
 * important half: these figures sit behind a 15-second poll, and a stat card
 * that re-rolls its digits every fifteen seconds is unreadable, not polished.
 * So the animation runs on the first real value and never again; later polls
 * set the number directly.
 *
 * It animates only what it is given. A `null`, an `undefined` or a
 * non-number is rendered as the fallback, never as a zero, because "0 trains
 * delayed" and "we do not know yet" are different facts.
 */

const prefersReducedMotion = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function CountUp({ value, duration = 700, decimals = 0, fallback = "--" }) {
    const isNumber = typeof value === "number" && Number.isFinite(value);
    const [display, setDisplay] = useState(isNumber ? value : 0);
    const hasAnimated = useRef(false);

    useEffect(() => {
        if (!isNumber) return undefined;

        // Second value onwards, and anyone who asked for less motion: no
        // animation, just the truth.
        if (hasAnimated.current || prefersReducedMotion()) {
            setDisplay(value);
            return undefined;
        }

        hasAnimated.current = true;

        const from = 0;
        const start = performance.now();
        let frame = 0;

        const step = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            // ease-out cubic: fast first, settles gently, no overshoot past
            // the real figure.
            const eased = 1 - Math.pow(1 - progress, 3);

            setDisplay(from + (value - from) * eased);

            if (progress < 1) {
                frame = requestAnimationFrame(step);
            } else {
                setDisplay(value);
            }
        };

        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [value, isNumber, duration]);

    if (!isNumber) return <>{fallback}</>;

    return <>{display.toFixed(decimals)}</>;
}

export default CountUp;
