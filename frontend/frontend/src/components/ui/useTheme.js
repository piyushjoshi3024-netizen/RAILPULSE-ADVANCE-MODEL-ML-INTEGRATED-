import { useCallback, useState } from "react";

/**
 * Light or dark, remembered.
 *
 * The actual switch is one attribute on <html>, `data-theme`, which the dark
 * layer in index.css keys off. An inline script in index.html sets it before
 * the first paint -- from a stored choice, or the OS preference -- so there
 * is no flash of the wrong theme and this hook only ever reads what is
 * already there.
 *
 * Only MainLayout calls this, and it hands `toggle` to both the header button
 * and the keyboard shortcut, so the two stay in step without a context. Every
 * storage access is wrapped: a locked-down browser that throws on
 * localStorage still toggles, it just does not persist.
 */
const KEY = "rp-theme";

function readTheme() {
    try {
        const value = document.documentElement.getAttribute("data-theme");
        if (value === "dark" || value === "light") return value;
    } catch {
        // documentElement is always there in a browser; this guards tests.
    }
    return "light";
}

export function useTheme() {
    const [theme, setTheme] = useState(readTheme);

    const apply = useCallback((next) => {
        try {
            document.documentElement.setAttribute("data-theme", next);
        } catch {
            // ignore
        }
        try {
            localStorage.setItem(KEY, next);
        } catch {
            // Private mode or blocked storage: the theme still applies for
            // this session, it just will not be remembered.
        }
        setTheme(next);
    }, []);

    const toggle = useCallback(() => {
        apply(readTheme() === "dark" ? "light" : "dark");
    }, [apply]);

    return { theme, toggle };
}

export default useTheme;
