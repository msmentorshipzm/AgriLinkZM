import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'footer';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          variant === 'footer'
            ? 'inline-flex items-center gap-2 rounded-lg bg-[#1B5E20] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#154A19] whitespace-nowrap shrink-0'
            : 'inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-2 text-xs font-semibold text-[#111827] transition-colors hover:border-[#1B5E20] hover:text-[#1B5E20] whitespace-nowrap shrink-0'
        }
      >
        {isInstallable ? <Download className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
        {isInstallable ? 'Install App' : isIOS ? 'Install on iPhone' : 'Install App on Phone'}
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-md rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h3 id="pwa-guide-title" className="text-lg font-bold text-[#111827]">
                Install AgriLink ZM on Your Phone
              </h3>
              <button
                type="button"
                aria-label="Close install instructions"
                onClick={() => setShowGuide(false)}
                className="rounded-lg p-1.5 text-[#4B5563] hover:bg-[#F3F5F2] hover:text-[#111827]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-[#4B5563]">
              AgriLink ZM works as a lightweight Progressive Web App designed for low-storage Android and iOS phones across Zambia—no Google Play Store download needed.
            </p>
            <ol className="mt-4 space-y-2.5 text-sm text-[#111827]">
              {isIOS ? (
                <>
                  <li>1. Tap the <strong>Share</strong> icon in Safari at the bottom of your screen.</li>
                  <li>2. Scroll down and select <strong>Add to Home Screen</strong>.</li>
                  <li>3. Tap <strong>Add</strong> to pin AgriLink ZM to your home screen.</li>
                </>
              ) : (
                <>
                  <li>1. Open this site in <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong> on Android.</li>
                  <li>2. Tap the browser menu (three dots) in the top right corner.</li>
                  <li>3. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                </>
              )}
            </ol>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-6 w-full rounded-lg bg-[#1B5E20] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#154A19]"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
