import type { Settings } from '../types';

export const formatCurrency = (value: number, symbol = '₹'): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(value)
    .replace('₹', symbol);
};

export const getFinancialYearStart = (date: Date, fyStartMonth: number = 4): Date => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-indexed
  if (month < fyStartMonth) {
    return new Date(year - 1, fyStartMonth - 1, 1);
  }
  return new Date(year, fyStartMonth - 1, 1);
};

export const calculateBuyCharges = (
  quantity: number,
  price: number,
  settings: Settings,
  customBrokeragePercent?: number
) => {
  const grossValue = quantity * price;
  const brokeragePercent = customBrokeragePercent ?? settings.brokeragePercentBuy;
  const brokerage = grossValue * (brokeragePercent / 100);
  const stt = grossValue * (settings.sttPercent / 100);
  const exchangeCharge = grossValue * (settings.exchangePercent / 100);
  const gst = (brokerage + exchangeCharge) * (settings.gstPercent / 100);
  // DP charges are 0 for buy, per requirements
  const dpCharges = 0; 
  const totalCost = grossValue + brokerage + stt + exchangeCharge + gst + dpCharges;
  const effectivePrice = quantity > 0 ? totalCost / quantity : 0;

  return {
    grossValue,
    brokerage,
    stt,
    exchangeCharge,
    gst,
    dpCharges,
    totalCost,
    effectivePrice,
  };
};

export const calculateSellCharges = (
  quantity: number,
  price: number,
  settings: Settings,
  customBrokeragePercent?: number,
  customDpCharges?: number
) => {
  const grossValue = quantity * price;
  const brokeragePercent = customBrokeragePercent ?? settings.brokeragePercentSell;
  const dpCharges = customDpCharges ?? settings.dpChargesFlat;

  const brokerage = grossValue * (brokeragePercent / 100);
  const stt = grossValue * (settings.sttPercent / 100);
  const exchangeCharge = grossValue * (settings.exchangePercent / 100);
  const gst = (brokerage + exchangeCharge) * (settings.gstPercent / 100);
  const totalCharges = brokerage + stt + exchangeCharge + gst + dpCharges;
  const netProceeds = grossValue - totalCharges;

  return {
    grossValue,
    brokerage,
    stt,
    exchangeCharge,
    gst,
    dpCharges,
    totalCharges,
    netProceeds,
  };
};

export interface CashFlow {
  amount: number;
  date: Date;
}

/**
 * Calculates the Extended Internal Rate of Return (XIRR) using the Newton-Raphson method.
 * @param cashFlows Array of { amount, date } objects. Note: Outflows (investments) should be negative, inflows (returns) should be positive.
 * @param guess Initial guess for the rate (default 0.1 i.e., 10%)
 * @returns The annualized rate of return as a decimal (e.g., 0.15 for 15%), or null if it fails to converge.
 */
export const calculateXIRR = (cashFlows: CashFlow[], guess = 0.1): number | null => {
  if (cashFlows.length < 2) return null;
  
  // XIRR requires at least one positive and one negative cash flow
  const hasPositive = cashFlows.some(cf => cf.amount > 0);
  const hasNegative = cashFlows.some(cf => cf.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  // Sort cash flows chronologically to ensure t0 is the earliest date
  const sortedFlows = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sortedFlows[0].date.getTime();
  
  const xnpv = (rate: number) => {
    return sortedFlows.reduce((sum, cf) => {
      const days = (cf.date.getTime() - t0) / (1000 * 3600 * 24);
      return sum + cf.amount / Math.pow(1 + rate, days / 365.0);
    }, 0);
  };

  const xnpvDerivative = (rate: number) => {
    return sortedFlows.reduce((sum, cf) => {
      const days = (cf.date.getTime() - t0) / (1000 * 3600 * 24);
      return sum - (days / 365.0) * cf.amount / Math.pow(1 + rate, (days / 365.0) + 1);
    }, 0);
  };

  let rate = guess;
  const maxIterations = 100;
  const tolerance = 1e-6;

  for (let i = 0; i < maxIterations; i++) {
    const f = xnpv(rate);
    const df = xnpvDerivative(rate);
    
    // Avoid division by zero
    if (Math.abs(df) < 1e-10) break;
    
    const nextRate = rate - f / df;
    if (Math.abs(nextRate - rate) < tolerance) {
      return nextRate;
    }
    rate = nextRate;
  }

  return null; // Did not converge
};

/**
 * Calculates the Maximum Drawdown from a series of portfolio values.
 * @param portfolioValues A chronological array of portfolio total values.
 * @returns The maximum drawdown as a decimal (e.g., 0.25 for 25%).
 */
export const calculateMaxDrawdown = (portfolioValues: number[]): number => {
  if (portfolioValues.length === 0) return 0;
  
  let maxDrawdown = 0;
  let peak = portfolioValues[0];
  
  for (const value of portfolioValues) {
    if (value > peak) {
      peak = value;
    }
    if (peak > 0) {
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }
  
  return maxDrawdown;
};
