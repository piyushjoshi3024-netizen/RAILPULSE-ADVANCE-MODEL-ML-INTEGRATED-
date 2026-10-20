/**
 * "There is nothing here", said honestly.
 *
 * An empty result is not an error and not a loading state. Keeping it a
 * separate component stops pages from filling a gap with demo rows.
 */
function EmptyState({
    title = "Nothing to show",
    hint = "",
    icon = "✓",
    className = "p-12",
}) {
    return (
        <div className={`text-center ${className}`}>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <span className="text-lg text-slate-400" aria-hidden="true">
                    {icon}
                </span>
            </div>
            <p className="mt-4 font-semibold text-slate-700">{title}</p>
            {hint ? <p className="mt-1 text-sm text-slate-400">{hint}</p> : null}
        </div>
    );
}

export default EmptyState;
