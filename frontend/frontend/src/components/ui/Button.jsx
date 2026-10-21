/**
 * The one button.
 *
 * Phase UI-1 found five different primary buttons in this codebase --
 * `py-3 rounded-lg`, `py-3.5 rounded-xl`, `px-6 py-3`, `px-4 py-2.5`,
 * `px-4 py-2` -- two different disabled styles (`opacity-60` and
 * `bg-orange-300`), and not one visible keyboard focus ring. The colours
 * here are the ones that were already winning: orange-500 with an
 * orange-600 hover, slate-200 borders, slate-700 text.
 *
 * `loading` is a real state, not a label swap. The spinner replaces the
 * icon, the label stays put so the button does not change width mid-click,
 * and the button disables itself so a double submit is impossible.
 */

const VARIANTS = {
    primary:
        "bg-orange-500 text-white shadow-sm hover:bg-orange-600 disabled:bg-orange-300 disabled:shadow-none",
    secondary:
        "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-orange-400 hover:text-orange-600 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none",
    ghost:
        "text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-400",
    danger:
        "bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-red-300 disabled:shadow-none",
};

const SIZES = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2.5 text-sm gap-2",
    lg: "px-5 py-3 text-sm gap-2",
};

function Spinner({ className = "" }) {
    return (
        <span
            className={`h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
            aria-hidden="true"
        />
    );
}

function Button({
    children,
    variant = "primary",
    size = "md",
    loading = false,
    disabled = false,
    icon: Icon = null,
    type = "button",
    className = "",
    fullWidth = false,
    ...rest
}) {
    const isDisabled = disabled || loading;

    return (
        <button
            type={type}
            disabled={isDisabled}
            // `aria-busy` is how a screen reader is told the press was heard
            // and the work is running; the visual spinner says nothing to it.
            aria-busy={loading || undefined}
            className={[
                "rp-press rp-lift inline-flex items-center justify-center rounded-lg font-semibold",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed",
                VARIANTS[variant] || VARIANTS.primary,
                SIZES[size] || SIZES.md,
                fullWidth ? "w-full" : "",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            {...rest}
        >
            {loading ? <Spinner /> : Icon ? <Icon size={16} className="shrink-0" /> : null}
            <span>{children}</span>
        </button>
    );
}

export default Button;
