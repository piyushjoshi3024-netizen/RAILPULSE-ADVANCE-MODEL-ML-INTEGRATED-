import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Sidebar from "./Sidebar";
import Header from "./Header";
import { useTheme } from "../ui/useTheme";
import { useKeyboardShortcuts } from "../ui/useKeyboardShortcuts";
import ShortcutsHelp from "../ui/ShortcutsHelp";

function MainLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const [helpOpen, setHelpOpen] = useState(false);

  // App-wide shortcuts: `g`+letter to navigate, `\\` theme, `?` help. The
  // hook touches no routes or data -- it drives react-router's navigate and
  // the theme toggle this layout already owns.
  useKeyboardShortcuts({
    onNavigate: navigate,
    onToggleTheme: toggleTheme,
    onToggleHelp: () => setHelpOpen((open) => !open),
    paused: helpOpen,
  });

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  // Escape closes the drawer and puts focus back where it came from, so a
  // keyboard user is not left stranded at the top of the document.
  useEffect(() => {
    if (!sidebarOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  // The drawer is a layer over the page on a phone; letting the page behind
  // it scroll is how a tap ends up on the wrong thing.
  useEffect(() => {
    if (!sidebarOpen) return undefined;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {/* Sidebar: a drawer below md, a column from md up */}
      <Sidebar
        open={sidebarOpen}
        onClose={closeSidebar}
      />

      {/* Backdrop, only while the drawer is open on a small screen. It fades
          in rather than appearing, which reads as the drawer bringing it
          along instead of the screen blinking. */}
      {sidebarOpen && (
        <button
          type="button"
          onClick={closeSidebar}
          className="rp-fade fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          aria-label="Close navigation"
          tabIndex={-1}
        />
      )}

      {/* Right side */}
      <div className="flex-1 flex flex-col min-w-0">

        <Header
          onOpenSidebar={() => setSidebarOpen(true)}
          menuButtonRef={menuButtonRef}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {/* Main content.
            `key` is the pathname, so React discards this subtree and mounts
            a fresh one on every route change -- which is what makes the
            fade-and-rise run once per navigation. It deliberately does NOT
            include the search string or any state, so a filter change or a
            15-second poll re-renders in place and nothing animates. */}
        <main
          key={location.pathname}
          className="rp-page flex-1 p-4 sm:p-8 overflow-auto"
        >
          {children}
        </main>

      </div>

      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

    </div>
  );
}

export default MainLayout;
