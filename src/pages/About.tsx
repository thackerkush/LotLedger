import React, { useState } from 'react';
import { Wallet, ShieldCheck, HelpCircle, Key, Info, ChevronDown, ChevronUp } from 'lucide-react';

export const About: React.FC = () => {
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);

  const steps = [
    { num: '1', title: '⚙️ Configure Settings', desc: 'Configure default brokerage %, flat DP charges, STT rates, and financial year segments before entering trades.' },
    { num: '2', title: '📚 Upload Script Database', desc: 'Go to Settings → Master Script and upload the NSE/BSE CSV list to enable full datalist autocomplete.' },
    { num: '3', title: '➕ Enter Your Trades', desc: 'Navigate to Trade Entry → BUY tab to start logging your initial purchase transactions.' },
    { num: '4', title: '📊 Track & Analyse', desc: 'Use the Dashboard, Open Positions, reports, and Analytics to track unrealised P&L and tax classes.' },
    { num: '5', title: '💾 Backup Regularly', desc: 'Export your portfolio to Excel frequently from Settings. The spreadsheet is your account!' }
  ];

  return (
    <div className="space-y-8 page-transition pb-16 text-sm max-w-4xl">
      
      {/* Section 1: App Header (Section 19.1) */}
      <div className="flex flex-col items-center text-center p-8 bg-financial-card border border-financial-border rounded-2xl space-y-3 shadow">
        <div className="p-4 bg-financial-green/10 border border-financial-green/20 rounded-full text-financial-green">
          <Wallet size={40} />
        </div>
        <h2 className="text-3xl font-extrabold font-outfit text-financial-text tracking-tight">LotLedger</h2>
        <p className="text-sm text-financial-muted max-w-md leading-relaxed">
          Your fully offline, secure Indian equity portfolio and tax ledger tracker.
        </p>
        <span className="text-xs font-bold px-3 py-1 rounded-full bg-financial-border text-financial-muted border border-financial-border">
          Version v1.0.0
        </span>
      </div>

      {/* Section 2: What is this app? */}
      <div className="space-y-2.5">
        <h3 className="text-base font-bold text-financial-text">What is LotLedger?</h3>
        <p className="text-financial-muted leading-relaxed">
          <strong>LotLedger</strong> is a production-ready, fully offline portfolio management utility tailored specifically for Indian retail equity investors. There are no logins, no cloud APIs, and no tracking cookies. All transactions, manual prices, dividends, and settings remain isolated inside your browser's local storage. This ensures absolute privacy and independence from cloud server shutdowns.
        </p>
      </div>

      {/* Section 3: Quick Start Step Cards */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-financial-text flex items-center">
          <HelpCircle size={16} className="mr-2 text-financial-green" /> Quick Start Guide
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {steps.map(s => (
            <div key={s.num} className="bg-financial-card border border-financial-border rounded-xl p-4.5 space-y-3 hover:shadow-md transition-shadow">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-financial-green/10 border border-financial-green/20 text-financial-green font-bold text-xs select-none">
                {s.num}
              </span>
              <div className="space-y-1">
                <p className="text-xs font-bold text-financial-text leading-snug">{s.title}</p>
                <p className="text-3xs text-financial-muted leading-relaxed font-medium">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Tax Rules Reference Card */}
      <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4 shadow">
        <h3 className="text-base font-bold text-financial-text flex items-center">
          <Info size={16} className="mr-2 text-financial-green" /> Indian Equity Tax Rules Reference
        </h3>
        <div className="overflow-x-auto rounded-lg border border-financial-border/40">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-financial-border bg-financial-bg/50 text-financial-muted uppercase font-bold tracking-wider">
                <th className="py-3 px-5">Tax Type</th>
                <th className="py-3 px-4">Holding Period</th>
                <th className="py-3 px-4">Tax Rate</th>
                <th className="py-3 px-5">Exemption Criteria</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-financial-border/40 font-medium">
              <tr className="hover:bg-financial-bg/25">
                <td className="py-3.5 px-5 font-bold text-financial-text">STCG (Short Term)</td>
                <td className="py-3.5 px-4 text-financial-text">Less than 365 Days</td>
                <td className="py-3.5 px-4 text-financial-red font-bold font-mono">20% Flat</td>
                <td className="py-3.5 px-5 text-financial-muted">None. Taxable from Re. 1</td>
              </tr>
              <tr className="hover:bg-financial-bg/25">
                <td className="py-3.5 px-5 font-bold text-financial-text">LTCG (Long Term)</td>
                <td className="py-3.5 px-4 text-financial-text">365 Days or More</td>
                <td className="py-3.5 px-4 text-financial-green font-bold font-mono">12.5% Flat</td>
                <td className="py-3.5 px-5 text-financial-muted">First ₹1,25,000 realised gains per FY are tax-free</td>
              </tr>
              <tr className="hover:bg-financial-bg/25">
                <td className="py-3.5 px-5 font-bold text-financial-text">Dividend Payouts</td>
                <td className="py-3.5 px-4 text-financial-text">Any duration</td>
                <td className="py-3.5 px-4 text-financial-text">Slab Tax Rates</td>
                <td className="py-3.5 px-5 text-financial-muted">TDS at 10% withheld by company if dividend exceeds ₹5,000</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-3xs text-financial-muted leading-relaxed italic">
          *Note: Tax rates are applicable for listed equity shares/equity mutual funds on Indian exchanges. Consult your CA for actual tax filings.
        </p>
      </div>

      {/* Grid for shortcuts and Privacy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Keyboard Shortcuts */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4 shadow">
          <h3 className="text-base font-bold text-financial-text flex items-center">
            <Key size={16} className="mr-2 text-financial-green" /> Keyboard Shortcuts
          </h3>
          <div className="space-y-3.5 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-financial-border/40">
              <span className="text-financial-muted font-medium">Go to Trade Entry (BUY)</span>
              <kbd className="bg-financial-bg border border-financial-border px-2 py-0.5 rounded font-mono font-bold text-financial-text">Ctrl + B</kbd>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-financial-border/40">
              <span className="text-financial-muted font-medium">Go to Trade Entry (SELL)</span>
              <kbd className="bg-financial-bg border border-financial-border px-2 py-0.5 rounded font-mono font-bold text-financial-text">Ctrl + S</kbd>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-financial-border/40">
              <span className="text-financial-muted font-medium">Export Portfolio to Excel</span>
              <kbd className="bg-financial-bg border border-financial-border px-2 py-0.5 rounded font-mono font-bold text-financial-text">Ctrl + E</kbd>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-financial-muted font-medium">Navigate to Dashboard</span>
              <kbd className="bg-financial-bg border border-financial-border px-2 py-0.5 rounded font-mono font-bold text-financial-text">Ctrl + D</kbd>
            </div>
          </div>
        </div>

        {/* Data & Privacy */}
        <div className="bg-financial-card border border-financial-border p-6 rounded-xl space-y-4 shadow flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-base font-bold text-financial-text flex items-center">
              <ShieldCheck size={18} className="mr-2 text-financial-green" /> Offline Privacy Pledge
            </h3>
            <p className="text-xs text-financial-muted leading-relaxed">
              LotLedger operates entirely in-memory and client-side. We have no analytics scripts, no backend relays, and no user tracking. Your financial records never leave your local workspace. All Excel exports/imports run strictly in your browser using client-side JavaScript.
            </p>
          </div>
          <div className="flex items-center space-x-2 text-xs text-financial-green font-semibold mt-4">
            <ShieldCheck size={16} /> <span>Your data is 100% yours, offline, and secure.</span>
          </div>
        </div>

      </div>

      {/* Section 7: Disclaimer */}
      <div className="bg-amber-500/10 border border-amber-500/25 p-4 rounded-xl text-amber-500 text-xs leading-relaxed">
        <strong>Disclaimer:</strong> This application is meant strictly for informational and personal tracking purposes. Estimated capital gains taxes, exemptions, and TDS figures are approximate. Always consult a certified Chartered Accountant or tax advisor for actual IT filings. The developer is not liable for any financial decisions or actions made based on this tool.
      </div>

      {/* Section 8: Collapsible accordions version history */}
      <div className="border border-financial-border rounded-xl bg-financial-card overflow-hidden">
        <button
          onClick={() => setIsChangelogOpen(!isChangelogOpen)}
          className="w-full flex items-center justify-between px-6 py-4 font-bold text-financial-text hover:bg-financial-bg/40 transition-colors select-none text-left"
        >
          <span>Version History & Changelog</span>
          {isChangelogOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {isChangelogOpen && (
          <div className="px-6 py-5 border-t border-financial-border/40 text-xs text-financial-muted space-y-3 leading-relaxed">
            <p className="font-bold text-financial-text">v1.0.0 — Initial Stable Release</p>
            <ul className="list-disc pl-4 space-y-1.5">
              <li>Trade Entry panels with live costing calculators and autocomplete lookups.</li>
              <li>Open Positions ledger with inline manual CMP overrides.</li>
              <li>FIFO lot matching selling engine compiling closed trades with STCG/LTCG capital gains allocations.</li>
              <li>Corporate Actions applied dynamically (stock splits, bonuses, spin-offs).</li>
              <li>Taxes and harvesting optimizers (tax-loss offset gains harvesting).</li>
              <li>Analytics charts, holding periods, and 53-week visual calendar heatmap.</li>
              <li>ExcelJS backup and restore system with profile validation locks.</li>
              <li>SHA-256 PIN password security locks.</li>
            </ul>
          </div>
        )}
      </div>

    </div>
  );
};
