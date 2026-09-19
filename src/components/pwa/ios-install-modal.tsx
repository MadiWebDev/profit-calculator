/**
 * IOSInstallModal — step-by-step guide for adding the PWA to iPhone/iPad home screen
 * Triggered by the footer install button and the install banner on iOS.
 *
 * @author  CodexEngr <https://www.codexengr.com>
 */
'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Share2, Plus, MoreHorizontal, Smartphone, Share } from 'lucide-react';
import Image from 'next/image';

interface IOSInstallModalProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    num: 1,
    Icon: Share ,
    title: 'Tap the Share button',
    description: (
      <>
        At the bottom of Safari, tap the{' '}
        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
          <Share  size={13} className="text-primary" /> Share
        </span>{' '}
        icon (the box with an arrow pointing up).
      </>
    ),
  },
  {
    num: 2,
    Icon: Plus,
    title: 'Select "Add to Home Screen"',
    description: (
      <>
        Scroll down in the share sheet and tap{' '}
        <span className="font-semibold text-foreground">"Add to Home Screen"</span>
        {' '}
        <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-muted ml-0.5">
          <Plus size={11} className="text-foreground" />
        </span>
        .
      </>
    ),
  },
  {
    num: 3,
    Icon: Smartphone,
    title: 'Tap "Add" to confirm',
    description: (
      <>
        Confirm by tapping{' '}
        <span className="font-semibold text-foreground">"Add"</span> in the
        top-right corner. The Buy1Y1Ypp icon will appear on your home screen.
      </>
    ),
  },
] as const;

export function IOSInstallModal({ open, onClose }: IOSInstallModalProps) {
  /* Close on Escape key */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  /* Lock body scroll while open */
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop ─────────────────────────────────────────────────── */}
          <motion.div
            key="ios-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* ── Modal sheet ──────────────────────────────────────────────── */}
          <motion.div
            key="ios-modal-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="How to install Buy1Y1Yn iPhone or iPad"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-[10001] sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-sm sm:w-full"
          >
            <div className="bg-card rounded-t-3xl sm:rounded-3xl border border-border/60 shadow-[0_-8px_40px_rgba(0,0,0,0.22)] overflow-hidden">

              {/* ── Drag handle (mobile) ──────────────────────────────────── */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1.5 rounded-full bg-border/60" />
              </div>

              {/* ── Header ───────────────────────────────────────────────── */}
              <div className="flex items-start justify-between px-5 pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl overflow-hidden border border-border/40 shadow-sm flex-shrink-0">
                    <Image
                      src="/getprofitcalc.png"
                      alt="GetProfitCalc"
                      width={44}
                      height={44}
                      className="object-cover w-full h-full"
                      priority
                    />
                  </div>
                  <div>
                    <p className="text-base font-bold text-foreground leading-tight">
                      Add to Home Screen
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Install Buy1Y1Yn your iPhone / iPad
                    </p>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  aria-label="Close installation guide"
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-muted hover:bg-muted/70 transition-colors flex-shrink-0 mt-0.5"
                >
                  <X size={14} className="text-muted-foreground" />
                </button>
              </div>

              {/* ── Divider ──────────────────────────────────────────────── */}
              <div className="h-px bg-border/40 mx-5" />

              {/* ── Steps ────────────────────────────────────────────────── */}
              <div className="px-5 py-4 space-y-4">
                {STEPS.map(({ num, Icon, title, description }) => (
                  <div key={num} className="flex gap-3.5">
                    {/* Step badge */}
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-sm mt-0.5">
                      <span className="text-[11px] font-bold text-primary-foreground">{num}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Icon size={13} className="text-primary flex-shrink-0" />
                        <p className="text-sm font-semibold text-foreground">{title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Safari hint ──────────────────────────────────────────── */}
              <div className="mx-5 mb-5 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 flex items-start gap-2.5">
                <MoreHorizontal size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  <span className="font-semibold">Note:</span> This feature requires{' '}
                  <span className="font-semibold">Safari</span>. If you're using Chrome or another
                  browser, open this page in Safari first.
                </p>
              </div>

              {/* ── Close CTA ────────────────────────────────────────────── */}
              <div className="px-5 pb-6 sm:pb-5">
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow"
                >
                  Got it
                </button>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
