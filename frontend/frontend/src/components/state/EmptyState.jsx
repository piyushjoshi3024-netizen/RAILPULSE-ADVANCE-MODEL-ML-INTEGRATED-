import Button from "../ui/Button";

/**
 * "There is nothing here", said honestly.
 *
 * An empty result is not an error and not a loading state. Keeping it a
 * separate component stops pages from filling a gap with demo rows.
 *
 * UI-2 added `action`: a dead end with no way out is not a finished screen.
 * The hint also moved off `text-slate-400`, which measured about 2.8:1 on
 * white in the UI-1 audit -- below the 4.5:1 minimum for body text.
 */
function EmptyState({
    title = "Nothing to show",
    hint = "",
    icon = "✓",
    className = "p-12",
    actionLabel = "",
    onAction = null,
}) {
    return (
        <div className={`rp-fade text-center ${className}`}>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <span className="text-lg text-slate-500" aria-hidden="true">
                    {icon}
                </span>
            </div>

            <p className="mt-4 font-semibold text-slate-700">{title}</p>

            {hint ? <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{hint}</p> : null}

            {actionLabel && onAction ? (
                <div className="mt-5 flex justify-center">
                    <Button variant="secondary" size="md" onClick={onAction}>
                        {actionLabel}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

export default EmptyState;
