/**
 * The one spinner.
 *
 * Every page had written its own copy of this block, which is why "Loading
 * alerts..." and "Loading trains..." looked slightly different. The markup is
 * lifted from the version in Alerts so nothing changes visually.
 */
function Loading({ label = "Loading...", className = "p-12" }) {
    return (
        <div className={`text-center ${className}`} role="status" aria-live="polite">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
            <p className="mt-4 text-sm text-slate-500">{label}</p>
        </div>
    );
}

export default Loading;
