/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, prefer-const, react-refresh/only-export-components */
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AppProvider, useAppContext } from './context/AppContext';
import { ToastProvider, useToast } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';
import { Layout } from './components/Layout';
import { exportToExcel } from './utils/excel';

import {
  Dashboard,
  OpenPositions,
  TradeEntry,
  ClosedTrades,
  Dividends,
  CorporateActions,
  ReportsTax,
  Analytics,
  Watchlist,
  Settings,
  About
} from './pages';

import { Wallet, Lock, ShieldCheck } from 'lucide-react';

// Hotkeys & Navigation Inner Wrapper (to gain access to useNavigate / useLocation)
const AppShell: React.FC = () => {
  const { state } = useAppContext();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Security Lock state
  const [isLocked, setIsLocked] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [isPinIncorrect, setIsPinIncorrect] = useState(false);

  // Inactivity tracking
  const inactivityTimerRef = useRef<number | null>(null);

  // 1. Splash Screen State (Section 18.3)
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Keep splash screen visible for 700ms minimum for visual polish
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 750);
    return () => clearTimeout(splashTimer);
  }, []);

  // 2. Lock profile check on load/profile switch (Section 13.4)
  useEffect(() => {
    if (state.settings.profilePasswordHash) {
      setIsLocked(true);
    } else {
      setIsLocked(false);
    }
  }, [state.activeProfile, state.settings.profilePasswordHash]);

  // 3. Inactivity Auto-Lock tracking (Section 13.4 & 18.1 timeout)
  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
    }

    if (!state.settings.profilePasswordHash || isLocked) return;

    // 10 minutes timeout = 600,000 ms
    inactivityTimerRef.current = window.setTimeout(() => {
      setIsLocked(true);
      showToast('Profile locked due to inactivity.', 'info');
    }, 600000);
  };

  useEffect(() => {
    // Listeners for activity resets
    const activities = ['mousemove', 'keydown', 'click', 'scroll'];
    activities.forEach(act => window.addEventListener(act, resetInactivityTimer));

    resetInactivityTimer();

    return () => {
      activities.forEach(act => window.removeEventListener(act, resetInactivityTimer));
      if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
    };
  }, [state.settings.profilePasswordHash, isLocked]);

  // PIN Unlock Verification
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.settings.profilePasswordHash || !state.settings.profileSalt) return;

    const pin = enteredPin.trim();
    const encoder = new TextEncoder();
    const hashBuffer = await window.crypto.subtle.digest(
      'SHA-256',
      encoder.encode(pin + state.settings.profileSalt)
    );
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (hashHex === state.settings.profilePasswordHash) {
      setIsLocked(false);
      setEnteredPin('');
      setIsPinIncorrect(false);
      showToast('Profile unlocked successfully.', 'success');
      resetInactivityTimer();
    } else {
      setIsPinIncorrect(true);
      showToast('Incorrect passcode PIN.', 'error');
    }
  };

  // 4. Keyboard Shortcuts Navigation (Section 16 hotkeys)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (isLocked || showSplash) return;

      if (e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case 'b': // Go to Trade Entry BUY
            e.preventDefault();
            navigate('/trade-entry');
            showToast('Navigated to Trade Entry', 'info');
            break;
          case 's': // Go to Trade Entry SELL
            e.preventDefault();
            navigate('/trade-entry');
            showToast('Navigated to Trade Entry', 'info');
            break;
          case 'e': // Export portfolio Excel
            e.preventDefault();
            showToast('Initiating Ctrl+E Excel export backup...', 'info');
            try {
              await exportToExcel(state);
            } catch (err) {
              showToast('Excel export failed.', 'error');
            }
            break;
          case 'd': // Go to Dashboard
            e.preventDefault();
            navigate('/');
            showToast('Navigated to Dashboard', 'info');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, showSplash, state, navigate]);

  // Splash Screen Overlay Rendering
  if (showSplash) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0f172a] flex flex-col items-center justify-center space-y-6">
        <div className="p-4 bg-financial-green/10 border border-financial-green/20 rounded-full text-financial-green animate-pulse">
          <Wallet size={48} />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold text-white tracking-tight font-outfit select-none">
            LotLedger
          </h1>
          <p className="text-xs text-financial-muted/80 tracking-wide font-medium italic select-none">
            Your secure offline Indian equity portfolio tracker
          </p>
        </div>
        <div className="w-48 bg-financial-border h-1 rounded-full overflow-hidden">
          <div className="h-full bg-financial-green animate-[loadingBar_0.75s_ease-out_forwards]" />
        </div>
        
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes loadingBar {
            from { width: 0%; }
            to { width: 100%; }
          }
        `}} />
      </div>
    );
  }

  // Security Passcode Unlock Screen Overlay (Section 13.4 overlay)
  if (isLocked) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0f172a] flex flex-col items-center justify-center p-4">
        <div className="bg-financial-card border border-financial-border p-8 rounded-2xl w-full max-w-sm flex flex-col items-center text-center space-y-6 shadow-2xl">
          <div className="p-4.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-500 animate-bounce">
            <Lock size={32} />
          </div>
          
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-financial-text">Locked Profile</h2>
            <p className="text-xs text-financial-muted">
              Enter your passcode PIN to access profile: <strong>"{state.activeProfile}"</strong>
            </p>
          </div>

          <form onSubmit={handleUnlock} className="w-full space-y-4">
            <input
              type="password"
              value={enteredPin}
              onChange={e => setEnteredPin(e.target.value)}
              placeholder="••••"
              className={`w-full bg-financial-bg border text-center text-lg tracking-widest font-bold rounded-lg px-4 py-3 text-financial-text focus:outline-none focus:border-blue-500 font-mono ${
                isPinIncorrect ? 'border-financial-red animate-shake' : 'border-financial-border'
              }`}
              autoFocus
              required
            />
            
            <button
              type="submit"
              className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg text-sm shadow transition-transform active:scale-97 cursor-pointer flex items-center justify-center space-x-1.5"
            >
              <ShieldCheck size={16} />
              <span>Unlock Profile</span>
            </button>
          </form>
        </div>

        <style dangerouslySetInnerHTML={{__html: `
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-6px); }
            75% { transform: translateX(6px); }
          }
          .animate-shake {
            animation: shake 0.2s ease-in-out 2;
          }
        `}} />
      </div>
    );
  }

  // Standard Routing views
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="open-positions" element={<OpenPositions />} />
        <Route path="trade-entry" element={<TradeEntry />} />
        <Route path="closed-trades" element={<ClosedTrades />} />
        <Route path="dividends" element={<Dividends />} />
        <Route path="corporate-actions" element={<CorporateActions />} />
        <Route path="reports-tax" element={<ReportsTax />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="watchlist" element={<Watchlist />} />
        <Route path="settings" element={<Settings />} />
        <Route path="about" element={<About />} />
      </Route>
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <ToastProvider>
        <ConfirmProvider>
          <HashRouter>
            <AppShell />
          </HashRouter>
        </ConfirmProvider>
      </ToastProvider>
    </AppProvider>
  );
};

export default App;

