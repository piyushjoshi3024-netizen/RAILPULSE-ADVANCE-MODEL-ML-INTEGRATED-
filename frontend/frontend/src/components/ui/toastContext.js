import { createContext, useContext } from "react";

/**
 * The toast channel, split out from `Toast.jsx` so neither file exports a
 * component and a hook at the same time -- which is what
 * `react-refresh/only-export-components` objects to, and what would have
 * pushed this branch past its lint baseline.
 */
export const ToastContext = createContext(null);

/** No-ops outside a provider, so the auth screens (which sit outside
 *  MainLayout) and any isolated render still work rather than throwing. */
const NOOP = {
    success: () => {},
    error: () => {},
    info: () => {},
    dismiss: () => {},
};

export function useToast() {
    return useContext(ToastContext) || NOOP;
}
