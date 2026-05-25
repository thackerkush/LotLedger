import React, { useState } from 'react';
import { BuyForm } from '../components/BuyForm';
import { SellForm } from '../components/SellForm';
import { PlusCircle, MinusCircle } from 'lucide-react';

export const TradeEntry: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'BUY' | 'SELL'>('BUY');

  return (
    <div className="space-y-6 page-transition">
      {/* Tab Switch Headers */}
      <div className="flex bg-financial-card border border-financial-border rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('BUY')}
          className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'BUY'
              ? 'bg-financial-green text-white shadow-md'
              : 'text-financial-muted hover:text-financial-text'
          }`}
        >
          <PlusCircle size={16} />
          <span>BUY Equity</span>
        </button>

        <button
          onClick={() => setActiveTab('SELL')}
          className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'SELL'
              ? 'bg-financial-red text-white shadow-md'
              : 'text-financial-muted hover:text-financial-text'
          }`}
        >
          <MinusCircle size={16} />
          <span>SELL Equity</span>
        </button>
      </div>

      {/* Forms Router Body */}
      <div>
        {activeTab === 'BUY' ? <BuyForm /> : <SellForm />}
      </div>
    </div>
  );
};
