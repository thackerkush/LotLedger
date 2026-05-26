import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, Plus, Trash2, Shield, User, Menu, Moon, Sun } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useConfirm } from './ConfirmDialog';
import { usePrompt } from './PromptDialog';
import { useToast } from './Toast';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const location = useLocation();
  const { state, dispatch } = useAppContext();
  const { showConfirm } = useConfirm();
  const { showPrompt } = usePrompt();
  const { showToast } = useToast();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize theme from localStorage
    const savedTheme = localStorage.getItem('lotledger_theme');
    if (savedTheme === 'light') {
      setIsLightMode(true);
      document.documentElement.classList.add('light');
    }
  }, []);

  const toggleTheme = () => {
    const newMode = !isLightMode;
    setIsLightMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('light');
      localStorage.setItem('lotledger_theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      localStorage.setItem('lotledger_theme', 'dark');
    }
  };

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

  const handleNewProfile = async () => {
    setIsDropdownOpen(false);
    const newName = await showPrompt({
      title: 'Create New Profile',
      placeholder: 'Enter profile name...',
      confirmLabel: 'Create Profile',
      cancelLabel: 'Cancel'
    });
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
    <header className="h-16 bg-financial-bg/90 backdrop-blur-md border-b border-financial-border fixed top-0 right-0 left-0 md:left-64 z-30 flex items-center justify-between px-4 md:px-6 select-none print-hide">
      {/* Left side: hamburger (mobile) + page title */}
      <div className="flex items-center space-x-3">
        {/* Hamburger menu — mobile only */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        <h2 className="text-base font-bold font-outfit text-financial-text tracking-tight">
          {getPageTitle()}
        </h2>
      </div>

      {/* Right side: theme toggle & profile dropdown */}
      <div className="flex items-center space-x-2 relative">
        <button
          onClick={toggleTheme}
          className="p-2 bg-financial-card border border-financial-border rounded-lg text-financial-text hover:text-financial-green transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
          aria-label="Toggle theme"
        >
          {isLightMode ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center space-x-2 px-3 py-1.5 bg-financial-card border border-financial-border rounded-lg text-financial-text hover:text-financial-green transition-all cursor-pointer shadow-sm text-xs font-semibold min-h-[36px]"
          >
            <User size={13} className="text-financial-muted shrink-0" />
            <span className="max-w-[80px] truncate">{state.activeProfile}</span>
            {state.settings.profilePasswordHash && <Shield size={11} className="text-financial-green shrink-0" />}
            <ChevronDown size={12} className="text-financial-muted shrink-0" />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-financial-card border border-financial-border rounded-lg shadow-xl py-1 z-50">
              <div className="px-3 py-1.5 border-b border-financial-border">
                <p className="text-[9px] text-financial-muted uppercase font-bold tracking-wider">Profiles</p>
              </div>

              <div className="max-h-48 overflow-y-auto py-1 scrollbar-thin">
                {state.profiles.map((profile) => (
                  <button
                    key={profile}
                    onClick={() => handleProfileSwitch(profile)}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-financial-bg transition-colors min-h-[36px] ${
                      profile === state.activeProfile ? 'text-financial-green font-bold bg-financial-green/5' : 'text-financial-text'
                    }`}
                  >
                    <span>{profile}</span>
                    {profile === state.activeProfile && <div className="w-1 h-1 rounded-full bg-financial-green shadow-[0_0_6px_#10b981]" />}
                  </button>
                ))}
              </div>

              <div className="border-t border-financial-border mt-1 pt-1">
                <button
                  onClick={handleNewProfile}
                  className="w-full text-left px-3 py-1.5 text-xs font-semibold text-financial-text hover:text-financial-green transition-colors flex items-center min-h-[36px]"
                >
                  <Plus size={12} className="mr-1.5 text-financial-green" /> New Profile
                </button>

                {state.activeProfile !== 'Default' && (
                  <button
                    onClick={handleDeleteProfile}
                    className="w-full text-left px-3 py-1.5 text-xs font-semibold text-financial-red hover:bg-financial-red/10 transition-colors flex items-center min-h-[36px]"
                  >
                    <Trash2 size={12} className="mr-1.5 text-financial-red" /> Delete Profile
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
