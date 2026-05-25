import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  TrendingUp,
  PlusCircle,
  History,
  Banknote,
  Building2,
  FileSpreadsheet,
  PieChart,
  Eye,
  Settings,
  Info,
  Wallet,
  Lock,
  Bell,
  BarChart2,
  BookOpen,
  FileText,
  Target,
  RefreshCw,
  TrendingDown
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export const Sidebar: React.FC = () => {
  const { state } = useAppContext();

  const navItems = [
    { to: '/', icon: <LayoutDashboard size={16} />, label: 'Dashboard' },
    { to: '/open-positions', icon: <TrendingUp size={16} />, label: 'Open Positions' },
    { to: '/trade-entry', icon: <PlusCircle size={16} />, label: 'Trade Entry' },
    { to: '/closed-trades', icon: <History size={16} />, label: 'Closed Trades' },
    { to: '/dividends', icon: <Banknote size={16} />, label: 'Dividends' },
    { to: '/corporate-actions', icon: <Building2 size={16} />, label: 'Corporate Actions' },
    { to: '/reports-tax', icon: <FileSpreadsheet size={16} />, label: 'Reports & Tax' },
    { to: '/analytics', icon: <PieChart size={16} />, label: 'Analytics' },
    { to: '/watchlist', icon: <Eye size={16} />, label: 'Watchlist' },
    { to: '/settings', icon: <Settings size={16} />, label: 'Settings' },
  ];

  const futureItems = [
    { id: 'alerts', icon: <Bell size={16} />, label: 'Smart Alerts' },
    { id: 'benchmarks', icon: <BarChart2 size={16} />, label: 'Benchmarks' },
    { id: 'journal', icon: <BookOpen size={16} />, label: 'Trade Journal' },
    { id: 'broker-import', icon: <FileText size={16} />, label: 'Broker Import' },
    { id: 'goals', icon: <Target size={16} />, label: 'Goal Tracker' },
    { id: 'sip', icon: <RefreshCw size={16} />, label: 'SIP Mode' },
    { id: 'risk', icon: <TrendingDown size={16} />, label: 'Risk Metrics' },
  ];

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200 group ${
      isActive
        ? 'bg-zinc-900 text-zinc-100 border-l border-zinc-100 shadow-sm'
        : 'text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-200'
    }`;

  return (
    <div className="w-64 h-screen fixed left-0 top-0 bg-zinc-950 border-r border-zinc-900/60 flex flex-col z-40 select-none">
      {/* Brand Logo & Header */}
      <div className="p-5">
        <div className="flex items-center space-x-2">
          <Wallet className="w-5 h-5 text-zinc-400" />
          <h1 className="text-lg font-bold font-outfit tracking-tight text-zinc-100">
            LotLedger
          </h1>
        </div>
        
        {/* Active Profile Widget */}
        <div className="mt-5 p-3 bg-zinc-900/40 border border-zinc-900/50 rounded-lg">
          <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-0.5">Profile</p>
          <div className="flex items-center space-x-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <p className="text-xs font-semibold text-zinc-300 truncate">
              {state.activeProfile}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 scrollbar-thin">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={getNavLinkClass}>
            <span className="shrink-0 transition-transform duration-200">{item.icon}</span>
            <span className="font-medium text-xs tracking-wide">{item.label}</span>
          </NavLink>
        ))}

        <div className="pt-4 pb-1.5">
          <p className="px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
            Coming Soon
          </p>
        </div>
        
        {futureItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between px-3 py-2 rounded-lg text-zinc-600 bg-transparent cursor-not-allowed"
            title="Planned for future release"
          >
            <div className="flex items-center space-x-3">
              <span className="shrink-0 opacity-80">{item.icon}</span>
              <span className="font-medium text-xs tracking-wide">{item.label}</span>
            </div>
            <Lock size={8} className="text-zinc-700" />
          </div>
        ))}
      </nav>

      {/* About Footer */}
      <div className="p-3 border-t border-zinc-900/60">
        <NavLink to="/about" className={getNavLinkClass}>
          <span className="shrink-0 transition-transform duration-200"><Info size={16} /></span>
          <span className="font-medium text-xs tracking-wide">About</span>
        </NavLink>
      </div>
    </div>
  );
};

