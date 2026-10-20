/**
 * A failed load, with the reason and a way out.
 *
 * The old inline versions printed the message and left the user with nothing
 * to do but reload the whole page. `onRetry` is wired to a hook's `refetch`,
 * so one failed request costs one request to recover from.
 */
function ErrorState({
    message = "Could not load this data.",
    hint = "Check that the API is running, then try again.",
    onRetry = null,
    className = "p-12",
}) {
    return (
        <div className={`text-center ${className}`} role="alert">
            <p className="font-semibold text-red-600">{message}</p>
            {hint ? <p className="mt-1 text-sm text-slate-400">{hint}</p> : null}
            {onRetry ? (
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-400 hover:text-orange-600"
                >
                    Try again
                </button>
            ) : null}
        </div>
    );
}

export default ErrorState;
