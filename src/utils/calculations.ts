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
