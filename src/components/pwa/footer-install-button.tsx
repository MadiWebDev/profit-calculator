/**
 * FooterInstallButton — inline PWA install CTA for the footer
 * Shown on all non-installed devices as soon as the platform is detected.
 * - iOS: opens the step-by-step instructions modal
 * - Android / Desktop: triggers the native beforeinstallprompt if captured,
 *   or falls back to opening the guide modal (edge case: prompt not yet fired)
 *
 * @author  CodexEngr <https://www.codexengr.com>
 */
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Download, Apple, Monitor, Smartphone } from 'lucide-react';
import { IOSInstallModal } from '@/components/pwa/ios-install-modal';
import { usePWAInstall } from '@/hooks/use-pwa-install';

type PlatformConfig = {
  label: string;
  sublabel: string;
  Icon: React.ComponentType<{ size: number; className?: string }>;
};

function getPlatformConfig(platform: string, isIOS: boolean): PlatformConfig {
  if (isIOS)
    return { label: 'Add to iPhone / iPad', sublabel: 'Tap to see how', Icon: Apple };
  switch (platform) {
    case 'android':
      return { label: 'Get the Android App', sublabel: 'Install instantly · Free', Icon: Smartphone };
    case 'desktop-chrome':
      return { label: 'Install on Desktop', sublabel: 'Works offline · Faster', Icon: Monitor };
    default:
      return { label: 'Install App', sublabel: 'Free · No storage needed', Icon: Download };
  }
}

export function FooterInstallButton() {
  const {
    canShowButton,
    isInstalled,
    isIOS,
    platform,
    promptInstall,
    showIOSModal,
    openIOSModal,
    closeIOSModal,
  } = usePWAInstall();

  // Hide only when already installed or platform not yet detected (SSR hydration)
  if (isInstalled || !canShowButton) return null;

  const { label, sublabel, Icon } = getPlatformConfig(platform, isIOS);

  const handleClick = async () => {
    if (isIOS) {
      // iOS only: open the step-by-step guide modal
      openIOSModal();
      return;
    }
    // Android / desktop-chrome / desktop-other: trigger native prompt
    // promptInstall() is a no-op (returns false) if deferredPrompt not yet captured —
    // that's fine, the button stays visible for the user to try again
    await promptInstall();
  };

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.35 }}
        >
          <motion.button
            onClick={handleClick}
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="group flex items-center gap-3 px-5 py-3 rounded-2xl border border-primary/30 bg-primary hover:bg-primary hover:border-primary transition-all duration-300 shadow-sm hover:shadow-md"
            aria-label={label}
          >
            {/* Animated pulse dot */}
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground opacity-60 group-hover:opacity-0" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-foreground transition-colors" />
            </span>

            <Icon
              size={16}
              className="flex-shrink-0 text-primary-foreground transition-colors"
            />

            <div className="text-left">
              <p className="text-xs font-bold text-primary-foreground leading-tight transition-colors">
                {label}
              </p>
              <p className="text-[10px] text-primary-foreground/70 leading-tight transition-colors">
                {sublabel}
              </p>
            </div>
          </motion.button>
        </motion.div>
      </AnimatePresence>

      {/* iOS guide modal — only reachable on iOS devices */}
      <IOSInstallModal open={showIOSModal} onClose={closeIOSModal} />
    </>
  );
}
