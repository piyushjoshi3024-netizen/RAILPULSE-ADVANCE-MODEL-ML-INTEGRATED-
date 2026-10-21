import { useEffect, useRef } from "react";

import { NAV_SHORTCUTS, isTypingTarget } from "./keyboardShortcuts";

const NAV_BY_LETTER = new Map(
    NAV_SHORTCUTS.map((shortcut) => [shortcut.keys[1], shortcut.path])
);

/**
 * App-wide keyboard shortcuts.
 *
 * Navigation is the `g` chord: `g` arms a short window, the next letter
 * within it navigates. Standalone keys are `\` (theme) and `?` (help).
 *
 * The handler bows out whenever it should: when the user is typing in a
 * field, when a real browser shortcut is being used (ctrl/cmd/alt held), and
 * -- for the chord and theme keys -- while a dialog is open, so the only key
 * that reaches an open overlay is the one that closes it.
 *
 * It changes no routes and fetches nothing. `onNavigate` is react-router's
 * own `navigate`; the route guards still decide who may land where, so a
 * `staffOnly` destination redirects a passenger exactly as a clicked link
 * would.
 */
export function useKeyboardShortcuts({
    onNavigate,
    onToggleTheme,
    onToggleHelp,
    paused = false,
}) {
    const pendingG = useRef(false);
    const timerRef = useRef(null);

    // Keep the callbacks current without re-binding the window listener each
    // render. Written in an effect, not during render, so a ref is never
    // mutated mid-render.
    const handlers = useRef({ onNavigate, onToggleTheme, onToggleHelp, paused });
    useEffect(() => {
        handlers.current = { onNavigate, onToggleTheme, onToggleHelp, paused };
    });

    useEffect(() => {
        const clearPending = () => {
            pendingG.current = false;
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };

        const onKeyDown = (event) => {
            const { onNavigate: nav, onToggleTheme: theme, onToggleHelp: help, paused: isPaused } =
                handlers.current;

            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (isTypingTarget(event.target)) return;

            // `?` toggles help from anywhere, so it also closes the overlay.
            if (event.key === "?") {
                event.preventDefault();
                clearPending();
                help();
                return;
            }

            // While a dialog is open, the chord and theme keys are inert.
            // Escape is handled by the dialog itself.
            if (isPaused) return;

            if (event.key === "\\") {
                event.preventDefault();
                clearPending();
                theme();
                return;
            }

            if (pendingG.current) {
                const path = NAV_BY_LETTER.get(event.key.toLowerCase());
                clearPending();
                if (path) {
                    event.preventDefault();
                    nav(path);
                }
                return;
            }

            if (event.key.toLowerCase() === "g") {
                pendingG.current = true;
                timerRef.current = setTimeout(clearPending, 1200);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            clearPending();
        };
    }, []);
}

export default useKeyboardShortcuts;
