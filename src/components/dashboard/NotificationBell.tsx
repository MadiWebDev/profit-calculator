"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, CheckCheck, Trash2, X, AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Notification {
  _id: string;
  type: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "error" | "success";
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  createdAt: string;
}

const severityIcon = {
  info:    <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />,
  error:   <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />,
  success: <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />,
};

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const json = await res.json();
      setNotifications(json.notifications ?? []);
      setUnreadCount(json.unreadCount ?? 0);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll every 60s
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = async () => {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAllRead: true }) });
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
  };

  const markRead = async (id: string) => {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
    setNotifications((n) => n.map((x) => x._id === id ? { ...x, read: true } : x));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const deleteNotif = async (id: string) => {
    await fetch(`/api/notifications?id=${id}`, { method: "DELETE" });
    setNotifications((n) => n.filter((x) => x._id !== id));
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(!open); if (!open) fetchNotifications(); }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--color-muted)] transition-colors text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 sm:w-96 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <p className="font-semibold text-sm text-[var(--color-foreground)]">
              Notifications {unreadCount > 0 && <span className="ml-1 text-xs text-[var(--color-primary)]">({unreadCount} new)</span>}
            </p>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline px-2 py-1 rounded hover:bg-[var(--color-muted)]">
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="h-8 w-8 mx-auto mb-2 text-[var(--color-border)]" />
                <p className="text-sm text-[var(--color-muted-foreground)]">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n._id}
                  className={cn(
                    "flex gap-3 px-4 py-3 border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)]/50 group transition-colors cursor-pointer",
                    !n.read && "bg-[var(--color-primary)]/5"
                  )}
                  onClick={() => !n.read && markRead(n._id)}
                >
                  {severityIcon[n.severity]}
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm leading-snug", !n.read ? "font-semibold text-[var(--color-foreground)]" : "text-[var(--color-muted-foreground)]")}>
                      {n.title}
                    </p>
                    <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed mt-0.5 line-clamp-2">{n.body}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] text-[var(--color-muted-foreground)]">{timeAgo(n.createdAt)}</span>
                      {n.actionUrl && (
                        <Link href={n.actionUrl} onClick={() => setOpen(false)} className="text-[10px] text-[var(--color-primary)] hover:underline">
                          {n.actionLabel ?? "View →"}
                        </Link>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteNotif(n._id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)] transition-opacity flex-shrink-0"
                    aria-label="Delete notification"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
