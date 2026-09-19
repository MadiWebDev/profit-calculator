/**
 * InstallBanner — PWA install prompt bar
 * Appears immediately on all devices (desktop, Android, iPhone).
 * Shows once — permanently dismissed after the user taps Cancel.
 * Never shows when the app is already installed (standalone mode).
 * On iOS the Install button opens the step-by-step guide modal.
 * On Android/Chrome the Install button triggers the native prompt.
 * On other desktop browsers (Firefox, Safari, Edge) the Install button
 * opens the guide modal as a manual walkthrough.
 *
 * @author  CodexEngr <https://www.codexengr.com>
 */
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Zap, Bell, WifiOff } from 'lucide-react';
import { IOSInstallModal } from '@/components/pwa/ios-install-modal';
import Image from 'next/image';
import { usePWAInstall } from '@/hooks/use-pwa-install';


export function InstallBanner() {
  const {
    showBanner,
    isIOS,
    platform,
    promptInstall,
    dismissBanner,
    showIOSModal,
    openIOSModal,
    closeIOSModal,
  } = usePWAInstall();

  /**
   * Decide what to do when the user taps Install:
   * - iOS only             → open the step-by-step guide modal
   * - Android / Chrome     → fire the native beforeinstallprompt dialog
   * - Everything else      → dismiss the banner (no install mechanism available)
   */
  const handleInstall = async () => {
    if (isIOS) {
      openIOSModal();
      return;
    }
    // Android or any desktop browser that supports beforeinstallprompt
    await promptInstall();
    // Whether accepted or dismissed, just close the banner — don't open the iOS modal
    dismissBanner();
  };

  return (
    <>
      <AnimatePresence>
        {showBanner && (
          <motion.div
            key="install-banner"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-[9999]"
            role="dialog"
            aria-modal="true"
            aria-label="Install GetProfitCalc app"
          >
            <div className="bg-card   shadow-[0_-4px_24px_rgba(0,0,0,0.14)] px-4 py-3 sm:px-6">
              <div className="max-w-2xl mx-auto flex items-center gap-3">

                {/* App icon */}
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-border/40 flex-shrink-0 shadow-sm">
                  <Image
                    src="/getprofitcalc1.jpg"
                    alt="GetProfitCalc"
                    width={40}
                    height={40}
                    className="object-cover w-full h-full"
                    priority
                  />
                </div>

                {/* Name + benefit chips */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground leading-tight truncate">
                    GetPRofitCalc App
                  </p>
                 
                </div>

                {/* Cancel + Install buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={dismissBanner}
                    aria-label="Dismiss install prompt"
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>

                  <motion.button
                    onClick={handleInstall}
                    whileTap={{ scale: 0.96 }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow hover:bg-primary/90 transition-colors"
                  >
                    <Download size={12} />
                    Install
                  </motion.button>
                </div>

                {/* Secondary close icon */}
                <button
                  onClick={dismissBanner}
                  aria-label="Close install banner"
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted transition-colors flex-shrink-0 ml-0.5"
                >
                  <X size={12} className="text-muted-foreground" />
                </button>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS guide modal — only reachable on iOS devices */}
      <IOSInstallModal open={showIOSModal} onClose={closeIOSModal} />
    </>
  );
}
