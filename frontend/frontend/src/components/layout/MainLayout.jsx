import { useCallback, useEffect, useRef, useState } from "react";

import Sidebar from "./Sidebar";
import Header from "./Header";

function MainLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButtonRef = useRef(null);

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

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {/* Sidebar: a drawer below md, a column from md up */}
      <Sidebar
        open={sidebarOpen}
        onClose={closeSidebar}
      />

      {/* Backdrop, only while the drawer is open on a small screen */}
      {sidebarOpen && (
        <button
          type="button"
          onClick={closeSidebar}
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          aria-label="Close navigation"
          tabIndex={-1}
        />
      )}

      {/* Right side */}
      <div className="flex-1 flex flex-col min-w-0">

        <Header
          onOpenSidebar={() => setSidebarOpen(true)}
          menuButtonRef={menuButtonRef}
        />

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-8 overflow-auto">
          {children}
        </main>

      </div>

    </div>
  );
}

export default MainLayout;
