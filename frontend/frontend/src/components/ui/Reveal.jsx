/**
 * One item in a staggered entrance.
 *
 * Renders a plain wrapper with no class at all when `active` is false, so
 * the steady state costs nothing and a 15-second poll re-render cannot
 * re-trigger anything. `index` drives the delay; the CSS caps it at ten
 * steps so a long table still finishes in under half a second.
 *
 * `active` comes from `useFirstReveal`, which is what makes "first load
 * only" true rather than aspirational.
 */
function Reveal({ children, index = 0, active = false, className = "", as: Tag = "div" }) {
    return (
        <Tag
            className={active ? `rp-reveal ${className}` : className}
            style={active ? { "--rp-i": index } : undefined}
        >
            {children}
        </Tag>
    );
}

export default Reveal;
