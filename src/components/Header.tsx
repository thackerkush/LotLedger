import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, Plus, Trash2, Shield, User } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';

export const Header: React.FC = () => {
  const location = useLocation();
  const { state, dispatch } = useAppContext();
  const { showConfirm } = useConfirm();
  const { showToast } = useToast();
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/': return 'Dashboard';
      case '/open-positions': return 'Open Positions';
      case '/trade-entry': return 'Trade Entry';
      case '/closed-trades': return 'Closed Trades';
      case '/dividends': return 'Dividends';
      case '/corporate-actions': return 'Corporate Actions';
      case '/reports-tax': return 'Reports & Tax';
      case '/analytics': return 'Analytics';
      case '/watchlist': return 'Watchlist';
      case '/settings': return 'Settings';
      case '/about': return 'About LotLedger';
      default: return 'LotLedger';
    }
  };

  const handleProfileSwitch = (profileName: string) => {
    setIsDropdownOpen(false);
    if (profileName !== state.activeProfile) {
      dispatch({ type: 'SWITCH_PROFILE', payload: profileName });
      showToast(`Switched to profile: ${profileName}`, 'info');
    }
  };

  const handleDeleteProfile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDropdownOpen(false);
    
    if (state.activeProfile === 'Default') {
      showToast('Cannot delete the Default profile', 'error');
      return;
    }

    const confirmed = await showConfirm({
      title: 'Delete Profile',
      message: `Are you sure you want to delete the profile "${state.activeProfile}"? All data will be permanently lost.`,
      confirmLabel: 'Delete Profile',
      variant: 'danger',
    });

    if (confirmed) {
      dispatch({ type: 'DELETE_PROFILE', payload: state.activeProfile });
      showToast('Profile deleted successfully', 'success');
    }
  };

  const handleNewProfile = () => {
    setIsDropdownOpen(false);
    const newName = prompt('Enter new profile name:');
    if (newName && newName.trim() !== '') {
      const trimmed = newName.trim();
      if (state.profiles.includes(trimmed)) {
        showToast('A profile with that name already exists', 'error');
        return;
      }
      dispatch({ type: 'ADD_PROFILE', payload: trimmed });
      dispatch({ type: 'SWITCH_PROFILE', payload: trimmed });
      showToast(`Created and switched to new profile: ${trimmed}`, 'success');
    }
  };

  return (
    <header className="h-16 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900/60 fixed top-0 right-0 left-64 z-30 flex items-center justify-between px-6 select-none">
      <h2 className="text-base font-bold font-outfit text-zinc-100 tracking-tight">
        {getPageTitle()}
      </h2>

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center space-x-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800/80 rounded-lg text-zinc-300 hover:bg-zinc-850 hover:text-zinc-100 transition-all cursor-pointer shadow-sm text-xs font-semibold"
        >
          <User size={13} className="text-zinc-500" />
          <span>{state.activeProfile}</span>
          {state.settings.profilePasswordHash && <Shield size={11} className="text-emerald-500" />}
          <ChevronDown size={12} className="text-zinc-500" />
        </button>

        {isDropdownOpen && (
          <div className="absolute right-0 mt-2 w-52 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-50">
            <div className="px-3 py-1.5 border-b border-zinc-800/60">
              <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Profiles</p>
            </div>
            
            <div className="max-h-48 overflow-y-auto py-1 scrollbar-thin">
              {state.profiles.map((profile) => (
                <button
                  key={profile}
                  onClick={() => handleProfileSwitch(profile)}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-zinc-800 transition-colors ${
                    profile === state.activeProfile ? 'text-emerald-400 font-bold bg-emerald-500/5' : 'text-zinc-300'
                  }`}
                >
                  <span>{profile}</span>
                  {profile === state.activeProfile && <div className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]"></div>}
                </button>
              ))}
            </div>
            
            <div className="border-t border-zinc-800/60 mt-1 pt-1">
              <button
                onClick={handleNewProfile}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-850 transition-colors flex items-center"
              >
                <Plus size={12} className="mr-1.5 text-emerald-400" /> New Profile
              </button>
              
              {state.activeProfile !== 'Default' && (
                <button
                  onClick={handleDeleteProfile}
                  className="w-full text-left px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-zinc-850 transition-colors flex items-center"
                >
                  <Trash2 size={12} className="mr-1.5 text-rose-400" /> Delete Profile
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
