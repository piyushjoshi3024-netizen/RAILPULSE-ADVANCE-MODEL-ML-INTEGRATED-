import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One resource load, with the four states a page actually has to render.
 *
 * Every page had written its own `useEffect` + `loading` + `loadError` triple,
 * and each one handled unmounting slightly differently -- several set state
 * after the component was gone. This keeps one copy of that logic:
 *
 *  - `loading` is true only for the first load, so a poll does not blank the
 *    screen that is already showing good data;
 *  - `error` holds the last failure, and existing `data` is kept rather than
 *    thrown away, because stale-but-real beats empty;
 *  - `refetch` is stable, so it is safe in a dependency array or on a button.
 *
 * Polling is opt-in and pauses while the tab is hidden: a background tab used
 * to keep asking every fifteen seconds for a screen nobody was looking at.
 * When the tab comes back it refetches immediately rather than waiting out the
 * remaining interval, so a returning user never reads a stale number.
 *
 * @param fetcher  (signal: AbortSignal) => Promise<{ data }>, an axios call
 * @param options  { enabled, pollMs, initialData, errorMessage, deps }
 */
export function useResource(fetcher, options = {}) {
    const {
        enabled = true,
        pollMs = 0,
        initialData = null,
        errorMessage = "Could not load this data.",
        deps = [],
    } = options;

    const [data, setData] = useState(initialData);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState("");
    const [updatedAt, setUpdatedAt] = useState(null);

    // The fetcher is usually an inline arrow, so a new identity arrives on
    // every render. It is held in a ref -- written in an effect, never during
    // render -- which keeps `load` stable and lets `deps` say explicitly what
    // should actually cause a refetch.
    const fetcherRef = useRef(fetcher);
    const initialDataRef = useRef(initialData);

    useEffect(() => {
        fetcherRef.current = fetcher;
        initialDataRef.current = initialData;
    });

    const mountedRef = useRef(true);
    const firstLoadRef = useRef(true);
    const abortRef = useRef(null);

    // A serialised key rather than a spread: the lint rule requires a literal
    // dependency array, and the values passed in `deps` are ids and query
    // strings, which serialise exactly.
    const depsKey = JSON.stringify(deps);

    const load = useCallback(async () => {
        if (!enabled) return;

        // A refetch while one is in flight cancels the older request, so the
        // slower answer cannot arrive last and overwrite the newer one.
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (firstLoadRef.current) setLoading(true);

        try {
            const response = await fetcherRef.current(controller.signal);
            if (!mountedRef.current || controller.signal.aborted) return;

            setData(response?.data ?? initialDataRef.current);
            setError("");
            setUpdatedAt(new Date());
        } catch (failure) {
            if (!mountedRef.current || controller.signal.aborted) return;
            if (failure?.code === "ERR_CANCELED" || failure?.name === "CanceledError") return;

            // A 401 is already handled globally by the axios interceptor,
            // which clears the session and navigates. Reporting it here too
            // would flash an error on a page that is about to be replaced.
            if (failure?.response?.status !== 401) {
                setError(failure?.response?.data?.message || failure?.message || errorMessage);
            }
        } finally {
            if (mountedRef.current) {
                firstLoadRef.current = false;
                setLoading(false);
            }
        }
        // depsKey is the whole point of the dependency: the lint rule cannot
        // see that it stands in for the caller's `deps`, so it reads as
        // unnecessary. Removing it would stop a changed id from refetching.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, errorMessage, depsKey]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            abortRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        if (!enabled) return undefined;

        firstLoadRef.current = true;
        load();
        return undefined;
    }, [load, enabled]);

    useEffect(() => {
        if (!enabled || !pollMs) return undefined;

        let timer = null;

        const stop = () => {
            if (timer) window.clearTimeout(timer);
            timer = null;
        };

        const tick = async () => {
            await load();
            if (!mountedRef.current || document.hidden) return;
            timer = window.setTimeout(tick, pollMs);
        };

        const onVisibility = () => {
            stop();
            // Back in view: answer with fresh data now, not in pollMs.
            if (!document.hidden) tick();
        };

        if (!document.hidden) timer = window.setTimeout(tick, pollMs);
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            stop();
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [enabled, pollMs, load]);

    return {
        data,
        // A disabled hook is not loading, whatever the last enabled run left
        // behind. Derived rather than written in an effect, so turning it off
        // costs no extra render.
        loading: enabled ? loading : false,
        error,
        updatedAt,
        refetch: load,
    };
}

export default useResource;
