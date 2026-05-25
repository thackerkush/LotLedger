import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export const Layout: React.FC = () => {
  return (
    <div className="flex h-screen bg-financial-bg overflow-hidden">
      <Sidebar />
      <Header />
      <main className="flex-1 ml-64 mt-16 overflow-y-auto p-6 page-transition">
        <Outlet />
      </main>
    </div>
  );
};
