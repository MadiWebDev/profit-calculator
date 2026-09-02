'use client';

import { useEffect, useState } from 'react';

export function InitialPreloaderClient() {
    const [show, setShow] = useState(true);
    const [opacity, setOpacity] = useState(1);
    const [isOffline, setIsOffline] = useState(false);
    const [isTakingTooLong, setIsTakingTooLong] = useState(false);

    useEffect(() => {
        // Check internet connection
        if (typeof window !== 'undefined') {
            setIsOffline(!navigator.onLine);
            const handleOffline = () => setIsOffline(true);
            const handleOnline = () => setIsOffline(false);
            window.addEventListener('offline', handleOffline);
            window.addEventListener('online', handleOnline);

            // Force hide after 5 seconds if still showing (fallback for blocked hydration)
            const fallbackTimer = setTimeout(() => {
                setIsTakingTooLong(true);
            }, 3000);

            // Start fade out after hydration (normal case)
            const fadeTimer = setTimeout(() => {
                setOpacity(0);
            }, 500);

            // Completely unmount after transition
            const removeTimer = setTimeout(() => {
                setShow(false);
            }, 1000);

            return () => {
                window.removeEventListener('offline', handleOffline);
                window.removeEventListener('online', handleOnline);
                clearTimeout(fadeTimer);
                clearTimeout(removeTimer);
                clearTimeout(fallbackTimer);
            };
        }
    }, []);

    if (!show) return null;

    return (
        <div
            id="initial-preloader"
            style={{
                opacity,
                transition: 'opacity 0.5s ease-out',
                pointerEvents: opacity === 0 ? 'none' : 'auto',
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'white', // Default white, will be overridden by dark mode styles
            }}
        >
            <div className="flex flex-col items-center max-w-xs text-center px-4">
                <img
                    src="/logocopy.webp"
                    alt="Loading..."
                    style={{
                        width: '128px',
                        height: '128px',
                        marginBottom: '2rem',
                    }}
                />

                <div
                    className="loader"
                    style={{
                        width: '192px',
                        height: '3px',
                        background: '#fce7f3',
                        borderRadius: '9999px',
                        overflow: 'hidden',
                        position: 'relative',
                        marginBottom: '1.5rem'
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(to right, transparent, #d4a373, transparent)',
                            animation: 'slide 1.5s cubic-bezier(0.65, 0.05, 0.36, 1) infinite',
                            boxShadow: '0 0 10px #d4a373'
                        }}
                    />
                </div>

                {(isOffline || isTakingTooLong) && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <p className="text-sm font-medium text-destructive mb-2">
                            {isOffline ? "No Internet Connection" : "Connection is slow"}
                        </p>
                        <p className="text-xs text-muted-foreground mb-4">
                            {isOffline
                                ? "Please check your network settings. The site will continue as soon as you're back online."
                                : "We're having trouble connecting to the server. Hang tight!"}
                        </p>
                        <button
                            onClick={() => setShow(false)}
                            className="text-xs px-4 py-2 rounded-full border border-border hover:bg-accent transition-colors"
                        >
                            Continue Anyway
                        </button>
                    </div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes slide {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @media (prefers-color-scheme: dark) {
                    #initial-preloader { background: #0b0408 !important; }
                    #initial-preloader .loader { background: rgba(219, 39, 119, 0.2) !important; }
                }
            `}} />
        </div>
    );
}
