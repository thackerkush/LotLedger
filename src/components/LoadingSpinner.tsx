import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  fullscreen?: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  fullscreen = false, 
  label, 
  size = 'md' 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  const spinner = (
    <div className="flex flex-col items-center justify-center space-y-3">
      <Loader2 className={`animate-spin text-financial-text ${sizeClasses[size]}`} />
      {label && <p className="text-financial-text text-sm font-medium">{label}</p>}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        {spinner}
      </div>
    );
  }

  return spinner;
};
