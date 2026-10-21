import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { relativeTime } from "./relativeTime";

/**
 * When this page last heard from the API, and a way to ask again.
 *
 * Phase UI-1 recorded that nothing in the product showed this, despite a
 * fifteen-second poll running behind every page. That is the worst of both
 * worlds: a user cannot tell live data from a frozen tab, and a stale
 * figure looks exactly like a fresh one.
 *
 * `updatedAt` comes from `useResource`, which already tracks it -- this
 * only displays what the hook knows. The label re-renders on a 15s timer of
 * its own so "just now" becomes "1 min ago" without the page polling.
 */
function LastUpdated({ updatedAt, onRefresh = null, loading = false, className = "" }) {
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!updatedAt) return undefined;

        const timer = setInterval(() => setTick((n) => n + 1), 15000);
        return () => clearInterval(timer);
    }, [updatedAt]);

    return (
        <div className={`flex items-center gap-3 ${className}`}>
            <p className="text-xs text-slate-600">
                {updatedAt ? (
                    <>
                        <span className="hidden sm:inline">Updated </span>
                        <time dateTime={new Date(updatedAt).toISOString()}>
                            {relativeTime(updatedAt)}
                        </time>
                    </>
                ) : (
                    "Not loaded yet"
                )}
            </p>

            {onRefresh ? (
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={loading}
                    className="rp-press inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-orange-400 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-slate-400"
                    aria-label="Refresh this page's data"
                >
                    <RefreshCw
                        size={13}
                        className={loading ? "animate-spin" : ""}
                        aria-hidden="true"
                    />
                    <span className="hidden sm:inline">Refresh</span>
                </button>
            ) : null}
        </div>
    );
}

export default LastUpdated;
