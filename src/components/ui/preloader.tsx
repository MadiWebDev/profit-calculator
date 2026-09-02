'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

export const Preloader = ({ persistent = true }: { persistent?: boolean }) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // If NOT persistent, auto-hide after a tiny delay
    if (!persistent) {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 10);

      const emergencyTimer = setTimeout(() => {
        const el = document.getElementById('main-preloader');
        if (el) el.style.opacity = '0';
        setTimeout(() => {
          if (el) el.style.display = 'none';
        }, 300);
      }, 2000);

      return () => {
        clearTimeout(timer);
        clearTimeout(emergencyTimer);
      };
    }

    // For persistent loaders (like loading.tsx), only have a long safety timeout
    const safetyTimer = setTimeout(() => {
      const el = document.getElementById('main-preloader');
      if (el) el.style.opacity = '0';
      setTimeout(() => {
        if (el) el.style.display = 'none';
      }, 300);
    }, 8000);

    return () => clearTimeout(safetyTimer);
  }, [persistent]);

  return (
    <AnimatePresence mode="wait">
      {isLoading && (
        <motion.div
          id="main-preloader"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            transition: { duration: 0.4, ease: "easeInOut" }
          }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background pointer-events-none"
        >
          <div className="relative flex flex-col items-center">
            {/* Logo Animation */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{
                scale: 1,
                opacity: 1,
              }}
              transition={{
                duration: 0.4,
                ease: "easeOut",
              }}
              className="relative w-32 h-32 md:w-40 md:h-40 mb-8"
            >
              <Image
                src="/logocopy.webp"
                alt="Logo"
                fill
                className="object-contain"
                priority
                unoptimized
              />
            </motion.div>

            {/* Premium Loading Indicator */}
            <div className="w-40 h-[2px] bg-primary/10 overflow-hidden rounded-full">
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="w-full h-full bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_8px_hsl(var(--primary))]"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
