import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface PromptOptions {
  title: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  defaultValue?: string;
}

interface PromptContextType {
  showPrompt: (options: PromptOptions) => Promise<string | null>;
}

const PromptContext = createContext<PromptContextType | undefined>(undefined);

export const PromptProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<PromptOptions | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [resolvePromise, setResolvePromise] = useState<(value: string | null) => void>();

  const showPrompt = useCallback((opts: PromptOptions): Promise<string | null> => {
    setOptions(opts);
    setInputValue(opts.defaultValue || '');
    setIsOpen(true);
    return new Promise((resolve) => {
      setResolvePromise(() => resolve);
    });
  }, []);

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setIsOpen(false);
    if (resolvePromise) resolvePromise(inputValue.trim() !== '' ? inputValue.trim() : null);
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolvePromise) resolvePromise(null);
  };

  return (
    <PromptContext.Provider value={{ showPrompt }}>
      {children}
      {isOpen && options && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <form
            onSubmit={handleConfirm}
            className="bg-financial-card border border-financial-border rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 transform transition-all select-none animate-scale-up"
          >
            <div className="space-y-1">
              <h3 className="text-base font-bold text-financial-text">{options.title}</h3>
              <p className="text-[10px] text-financial-muted">Please specify a unique alphanumeric name below.</p>
            </div>
            
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={options.placeholder || 'Enter value...'}
              className="w-full bg-financial-bg border border-financial-border rounded-xl px-4 py-2.5 text-sm text-financial-text focus:outline-none focus:border-financial-green placeholder-financial-muted/30"
              autoFocus
              required
            />

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4.5 py-2.5 bg-transparent text-financial-muted border border-financial-border rounded-xl hover:bg-financial-border hover:text-financial-text transition-colors text-xs font-semibold"
              >
                {options.cancelLabel || 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4.5 py-2.5 rounded-xl bg-financial-green hover:bg-financial-green/90 text-white text-xs font-semibold shadow transition-transform active:scale-97 cursor-pointer"
              >
                {options.confirmLabel || 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      )}
    </PromptContext.Provider>
  );
};

export const usePrompt = () => {
  const context = useContext(PromptContext);
  if (!context) throw new Error('usePrompt must be used within PromptProvider');
  return context;
};
