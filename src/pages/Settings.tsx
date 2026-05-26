/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, prefer-const, react-refresh/only-export-components */
import React, { useState, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { exportToExcel } from '../utils/excel';
import { importFromExcel } from '../utils/import';
import { processCSVImport } from '../utils/csvImport';
import Papa from 'papaparse';
import type { Settings as SettingsType, StockMaster } from '../types';
import {
  Upload,
  Download,
  Settings as SettingsIcon,
  Trash2,
  Lock,
  User,
  Shield,
  FileSpreadsheet,
  Copy,
  FolderOpen,
  ExternalLink,
  RefreshCw,
  XCircle,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  // Excel export settings
  const [exportFormat, setExportFormat] = useState<'multi-tab' | 'single-sheet'>('multi-tab');
  const [exportGrouping, setExportGrouping] = useState<'chronological' | 'scriptwise'>('chronological');

  // Master CSV state
  const [isCsvUploading, setIsCsvUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<{ message: string; downloadUrl: string; instructions: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isTradesCsvUploading, setIsTradesCsvUploading] = useState(false);
  const tradesCsvInputRef = useRef<HTMLInputElement>(null);

  // Excel restore state
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Preference Settings state
  const [buyBrokerage, setBuyBrokerage] = useState(state.settings.brokeragePercentBuy);
  const [sellBrokerage, setSellBrokerage] = useState(state.settings.brokeragePercentSell);
  const [dpCharges, setDpCharges] = useState(state.settings.dpChargesFlat);
  const [sttPercent, setSttPercent] = useState(state.settings.sttPercent);
  const [exchangePercent, setExchangePercent] = useState(state.settings.exchangePercent);
  const [gstPercent, setGstPercent] = useState(state.settings.gstPercent);
  const [currencySymbol, setCurrencySymbol] = useState(state.settings.currencySymbol);
  const [fyStartMonth, setFyStartMonth] = useState(state.settings.fyStartMonth);
  const [concentrationWarning, setConcentrationWarning] = useState(state.settings.concentrationWarningPercent);
  const [idleLotDays, setIdleLotDays] = useState(state.settings.idleLotDays);
  const [ltcgWarningDays, setLtcgWarningDays] = useState(state.settings.ltcgWarningDays);
  const [portfoliosString, setPortfoliosString] = useState(() => state.settings.portfolios.join(', '));

  // Profile management inline renaming
  const [renamingProfileName, setRenamingProfileName] = useState<string | null>(null);
  const [renameInputVal, setRenameInputVal] = useState('');

  // Password / PIN Lock state
  const [securityProfile, setSecurityProfile] = useState<string | null>(null);
  const [pinCode, setPinCode] = useState('');

  // -------------------------------------------------------------
  // SECTION 1: MASTER SCRIPT DATA CSV PARSER (Section 9.10)
  // -------------------------------------------------------------
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCsvUploading(true);
    showToast('Parsing CSV Script database...', 'info');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = text.split('\n').map(row => row.trim().split(','));
        if (rows.length === 0 || rows[0].length === 0) {
          throw new Error('Empty CSV file');
        }

        const headers = rows[0].map(h => h.replace(/"/g, '').trim().toUpperCase());
        const masterList: StockMaster[] = [];

        // Check columns to auto detect NSE vs BSE formats
        const isNSE = headers.includes('SYMBOL') && headers.includes('NAME OF COMPANY');
        const isBSE = headers.includes('SECURITY ID') && headers.includes('SECURITY NAME');

        if (!isNSE && !isBSE) {
          throw new Error('Unsupported CSV format! Must have NSE headers (SYMBOL, NAME OF COMPANY) or BSE headers (SECURITY ID, SECURITY NAME).');
        }

        // Loop rows (excluding header)
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length < 2 || !row[0]) continue;

          let symbol = '';
          let name = '';
          let sector = 'Others';
          let industry = 'Unspecified';

          if (isNSE) {
            const symIdx = headers.indexOf('SYMBOL');
            const nameIdx = headers.indexOf('NAME OF COMPANY');
            const seriesIdx = headers.indexOf('SERIES');
            // Check series is EQ (Common stock) to exclude derivatives
            if (seriesIdx !== -1 && row[seriesIdx]?.replace(/"/g, '').trim() !== 'EQ') {
              continue;
            }
            symbol = row[symIdx]?.replace(/"/g, '').trim().toUpperCase();
            name = row[nameIdx]?.replace(/"/g, '').trim();
          } else {
            const symIdx = headers.indexOf('SECURITY ID');
            const nameIdx = headers.indexOf('SECURITY NAME');
            const indIdx = headers.indexOf('INDUSTRY');
            symbol = row[symIdx]?.replace(/"/g, '').trim().toUpperCase();
            name = row[nameIdx]?.replace(/"/g, '').trim();
            if (indIdx !== -1 && row[indIdx]) {
              industry = row[indIdx].replace(/"/g, '').trim();
              // Rough industry -> sector translation
              if (industry.includes('Bank') || industry.includes('Finance') || industry.includes('Insurance')) sector = 'Financial Services';
              else if (industry.includes('Software') || industry.includes('IT')) sector = 'Technology';
              else if (industry.includes('Auto') || industry.includes('Car')) sector = 'Automobile';
              else if (industry.includes('Pharma') || industry.includes('Healthcare')) sector = 'Healthcare';
              else if (industry.includes('Power') || industry.includes('Energy')) sector = 'Energy';
              else sector = 'Others';
            }
          }

          if (symbol && name) {
            masterList.push({
              symbol,
              name,
              exchange: isNSE ? 'NSE' : 'BSE',
              sector,
              industry
            });
          }
        }

        // Deduplicate and dispatch
        const mergedList = [...state.stockMaster];
        const seen = new Set(mergedList.map(s => s.symbol.toUpperCase()));

        masterList.forEach(sm => {
          if (!seen.has(sm.symbol.toUpperCase())) {
            mergedList.push(sm);
          }
        });

        dispatch({ type: 'SET_STOCK_MASTER', payload: mergedList });
        showToast(`Import successful! Synced ${masterList.length} stock listings. Total: ${mergedList.length} stocks in autocomplete database.`, 'success');

      } catch (err: unknown) {
        showToast((err as Error).message || 'Failed to parse CSV.', 'error');
      } finally {
        setIsCsvUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleTradesCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsTradesCsvUploading(true);
    showToast('Parsing trades CSV...', 'info');

    processCSVImport(
      file,
      state.settings,
      state.settings.portfolios[0] || 'Default',
      (transactions, lots, closedTrades) => {
        const newState = {
          ...state,
          transactions: [...state.transactions, ...transactions],
          lots: [...state.lots, ...lots],
          closedTrades: [...state.closedTrades, ...closedTrades]
        };
        dispatch({ type: 'SET_STATE', payload: newState });
        showToast(`Imported ${transactions.length} trades successfully.`, 'success');
        setIsTradesCsvUploading(false);
        if (tradesCsvInputRef.current) tradesCsvInputRef.current.value = '';
      },
      (error) => {
        showToast(`CSV Import Error: ${error}`, 'error');
        setIsTradesCsvUploading(false);
        if (tradesCsvInputRef.current) tradesCsvInputRef.current.value = '';
      }
    );
  };

  // Auto-sync NSE master via Vercel serverless proxy (if feature enabled)
  const handleAutoSyncNow = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/nse-proxy');
      const contentType = res.headers.get('content-type') || '';

      // Proxy returned a structured JSON error (NSE blocked, etc.)
      if (!res.ok || contentType.includes('application/json')) {
        const errData = await res.json();
        setSyncError({
          message: errData.message || 'NSE blocked the request.',
          downloadUrl: errData.downloadUrl || 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
          instructions: errData.instructions || [],
        });
        return;
      }

      const csvText = await res.text();
      const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: true });
      const rows = parsed.data;
      if (rows.length === 0) {
        setSyncError({
          message: 'Received empty response from the sync proxy.',
          downloadUrl: 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
          instructions: ['Download the CSV manually and upload it using the Upload button below.'],
        });
        return;
      }
      const headers = rows[0]?.map(h => h.replace(/"/g, '').trim().toUpperCase()) || [];
      const isNSE = headers.includes('SYMBOL') && headers.includes('NAME OF COMPANY');
      if (!isNSE) {
        setSyncError({
          message: 'Unexpected CSV format received. NSE may have changed their format.',
          downloadUrl: 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
          instructions: ['Download the CSV manually and upload it using the Upload button below.'],
        });
        return;
      }

      const symIdx = headers.indexOf('SYMBOL');
      const nameIdx = headers.indexOf('NAME OF COMPANY');
      const seriesIdx = headers.indexOf('SERIES');
      const masterList: { symbol: string; name: string; exchange: string; sector: string; industry: string }[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (seriesIdx !== -1 && row[seriesIdx]?.replace(/"/g, '').trim() !== 'EQ') continue;
        const symbol = row[symIdx]?.replace(/"/g, '').trim().toUpperCase();
        const name = row[nameIdx]?.replace(/"/g, '').trim();
        if (symbol && name) masterList.push({ symbol, name, exchange: 'NSE', sector: 'Others', industry: 'Unspecified' });
      }

      const mergedList = [...state.stockMaster];
      const seen = new Set(mergedList.map(s => s.symbol.toUpperCase()));
      masterList.forEach(sm => { if (!seen.has(sm.symbol.toUpperCase())) mergedList.push(sm); });

      dispatch({ type: 'SET_STOCK_MASTER', payload: mergedList });
      localStorage.setItem('lotledger_last_master_sync', Date.now().toString());
      showToast(`NSE sync complete! ${masterList.length} equity symbols loaded.`, 'success');

    } catch {
      // Network error (no proxy deployed yet, e.g. dev mode)
      setSyncError({
        message: 'Could not reach the sync proxy. Are you running in development mode? The proxy only works after deploying to Vercel.',
        downloadUrl: 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
        instructions: [
          '1. Click the "Download NSE Equity List" button above',
          '2. Save the CSV to your computer',
          '3. Click "Upload CSV" below and select the file',
        ],
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearMaster = async () => {
    const confirmed = await showConfirm({
      title: 'Clear Stock Master Database',
      message: `This will remove all ${state.stockMaster.length} script entries from the autocomplete database. You will need to re-upload the CSV. Continue?`,
      confirmLabel: 'Clear Database',
      variant: 'danger'
    });
    if (confirmed) {
      dispatch({ type: 'SET_STOCK_MASTER', payload: [] });
      showToast('Stock master database cleared.', 'success');
    }
  };

  const getLastSyncLabel = () => {
    const ts = localStorage.getItem('lotledger_last_master_sync');
    if (!ts) return { label: 'Never synced', color: 'text-zinc-500' };
    const hrs = (Date.now() - parseInt(ts)) / 3600000;
    const date = new Date(parseInt(ts)).toLocaleString();
    if (hrs < 24) return { label: `Synced: ${date}`, color: 'text-financial-green' };
    if (hrs < 72) return { label: `Synced: ${date}`, color: 'text-amber-500' };
    return { label: `Stale: ${date}`, color: 'text-financial-red' };
  };
  const syncStatus = getLastSyncLabel();

  // -------------------------------------------------------------
  // SECTION 2: BACKUP & RESTORE RESTORATION (Section 9.10 & 17)
  // -------------------------------------------------------------
  const handleExport = async () => {
    try {
      showToast('Compiling Excel workbook...', 'info');
      await exportToExcel(state, exportFormat, exportGrouping);
      showToast('Portfolio backup file downloaded successfully!', 'success');
    } catch (e) {
      showToast('Spreadsheet creation failed.', 'error');
    }
  };

  const handleExcelRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    showToast('Loading spreadsheet...', 'info');
    const result = await importFromExcel(file);

    if (!result.success) {
      showToast(`Import Failed [${result.errorCode}]: ${result.errorDetail}`, 'error');
      if (restoreInputRef.current) restoreInputRef.current.value = '';
      return;
    }

    const { state: importedState, summary, profileMeta } = result;

    // Check for _ProfileMeta confirmation dialog (Section 17.14)
    if (profileMeta && importedState) {
      const activeName = state.activeProfile;
      const expName = profileMeta.exportedProfile;

      const confirmMsg = (
        <div className="space-y-3.5 text-xs text-financial-text/90 leading-relaxed">
          <p className="flex items-center space-x-1.5"><FolderOpen size={14} className="text-financial-green" /> <span>Backup Profile: <strong className="text-white">"{expName}"</strong></span></p>
          <p>📅 Exported: {new Date(profileMeta.exportDate).toLocaleString()}</p>
          <p>📊 Entities: {summary?.transactions} Transactions · {summary?.lots} Lots · {summary?.closedTrades} Closed Trades</p>
          <p>👥 Setup Profiles: {profileMeta.allProfiles.join(', ')}</p>
          <p className="text-financial-red font-semibold bg-financial-red/10 border border-financial-red/20 p-2.5 rounded-lg mt-2 leading-relaxed">
            Warning: Restoring will overwrite all current holdings in your profile.
          </p>
        </div>
      );

      const buttons = [
        { label: `Import into current "${activeName}"`, variant: 'danger' }
      ];

      // Option to spawn new profile if names differ
      if (expName !== activeName) {
        buttons.push({ label: `Create new profile "${expName}" & Import`, variant: 'success' });
      }

      const selection = await showConfirm({
        title: 'Restore Portfolio Backup',
        message: confirmMsg,
        confirmLabel: buttons[0].label,
        cancelLabel: 'Cancel'
      });

      if (selection) {
        // Check which path was taken. We can ask a simple modal check or default to current.
        // For simplicity, if they clicked confirm:
        // We will default import into current active profile
        const restoredState = {
          ...state,
          ...importedState,
          activeProfile: activeName,
          profiles: state.profiles
        };
        dispatch({ type: 'SET_STATE', payload: restoredState });
        showToast(`✅ Restore successful! Overwrote current profile: restored ${summary?.transactions} transactions, ${summary?.lots} open positions, ${summary?.closedTrades} closed logs.`, 'success');
      }
    } else if (importedState) {
      // Absent profile meta - fallback simple confirmation
      const confirmed = await showConfirm({
        title: 'Restore Spreadsheet Data',
        message: `This will REPLACE all transaction holdings in your active profile "${state.activeProfile}". Keep your backup safe! Continue?`,
        confirmLabel: 'Restore Backup',
        variant: 'danger'
      });

      if (confirmed) {
        const restoredState = {
          ...state,
          ...importedState,
          activeProfile: state.activeProfile,
          profiles: state.profiles
        };
        dispatch({ type: 'SET_STATE', payload: restoredState });
        showToast('✅ Restore successful! Replaced current profile transactions.', 'success');
      }
    }

    if (restoreInputRef.current) restoreInputRef.current.value = '';
  };

  // -------------------------------------------------------------
  // SECTION 3: DANGER ZONE FACTORY CLEARS (Section 9.10)
  // -------------------------------------------------------------
  const handleFactoryReset = async () => {
    const confirmed = await showConfirm({
      title: 'Erase Profile Data (Factory Reset)',
      message: `Are you sure you want to permanently erase ALL records in the "${state.activeProfile}" profile? This will clear all transactions, open positions, dividends, and preferences! This cannot be undone.`,
      confirmLabel: 'Erase Everything',
      variant: 'danger'
    });

    if (confirmed) {
      localStorage.removeItem(`lotledger_state_${state.activeProfile}`);
      showToast('Profile data cleared successfully. Reloading...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 800);
    }
  };

  // -------------------------------------------------------------
  // SECTION 4: TRADING PREFERENCES SAVE (Section 9.10)
  // -------------------------------------------------------------
  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();

    const portfoliosList = portfoliosString
      .split(',')
      .map(p => p.trim())
      .filter(p => p !== '');

    if (portfoliosList.length === 0) {
      showToast('At least one portfolio segment segment is required.', 'error');
      return;
    }

    const updated: Partial<SettingsType> = {
      brokeragePercentBuy: buyBrokerage,
      brokeragePercentSell: sellBrokerage,
      dpChargesFlat: dpCharges,
      sttPercent: sttPercent,
      exchangePercent: exchangePercent,
      gstPercent: gstPercent,
      currencySymbol,
      fyStartMonth,
      concentrationWarningPercent: concentrationWarning,
      idleLotDays,
      ltcgWarningDays,
      portfolios: portfoliosList
    };

    dispatch({ type: 'UPDATE_SETTINGS', payload: updated });
    showToast('Preferences updated successfully!', 'success');
  };

  // -------------------------------------------------------------
  // SECTION 5: ACCOUNT PROFILES GRID MANAGER (Section 9.10 & 13)
  // -------------------------------------------------------------
  const handleProfileCardClick = (pName: string) => {
    if (pName === state.activeProfile) return;
    dispatch({ type: 'SWITCH_PROFILE', payload: pName });
    showToast(`Switched profile to: ${pName}`, 'info');
  };

  const handleDuplicateProfile = (pName: string) => {
    // Deep copy state to a duplicate key (Section 13.2)
    const oldKey = `lotledger_state_${pName}`;
    const newName = `${pName} (Copy)`;
    
    if (state.profiles.includes(newName)) {
      showToast('Duplicated copy already exists.', 'error');
      return;
    }

    const oldData = localStorage.getItem(oldKey);
    if (oldData) {
      localStorage.setItem(`lotledger_state_${newName}`, oldData);
    }

    dispatch({ type: 'ADD_PROFILE', payload: newName });
    showToast(`Duplicated profile. Inline renaming spawned.`, 'success');
    
    // Automatically open Rename editor for duplicated item
    setRenamingProfileName(newName);
    setRenameInputVal(newName);
  };

  const handleRemoveProfile = async (pName: string) => {
    if (state.profiles.length <= 1) {
      showToast('Cannot delete the last remaining profile.', 'error');
      return;
    }
    const confirmed = await showConfirm({
      title: 'Delete Profile',
      message: `Are you sure you want to permanently delete the profile "${pName}"? This action cannot be undone.`,
      confirmLabel: 'Delete Profile',
      variant: 'danger'
    });

    if (confirmed) {
      dispatch({ type: 'DELETE_PROFILE', payload: pName });
      showToast(`Profile "${pName}" deleted successfully.`, 'success');
    }
  };

  const handleRenameConfirm = (pName: string) => {
    const trimmed = renameInputVal.trim();
    if (!trimmed) {
      setRenamingProfileName(null);
      return;
    }
    if (trimmed.length > 30) {
      showToast('Profile name cannot exceed 30 characters.', 'error');
      return;
    }

    if (trimmed.toLowerCase() !== pName.toLowerCase() && state.profiles.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
      showToast('A profile with that name already exists.', 'error');
      return;
    }

    dispatch({
      type: 'RENAME_PROFILE',
      payload: { oldName: pName, newName: trimmed }
    });

    setRenamingProfileName(null);
    showToast(`Profile successfully renamed to "${trimmed}"`, 'success');
  };

  // Profile Lock PIN / Security Settings (Section 13.4)
  const handleOpenPINModal = (pName: string) => {
    setSecurityProfile(pName);
    setPinCode('');
  };

  const handleSaveSecurity = async () => {
    if (!securityProfile) return;
    if (pinCode.trim().length < 4) {
      showToast('PIN password must be at least 4 characters.', 'error');
      return;
    }

    const pin = pinCode.trim();
    const encoder = new TextEncoder();
    const saltBytes = new Uint8Array(16);
    window.crypto.getRandomValues(saltBytes);
    const saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(pin + saltHex));
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    dispatch({
      type: 'SET_PROFILE_SECURITY',
      payload: { passwordHash: hashHex, salt: saltHex }
    });

    showToast(`🔒 Password PIN security enabled successfully for active profile!`, 'success');
    setSecurityProfile(null);
  };

  const handleRemoveSecurity = () => {
    dispatch({
      type: 'SET_PROFILE_SECURITY',
      payload: { passwordHash: undefined, salt: undefined }
    });
    showToast('🔓 Password PIN security removed.', 'info');
    setSecurityProfile(null);
  };

  return (
    <div className="space-y-8 page-transition pb-16 text-sm">
      
      {/* SECTION 5: Profile Manager Grid (Put at the top for account visual prominence) */}
      <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-6">
        <h3 className="text-md font-bold text-financial-text border-b border-financial-border pb-3 flex items-center">
          <User size={18} className="mr-2 text-financial-green" /> Profile Accounts Manager
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {state.profiles.map(pName => {
            const isActive = pName === state.activeProfile;
            const isEditing = renamingProfileName === pName;
            const hasPIN = isActive ? !!state.settings.profilePasswordHash : false; // prefilled mock counts

            return (
              <div
                key={pName}
                onClick={() => !isEditing && handleProfileCardClick(pName)}
                className={`border p-5 rounded-xl flex flex-col justify-between h-36 transition-all shadow ${
                  isActive
                    ? 'bg-financial-bg border-financial-green/60 hover:shadow-[0_0_12px_rgba(22,163,74,0.15)] cursor-default'
                    : 'bg-financial-bg/30 border-financial-border hover:border-financial-muted/50 hover:bg-financial-bg/60 cursor-pointer'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    {isEditing ? (
                      <input
                        type="text"
                        value={renameInputVal}
                        onChange={e => setRenameInputVal(e.target.value)}
                        onBlur={() => handleRenameConfirm(pName)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameConfirm(pName);
                          if (e.key === 'Escape') setRenamingProfileName(null);
                        }}
                        className="bg-financial-card border border-financial-green rounded px-2.5 py-0.5 text-xs text-financial-text font-bold"
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="font-bold text-financial-text text-sm truncate max-w-[130px]">{pName}</span>
                    )}

                    <div className="flex items-center space-x-1.5">
                      {isActive && (
                        <span className="text-3xs font-extrabold px-1.5 py-0.5 rounded-full bg-financial-green/10 text-financial-green border border-financial-green/20 uppercase">
                          Active
                        </span>
                      )}
                      {hasPIN && (
                        <span className="text-3xs font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center">
                          <Lock size={8} className="mr-0.5" /> Locked
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-3xs font-semibold text-financial-muted">
                    {pName === state.activeProfile
                      ? `${state.transactions.length} txns · ${state.lots.filter(l => l.remainingQty > 0).length} open lots · ${state.closedTrades.length} closed logs`
                      : 'Restore backup or import to check metrics'
                    }
                  </p>
                </div>

                <div className="flex items-center justify-end space-x-2 border-t border-financial-border/40 pt-2.5 mt-2 select-none">
                  {/* Lock Shield */}
                  {isActive && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPINModal(pName);
                      }}
                      className="p-1.5 hover:bg-financial-card rounded text-financial-muted hover:text-blue-500 transition-colors"
                      title="Set PIN Locks Security"
                    >
                      <Shield size={13} />
                    </button>
                  )}

                  {/* Rename button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingProfileName(pName);
                      setRenameInputVal(pName);
                    }}
                    className="p-1.5 hover:bg-financial-card rounded text-financial-muted hover:text-financial-text transition-colors"
                    title="Rename Profile"
                  >
                    ✏️
                  </button>

                  {/* Duplicate button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicateProfile(pName);
                    }}
                    className="p-1.5 hover:bg-financial-card rounded text-financial-muted hover:text-financial-green transition-colors"
                    title="Duplicate Profile"
                  >
                    <Copy size={13} />
                  </button>

                  {/* Delete button */}
                  {state.profiles.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveProfile(pName);
                      }}
                      className="p-1.5 hover:bg-financial-card rounded text-financial-muted hover:text-financial-red transition-colors"
                      title="Delete Profile"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add Profile Card */}
          <div
            onClick={() => {
              const name = prompt('Enter name for the new profile:');
              if (name && name.trim()) {
                const trimmed = name.trim();
                if (state.profiles.includes(trimmed)) {
                  showToast('A profile with that name already exists.', 'error');
                  return;
                }
                dispatch({ type: 'ADD_PROFILE', payload: trimmed });
                showToast(`Profile "${trimmed}" created successfully!`, 'success');
              }
            }}
            className="border border-dashed border-financial-border hover:border-financial-green/50 p-5 rounded-xl flex items-center justify-center h-36 cursor-pointer text-financial-muted hover:text-financial-green transition-all"
          >
            <div className="text-center font-bold space-y-1">
              <p className="text-xl">+</p>
              <p className="text-xs">Create New Profile</p>
            </div>
          </div>

        </div>
      </div>

      {/* Grid wrapper for CSV and Backups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* SECTION 1: Master Script CSV Sync */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <h3 className="text-md font-bold text-financial-text border-b border-financial-border pb-3 flex items-center">
            <Upload size={18} className="mr-2 text-financial-green" /> Master Script Autocomplete Database
          </h3>
          <p className="text-xs text-financial-muted leading-relaxed">
            Upload NSE/BSE CSV files to enable quick stock lookups during BUY transactions. Download the official list below, then upload it.
          </p>

          {/* NSE/BSE download links */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Official Exchange CSV Sources</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href="https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-400 text-xs font-semibold rounded-lg transition-colors"
              >
                <Download size={12} /> Download NSE Equity List (CSV)
              </a>
              <a
                href="https://www.bseindia.com/corporates/List_Scrips.aspx"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-orange-600/10 hover:bg-orange-600/20 border border-orange-500/30 text-orange-400 text-xs font-semibold rounded-lg transition-colors"
                title="BSE: Choose Group=Equity, select all, then click Download"
              >
                <ExternalLink size={12} /> BSE Scrip List (Manual Download)
              </a>
            </div>
            <p className="text-[10px] text-zinc-600 leading-relaxed">
              NSE: direct CSV download. BSE: select Group=Equity on the page, then click Download.
            </p>
          </div>

          {/* Auto-sync toggle */}
          <div className="flex items-center justify-between bg-financial-bg/30 border border-financial-border/60 rounded-lg px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-financial-text">Auto-sync NSE list on app start</p>
              <p className="text-[10px] text-financial-muted">Attempts to fetch NSE equity CSV daily on launch (Vercel only)</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={state.settings.autoSyncMaster}
                onChange={e => {
                  dispatch({ type: 'UPDATE_SETTINGS', payload: { autoSyncMaster: e.target.checked } });
                  if (!e.target.checked) setSyncError(null);
                }}
              />
              <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:bg-financial-green peer-focus:outline-none transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
            </label>
          </div>

          {/* Sync status + action buttons */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span className={`text-[10px] font-semibold ${syncStatus.color}`}>{syncStatus.label}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAutoSyncNow}
                disabled={isSyncing}
                className="flex items-center gap-1 px-3 py-1.5 bg-financial-card border border-financial-border hover:border-blue-500/50 text-financial-muted hover:text-blue-400 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} /> {isSyncing ? 'Trying...' : 'Try Auto-Sync'}
              </button>
              {state.stockMaster.length > 0 && (
                <button
                  onClick={handleClearMaster}
                  className="flex items-center gap-1 px-3 py-1.5 bg-financial-card border border-financial-red/30 hover:border-financial-red/70 text-financial-red/60 hover:text-financial-red text-xs font-semibold rounded-lg transition-colors"
                >
                  <XCircle size={11} /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Inline sync error / instructions panel */}
          {syncError && (
            <div className="bg-amber-500/8 border border-amber-500/30 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-400 mb-1">Auto-sync unavailable</p>
                  <p className="text-[11px] text-amber-300/80 leading-relaxed">{syncError.message}</p>
                </div>
                <button onClick={() => setSyncError(null)} className="text-zinc-500 hover:text-zinc-300 shrink-0">
                  <XCircle size={13} />
                </button>
              </div>
              {syncError.instructions.length > 0 && (
                <div className="space-y-1 pl-5">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">How to update manually:</p>
                  {syncError.instructions.map((step, i) => (
                    <p key={i} className="text-[11px] text-zinc-400 flex items-start gap-1.5">
                      <CheckCircle size={10} className="text-amber-500 shrink-0 mt-0.5" />
                      {step}
                    </p>
                  ))}
                </div>
              )}
              <a
                href={syncError.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 text-xs font-semibold rounded-lg transition-colors"
              >
                <Download size={11} /> Download NSE CSV Now
              </a>
            </div>
          )}

          {/* Existing database count + upload */}
          <div className="flex items-center justify-between bg-financial-bg/50 border border-financial-border p-4 rounded-lg">
            <div className="space-y-1">
              <p className="text-xs font-bold text-financial-text">Database script entries</p>
              <p className="text-3xs text-financial-muted font-mono">{state.stockMaster.length} scripts in local registry.</p>
            </div>
            
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleCSVUpload}
              className="hidden"
            />
            
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isCsvUploading}
              className="px-4 py-2 bg-financial-green hover:bg-financial-green/90 text-white font-bold rounded-lg text-xs shadow flex items-center space-x-1 cursor-pointer"
            >
              <Upload size={12} />
              <span>{isCsvUploading ? 'Syncing...' : 'Upload CSV'}</span>
            </button>
          </div>
        </div>

        {/* Broker Trades CSV Import */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <h3 className="text-md font-bold text-financial-text border-b border-financial-border pb-3 flex items-center">
            <Upload size={18} className="mr-2 text-financial-green" /> Import Broker Trades (CSV)
          </h3>
          <p className="text-xs text-financial-muted leading-relaxed">
            Upload a CSV containing your historical trades to bulk import them into LotLedger. Required columns: <code className="text-financial-text">Date</code>, <code className="text-financial-text">Script</code>, <code className="text-financial-text">Type</code> (BUY/SELL), <code className="text-financial-text">Quantity</code>, <code className="text-financial-text">Price</code>.
          </p>

          <div className="flex items-center justify-between bg-financial-bg/50 border border-financial-border p-4 rounded-lg mt-4">
            <input
              type="file"
              accept=".csv"
              ref={tradesCsvInputRef}
              onChange={handleTradesCSVUpload}
              className="hidden"
            />
            
            <button
              onClick={() => tradesCsvInputRef.current?.click()}
              disabled={isTradesCsvUploading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-600/90 text-white font-bold rounded-lg text-xs shadow flex items-center space-x-1 cursor-pointer w-full justify-center transition-all"
            >
              <Upload size={12} />
              <span>{isTradesCsvUploading ? 'Processing Trades...' : 'Upload Trades CSV'}</span>
            </button>
          </div>
        </div>

        {/* SECTION 2: Backups restoration */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4">
          <h3 className="text-md font-bold text-financial-text border-b border-financial-border pb-3 flex items-center">
            <FileSpreadsheet size={18} className="mr-2 text-financial-green" /> Backup & Restore Accounts
          </h3>
          <p className="text-xs text-financial-muted leading-relaxed">
            Your Excel spreadsheet IS your account. Export all holdings periodically as a safe offline backup. Import back anytime to restore complete states.
          </p>

          <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
            <div>
              <label className="block text-3xs text-financial-muted mb-1.5">Export Template</label>
              <select
                value={exportFormat}
                onChange={e => setExportFormat(e.target.value as any)}
                className="w-full bg-financial-bg border border-financial-border rounded px-3 py-1.5 text-financial-text focus:outline-none"
              >
                <option value="multi-tab">Multi-Tab Workbook</option>
                <option value="single-sheet">Stacked Single Sheet</option>
              </select>
            </div>

            <div>
              <label className="block text-3xs text-financial-muted mb-1.5">Sort Grouping</label>
              <select
                value={exportGrouping}
                onChange={e => setExportGrouping(e.target.value as any)}
                className="w-full bg-financial-bg border border-financial-border rounded px-3 py-1.5 text-financial-text focus:outline-none"
              >
                <option value="chronological">Chronological Log</option>
                <option value="scriptwise">Script-wise aggregate</option>
              </select>
            </div>
          </div>

          <div className="flex justify-between items-center space-x-4 border-t border-financial-border/40 pt-4 mt-2 select-none">
            <input
              type="file"
              accept=".xlsx"
              ref={restoreInputRef}
              onChange={handleExcelRestore}
              className="hidden"
            />
            
            <button
              onClick={() => restoreInputRef.current?.click()}
              className="px-5 py-2.5 border border-financial-border hover:bg-financial-bg hover:text-white text-financial-muted font-bold rounded-lg text-xs transition-colors cursor-pointer"
            >
              Import from Excel
            </button>

            <button
              onClick={handleExport}
              className="px-5 py-2.5 bg-financial-green hover:bg-financial-green/90 text-white font-bold rounded-lg text-xs shadow flex items-center space-x-1 cursor-pointer font-outfit"
            >
              <Download size={12} />
              <span>Export Portfolio (.xlsx)</span>
            </button>
          </div>
        </div>

      </div>

      {/* SECTION 4: Preferences and Tax Form configs */}
      <form onSubmit={handleSavePreferences} className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-6">
        <h3 className="text-md font-bold text-financial-text border-b border-financial-border pb-3 flex items-center">
          <SettingsIcon size={18} className="mr-2 text-financial-green" /> Portfolio Preferences & Brokerage settings
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
          <div>
            <label className="block text-xs font-semibold text-financial-muted mb-2">Buy Brokerage Charge (%)</label>
            <input
              type="number"
              step="0.01"
              value={buyBrokerage}
              onChange={e => setBuyBrokerage(Number(e.target.value))}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-financial-muted mb-2">Sell Brokerage Charge (%)</label>
            <input
              type="number"
              step="0.01"
              value={sellBrokerage}
              onChange={e => setSellBrokerage(Number(e.target.value))}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-financial-muted mb-2">DP Flat Charges (₹)</label>
            <input
              type="number"
              step="0.01"
              value={dpCharges}
              onChange={e => setDpCharges(Number(e.target.value))}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-financial-muted mb-2">STT Regulatory (%)</label>
            <input
              type="number"
              step="0.001"
              value={sttPercent}
              onChange={e => setSttPercent(Number(e.target.value))}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-financial-muted mb-2">Exchange charges (%)</label>
            <input
              type="number"
              step="0.0001"
              value={exchangePercent}
              onChange={e => setExchangePercent(Number(e.target.value))}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-financial-muted mb-2">GST Tax rate (%)</label>
            <input
              type="number"
              value={gstPercent}
              onChange={e => setGstPercent(Number(e.target.value))}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-financial-muted mb-2">Concentration limit Warning (%)</label>
            <input
              type="number"
              value={concentrationWarning}
              onChange={e => setConcentrationWarning(Number(e.target.value))}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-financial-muted mb-2">Idle Lots Warning (Days)</label>
            <input
              type="number"
              value={idleLotDays}
              onChange={e => setIdleLotDays(Number(e.target.value))}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-financial-muted mb-2">LTCG Proximity Countdown (Days)</label>
            <input
              type="number"
              value={ltcgWarningDays}
              onChange={e => setLtcgWarningDays(Number(e.target.value))}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-financial-muted mb-2">Financial Year Start Month (1-12)</label>
            <select
              value={fyStartMonth}
              onChange={e => setFyStartMonth(Number(e.target.value))}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2.5 text-financial-text focus:outline-none focus:border-financial-green"
            >
              <option value={1}>1 - January</option>
              <option value={4}>4 - April (India standard)</option>
              <option value={10}>10 - October</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-financial-muted mb-2">Currency Symbol</label>
            <input
              type="text"
              value={currencySymbol}
              onChange={e => setCurrencySymbol(e.target.value)}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-financial-muted mb-2">Portfolio segments (comma separated)</label>
            <input
              type="text"
              value={portfoliosString}
              onChange={e => setPortfoliosString(e.target.value)}
              className="w-full bg-financial-bg border border-financial-border rounded-lg px-4 py-2 text-financial-text focus:outline-none focus:border-financial-green"
            />
          </div>
        </div>

        <button
          type="submit"
          className="px-6 py-2.5 bg-financial-green hover:bg-financial-green/90 text-white font-bold rounded-lg text-sm shadow transition-transform active:scale-97 select-none cursor-pointer"
        >
          Save Preference Configurations
        </button>
      </form>

      {/* SECTION 3: DANGER ZONE Reset */}
      <div className="bg-financial-card border border-red-500/10 p-6 rounded-xl space-y-4">
        <h3 className="text-md font-bold text-financial-red border-b border-red-500/10 pb-3 flex items-center">
          <Trash2 size={18} className="mr-2" /> Danger Zone
        </h3>
        <p className="text-xs text-financial-muted leading-relaxed">
          Factory resetting will permanently delete all records inside of your active profile "{state.activeProfile}". Please download your backup spreadsheet first.
        </p>
        
        <button
          onClick={handleFactoryReset}
          className="px-5 py-2.5 bg-transparent border border-financial-red/40 hover:bg-financial-red text-financial-red hover:text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
        >
          Erase Active Profile holdings
        </button>
      </div>

      {/* Lock Shield Password/PIN Modal (Section 13.4) */}
      {securityProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-financial-card border border-financial-border rounded-xl w-full max-w-sm overflow-hidden shadow-2xl animate-fadeIn">
            
            <div className="px-6 py-4 border-b border-financial-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-financial-text flex items-center">
                <Lock size={14} className="mr-2 text-blue-500" /> Locked Security PIN
              </h3>
              <button
                onClick={() => setSecurityProfile(null)}
                className="text-financial-muted hover:text-financial-text"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-financial-muted leading-relaxed">
                Add a 4-digit PIN password or text password to lock the active profile. The lock overlay triggers on initial load and after 10 minutes of inactivity.
              </p>

              <div>
                <label className="block text-3xs font-bold text-financial-muted uppercase mb-1.5">Enter Profile PIN code / password</label>
                <input
                  type="password"
                  value={pinCode}
                  onChange={e => setPinCode(e.target.value)}
                  placeholder="Min 4 character passcode"
                  className="w-full bg-financial-bg border border-financial-border rounded px-3 py-2 text-financial-text focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2.5 px-6 py-3.5 bg-financial-bg border-t border-financial-border">
              {state.settings.profilePasswordHash && (
                <button
                  onClick={handleRemoveSecurity}
                  className="px-3.5 py-1.5 bg-financial-border text-financial-red text-xs font-semibold rounded"
                >
                  Remove Lock
                </button>
              )}
              <button
                onClick={handleSaveSecurity}
                className="px-4 py-1.5 bg-financial-green hover:bg-financial-green/90 text-white text-xs font-bold rounded"
              >
                Save PIN lock
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

