import Button from "../ui/Button";

/**
 * A failed load, with the reason and a way out.
 *
 * The old inline versions printed the message and left the user with nothing
 * to do but reload the whole page. `onRetry` is wired to a hook's `refetch`,
 * so one failed request costs one request to recover from.
 *
 * UI-2: the retry button is the shared `Button`, so it gets the focus ring
 * and the loading state the hand-rolled one never had, and the hint is
 * slate-500 rather than the slate-400 that failed contrast.
 */
function ErrorState({
    message = "Could not load this data.",
    hint = "Check that the API is running, then try again.",
    onRetry = null,
    retrying = false,
    className = "p-12",
}) {
    return (
        <div className={`rp-fade text-center ${className}`} role="alert">
            <p className="font-semibold text-red-700">{message}</p>

            {hint ? <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{hint}</p> : null}

            {onRetry ? (
                <div className="mt-4 flex justify-center">
                    <Button variant="secondary" onClick={onRetry} loading={retrying}>
                        Try again
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

export default ErrorState;
