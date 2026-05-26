/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, prefer-const, react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: ToastType) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};

const ToastItem: React.FC<{ toast: ToastMessage; onRemove: (id: string) => void }> = ({
  toast,
  onRemove,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const borderColors = {
    success: 'border-l-4 border-financial-green',
    error: 'border-l-4 border-financial-red',
    info: 'border-l-4 border-blue-500',
  };

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-financial-green" />,
    error: <AlertCircle className="w-5 h-5 text-financial-red" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  return (
    <div
      className={`flex items-start p-4 bg-financial-card shadow-lg rounded pointer-events-auto transform transition-all duration-300 translate-x-0 ${borderColors[toast.type]}`}
      role="alert"
    >
      <div className="flex-shrink-0 mr-3">{icons[toast.type]}</div>
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-financial-text">{toast.message}</p>
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="flex-shrink-0 ml-auto text-financial-muted hover:text-financial-text transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

