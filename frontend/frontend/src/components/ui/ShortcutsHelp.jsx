import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { ACTION_SHORTCUTS, NAV_SHORTCUTS } from "./keyboardShortcuts";

/**
 * The shortcuts overlay -- the discoverability surface for the keyboard map.
 *
 * It reads the same tables the handler does, so it can never list a key that
 * does nothing. Escape and a backdrop click close it; focus moves to the
 * panel on open and the close button is reachable, so a keyboard user is not
 * stranded inside it.
 */
function Keys({ keys }) {
    return (
        <span className="flex items-center gap-1">
            {keys.map((key, index) => (
                <kbd
                    key={index}
                    className="inline-flex min-w-[1.6rem] items-center justify-center rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700 shadow-sm"
                >
                    {key === "\\" ? "\\" : key}
                </kbd>
            ))}
        </span>
    );
}

function Row({ shortcut }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <span className="text-sm text-slate-700">
                {shortcut.label}
                {shortcut.staffOnly ? (
                    <span className="ml-2 text-xs text-slate-500">(staff)</span>
                ) : null}
            </span>
            <Keys keys={shortcut.keys} />
        </div>
    );
}

function ShortcutsHelp({ open, onClose }) {
    const panelRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;

        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        panelRef.current?.focus();

        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="rp-fade fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
            onClick={onClose}
            role="presentation"
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="shortcuts-title"
                className="rp-toast max-h-[85vh] w-full max-w-md overflow-auto rounded-t-2xl border border-slate-200 bg-white p-6 shadow-2xl focus:outline-none sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="shortcuts-title" className="text-lg font-bold text-slate-900">
                            Keyboard shortcuts
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                            Press <kbd className="rounded border border-slate-300 bg-slate-100 px-1 text-xs font-semibold text-slate-700">g</kbd>{" "}
                            then a letter to jump between pages.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rp-press shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                        aria-label="Close shortcuts"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Navigation
                    </p>
                    <div className="mt-1 divide-y divide-slate-100">
                        {NAV_SHORTCUTS.map((shortcut) => (
                            <Row key={shortcut.path} shortcut={shortcut} />
                        ))}
                    </div>

                    <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Actions
                    </p>
                    <div className="mt-1 divide-y divide-slate-100">
                        {ACTION_SHORTCUTS.map((shortcut) => (
                            <Row key={shortcut.action} shortcut={shortcut} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ShortcutsHelp;
