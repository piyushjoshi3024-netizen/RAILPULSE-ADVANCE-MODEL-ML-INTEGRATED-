import { useEffect, useRef, useState } from "react";

/**
 * "Has this list just arrived for the first time?"
 *
 * This is the whole answer to the UI-2 requirement that a staggered
 * entrance must not re-run on the 15-second poll. The page asks once, when
 * its data is ready; the flag is true for the length of the animation and
 * false forever after, so every later refresh renders the same elements
 * with no animation class on them and nothing moves.
 *
 * Pass `ready` as "the first real answer is in" -- normally
 * `!loading && rows.length > 0`. Passing a value that flips back and forth
 * would not restart it: `doneRef` latches.
 *
 * It lives in `components/ui` rather than `src/hooks` because it is part of
 * the presentation layer -- it fetches nothing.
 */
export function useFirstReveal(ready) {
    const doneRef = useRef(false);
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (!ready || doneRef.current) return undefined;

        doneRef.current = true;
        setActive(true);

        // Longest possible run: 220ms animation + the capped 400ms stagger,
        // rounded up. After this the class comes off, which is what makes a
        // later remount (a filter change, say) silent instead of twitchy.
        const timer = setTimeout(() => setActive(false), 700);
        return () => clearTimeout(timer);
    }, [ready]);

    return active;
}

export default useFirstReveal;
