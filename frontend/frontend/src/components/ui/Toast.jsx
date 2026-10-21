import { useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

import { ToastContext } from "./toastContext";

/**
 * Success and failure, said once, where the user is looking.
 *
 * Phase UI-1 recorded that this codebase has no `alert()` calls to replace
 * -- the grep found zero. What it has instead is write actions that succeed
 * or fail in silence: the Journey search logged its error to the console and
 * showed an empty state, which is why a 404 and a dead API looked identical
 * to the user. These toasts are for that: the result of an action the user
 * took.
 *
 * They are deliberately not used for poll failures. A background refresh
 * that fails is the row's problem, not a notification -- otherwise a flaky
 * connection stacks four toasts a minute.
 */

const TONES = {
    success: {
        icon: CheckCircle2,
        wrap: "border-green-200 bg-white",
        iconClass: "text-green-600",
        title: "text-slate-900",
    },
    error: {
        icon: AlertTriangle,
        wrap: "border-red-200 bg-white",
        iconClass: "text-red-600",
        title: "text-slate-900",
    },
    info: {
        icon: Info,
        wrap: "border-slate-200 bg-white",
        iconClass: "text-slate-500",
        title: "text-slate-900",
    },
};

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(0);

    const dismiss = useCallback((id) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const push = useCallback(
        (tone, message, detail = "") => {
            const id = nextId.current++;

            setToasts((current) => {
                // Three at a time, oldest dropped. A burst of failures should
                // not bury the page it is reporting on.
                const next = [...current, { id, tone, message, detail }];
                return next.slice(-3);
            });

            // Errors stay longer because they usually need reading twice.
            setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
        },
        [dismiss]
    );

    const value = useMemo(
        () => ({
            success: (message, detail) => push("success", message, detail),
            error: (message, detail) => push("error", message, detail),
            info: (message, detail) => push("info", message, detail),
            dismiss,
        }),
        [push, dismiss]
    );

    return (
        <ToastContext.Provider value={value}>
            {children}

            {/* Bottom-centre on a phone, bottom-right from sm up. `pointer-
                events-none` on the stack means a toast never swallows a click
                meant for the page behind it; the toast itself re-enables it. */}
            <div
                className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
                // `polite` and not `assertive`: this interrupts nothing.
                aria-live="polite"
                aria-atomic="false"
            >
                {toasts.map((toast) => {
                    const tone = TONES[toast.tone] || TONES.info;
                    const Icon = tone.icon;

                    return (
                        <div
                            key={toast.id}
                            className={`rp-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4 shadow-lg ${tone.wrap}`}
                            role={toast.tone === "error" ? "alert" : "status"}
                        >
                            <Icon size={18} className={`mt-0.5 shrink-0 ${tone.iconClass}`} />

                            <div className="min-w-0 flex-1">
                                <p className={`text-sm font-semibold ${tone.title}`}>
                                    {toast.message}
                                </p>

                                {toast.detail ? (
                                    <p className="mt-0.5 text-sm text-slate-600">{toast.detail}</p>
                                ) : null}
                            </div>

                            <button
                                type="button"
                                onClick={() => dismiss(toast.id)}
                                className="rp-press shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                                aria-label="Dismiss notification"
                            >
                                <X size={15} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}

export default ToastProvider;
