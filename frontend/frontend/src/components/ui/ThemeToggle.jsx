import { Moon, Sun } from "lucide-react";

/**
 * The light/dark switch.
 *
 * A button, not a checkbox, because it is a single action with an obvious
 * result. The icon shows what a press will do -- a moon while light, a sun
 * while dark -- and the label says it in words for a screen reader.
 */
function ThemeToggle({ theme, onToggle }) {
    const dark = theme === "dark";

    return (
        <button
            type="button"
            onClick={onToggle}
            className="rp-press inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:border-orange-400 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            aria-pressed={dark}
            title={dark ? "Light theme" : "Dark theme"}
        >
            {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
    );
}

export default ThemeToggle;
