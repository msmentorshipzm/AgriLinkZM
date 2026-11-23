import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-[#F59E0B] bg-[#111827] px-3.5 py-2 text-xs font-medium text-white shadow-lg"
    >
      <WifiOff className="h-4 w-4 text-[#F59E0B]" />
      <span>Offline Mode — Showing cached AgriLink ZM listings</span>
    </div>
  );
};
