/**
 * Placeholders shaped like the thing that is coming.
 *
 * Phase UI-1 found one centred spinner standing in for a card grid, a
 * 1000px-wide table and the map panel alike, so the layout jumped when the
 * data landed. These hold the space instead.
 *
 * None of them invent a number. A skeleton row is grey blocks; it never
 * shows a plausible-looking delay that a user might read as real.
 */

function Skeleton({ className = "", rounded = "rounded-lg" }) {
    return <span className={`rp-skeleton block ${rounded} ${className}`} aria-hidden="true" />;
}

/** Stands in for one `rounded-2xl ... p-6` stat card. */
export function SkeletonStat() {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-8 w-20" />
            <Skeleton className="mt-3 h-3 w-32" />
        </div>
    );
}

/** A grid of stat cards. `count` should match the real grid. */
export function SkeletonStats({ count = 4 }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Loading figures">
            {Array.from({ length: count }, (_, index) => (
                <SkeletonStat key={index} />
            ))}
        </div>
    );
}

/** Stands in for a card with a heading and a few lines. */
export function SkeletonCard({ lines = 3, className = "" }) {
    return (
        <div
            className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}
            role="status"
            aria-label="Loading"
        >
            <Skeleton className="h-5 w-40" />
            <div className="mt-5 space-y-3">
                {Array.from({ length: lines }, (_, index) => (
                    <Skeleton
                        key={index}
                        className={`h-4 ${index === lines - 1 ? "w-2/3" : "w-full"}`}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * Stands in for a table body. `columns` keeps the cells roughly where the
 * real ones will be, so the header does not shift sideways on arrival.
 */
export function SkeletonTable({ rows = 5, columns = 5 }) {
    return (
        <div className="divide-y divide-slate-100" role="status" aria-label="Loading rows">
            {Array.from({ length: rows }, (_, rowIndex) => (
                <div key={rowIndex} className="flex items-center gap-4 px-6 py-4">
                    {Array.from({ length: columns }, (_, columnIndex) => (
                        <Skeleton
                            key={columnIndex}
                            className={`h-4 ${columnIndex === 0 ? "w-32" : "flex-1"}`}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

/**
 * Stands in for the map panel. Takes the height it is given so the panel
 * does not resize when Leaflet mounts.
 */
export function SkeletonMap({ className = "h-[420px]" }) {
    return (
        <div
            className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white ${className}`}
            role="status"
            aria-label="Loading map"
        >
            <Skeleton className="h-full w-full" rounded="rounded-none" />
            <div className="absolute inset-0 flex items-center justify-center">
                <p className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm">
                    Loading network map...
                </p>
            </div>
        </div>
    );
}

export default Skeleton;
