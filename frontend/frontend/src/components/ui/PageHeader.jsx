import LastUpdated from "./LastUpdated";

/**
 * The top of every page, written once.
 *
 * Phase UI-1 found seven near-identical copies of this block across the app
 * pages and three more scales on the auth pages (`text-xl`, `text-4xl`,
 * `text-4xl md:text-5xl`). The scale here is the one that was already
 * winning, `text-3xl font-bold text-slate-900`, so nothing on the seven
 * app pages changes size.
 *
 * It also carries the two things UI-4 asks for and no page had: when the
 * data was last refreshed, and a button to refresh it.
 */
function PageHeader({
    title,
    subtitle = "",
    actions = null,
    updatedAt = null,
    onRefresh = null,
    refreshing = false,
}) {
    const hasMeta = Boolean(updatedAt || onRefresh || actions);

    return (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
                <h1 className="text-3xl font-bold text-slate-900">{title}</h1>

                {subtitle ? <p className="mt-2 text-slate-600">{subtitle}</p> : null}
            </div>

            {hasMeta ? (
                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                    {updatedAt || onRefresh ? (
                        <LastUpdated
                            updatedAt={updatedAt}
                            onRefresh={onRefresh}
                            loading={refreshing}
                        />
                    ) : null}

                    {actions}
                </div>
            ) : null}
        </div>
    );
}

export default PageHeader;
