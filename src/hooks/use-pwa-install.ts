/**
 * usePWAInstall — PWA install hook
 * @author  CodexEngr <https://www.codexengr.com>
 */
'use client';

import { useState, useEffect, useCallback } from 'react';

export type DevicePlatform = 'android' | 'ios' | 'desktop-chrome' | 'desktop-other' | 'unknown';

interface PWAInstallState {
  /** True once the native beforeinstallprompt is captured (Android/Chrome) or on iOS */
  canInstall: boolean;
  /**
   * True as soon as the platform is known and the app is not already installed.
   * Used by the footer button — visible immediately without waiting for the
   * beforeinstallprompt event.
   */
  canShowButton: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  platform: DevicePlatform;
  promptInstall: () => Promise<boolean>;
  dismissBanner: () => void;
  showBanner: boolean;
  /** iOS-specific instruction modal */
  showIOSModal: boolean;
  openIOSModal: () => void;
  closeIOSModal: () => void;
}

function detectPlatform(ua: string): DevicePlatform {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/chrome/i.test(ua) && !/mobile/i.test(ua)) return 'desktop-chrome';
  return 'desktop-other';
}

const BANNER_DISMISSED_KEY = 'pwa_banner_dismissed';  // permanent flag, not a timestamp
const PWA_INSTALLED_KEY    = 'pwa_installed';

/** Returns true if running inside the installed PWA shell */
function detectStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (navigator as any).standalone === true
  );
}

export function usePWAInstall(): PWAInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled]       = useState(false);
  const [platform, setPlatform]             = useState<DevicePlatform>('unknown');
  const [showBanner, setShowBanner]         = useState(false);
  const [promptReady, setPromptReady]       = useState(false);
  const [showIOSModal, setShowIOSModal]     = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // ── 1. Platform detection ─────────────────────────────────────────────
    const detectedPlatform = detectPlatform(navigator.userAgent);
    setPlatform(detectedPlatform);
    const isIOSDevice = detectedPlatform === 'ios';

    // ── 2. Already installed? ─────────────────────────────────────────────
    const standalone    = detectStandalone();
    const everInstalled = localStorage.getItem(PWA_INSTALLED_KEY) === 'true';

    if (standalone || everInstalled) {
      setIsInstalled(true);
      if (standalone) localStorage.setItem(PWA_INSTALLED_KEY, 'true');
      return;
    }

    // ── 3. Already permanently dismissed? ────────────────────────────────
    const alreadyDismissed = localStorage.getItem(BANNER_DISMISSED_KEY) === 'true';
    if (alreadyDismissed) return;

    // ── 4. Show banner immediately on all platforms ───────────────────────
    //    Desktop non-Chrome (Firefox, Safari, Edge) doesn't fire
    //    beforeinstallprompt — we still want the banner visible so the user
    //    at least knows the app exists. The Install button will open the
    //    guide modal in that case.
    setShowBanner(true);

    // ── 5. iOS — mark as installable via share sheet ──────────────────────
    if (isIOSDevice) {
      setPromptReady(true);
    }

    // ── 6. Android / Desktop Chrome — capture the native install prompt ───
    //    Keep listening even after banner is shown; prompt may arrive slightly
    //    after mount on slower connections.
    const promptHandler = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(evt);
      setPromptReady(true);
    };
    window.addEventListener('beforeinstallprompt', promptHandler);

    // ── 7. Install completion ─────────────────────────────────────────────
    const installedHandler = () => {
      setIsInstalled(true);
      setShowBanner(false);
      setShowIOSModal(false);
      localStorage.setItem(PWA_INSTALLED_KEY, 'true');
    };
    window.addEventListener('appinstalled', installedHandler);

    // ── 8. Display-mode change (deferred standalone detection) ────────────
    const mq = window.matchMedia('(display-mode: standalone)');
    const mqHandler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setShowBanner(false);
        setShowIOSModal(false);
        localStorage.setItem(PWA_INSTALLED_KEY, 'true');
      }
    };
    mq.addEventListener('change', mqHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', promptHandler);
      window.removeEventListener('appinstalled', installedHandler);
      mq.removeEventListener('change', mqHandler);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setShowBanner(false);
      localStorage.setItem(PWA_INSTALLED_KEY, 'true');
    }
    return outcome === 'accepted';
  }, [deferredPrompt]);

  /** Permanently dismiss — banner will never show again on this device */
  const dismissBanner = useCallback(() => {
    setShowBanner(false);
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  }, []);

  const openIOSModal  = useCallback(() => setShowIOSModal(true),  []);
  const closeIOSModal = useCallback(() => setShowIOSModal(false), []);

  const isIOS         = platform === 'ios';
  // canInstall: native prompt ready OR iOS (share sheet) — used by the floating banner Install button
  const canInstall    = (promptReady || isIOS) && !isInstalled;
  // canShowButton: platform known + not installed — footer button shows immediately
  const canShowButton = platform !== 'unknown' && !isInstalled;

  return {
    canInstall,
    canShowButton,
    isInstalled,
    isIOS,
    platform,
    promptInstall,
    dismissBanner,
    // Guard: never show inside installed PWA shell
    showBanner: showBanner && !isInstalled,
    showIOSModal,
    openIOSModal,
    closeIOSModal,
  };
}

// ── Global type augmentation ──────────────────────────────────────────────────
declare global {
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    prompt(): Promise<void>;
  }
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}
