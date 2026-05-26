/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, prefer-const, react-refresh/only-export-components */
import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export const Layout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar whenever the route changes (mobile nav after link click)
  React.useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-financial-bg">
      {/* Mobile backdrop overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — drawer on mobile, fixed on desktop */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Fixed Header */}
      <Header onMenuClick={() => setIsSidebarOpen(true)} />

      {/* Main content — shifted right on desktop, full-width on mobile */}
      <main className="md:ml-64 pt-16 min-h-screen overflow-y-auto">
        <div className="px-4 md:px-6 py-4 md:py-6 page-transition">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

