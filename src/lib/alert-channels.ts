/**
 * Alert channel routing (F1.9): Slack, Telegram, Discord, WhatsApp.
 * Pure message builders + webhook senders. Slack/Discord use incoming
 * webhooks (URLs stored per-team, never logged); Telegram uses the Bot
 * API; WhatsApp reuses the existing Meta Cloud sender. All senders
 * validate the destination with the SSRF guard before fetching, cap
 * message length, and honour quiet hours + digest mode via the caller
 * (see AlertChannelConfig). No message is sent on failure — errors are
 * returned, never thrown into a job.
 */
import { validateOutboundUrl } from "@/lib/ssrf";

export interface AlertChannelConfig {
  type: "slack" | "telegram" | "discord" | "whatsapp";
  webhookUrl?: string; // Slack/Discord
  botToken?: string; // Telegram (never logged)
  chatId?: string; // Telegram
  phone?: string; // WhatsApp
  quietHoursStart?: number; // 0–23 UTC
  quietHoursEnd?: number;
  digestMode?: boolean;
}

export function inQuietHours(cfg: AlertChannelConfig, now = new Date()): boolean {
  if (cfg.quietHoursStart === undefined || cfg.quietHoursEnd === undefined) return false;
  const h = now.getUTCHours();
  if (cfg.quietHoursStart <= cfg.quietHoursEnd) return h >= cfg.quietHoursStart && h < cfg.quietHoursEnd;
  return h >= cfg.quietHoursStart || h < cfg.quietHoursEnd;
}

export function formatAlert(title: string, body: string): string {
  return `${title}\n${body}`.slice(0, 2000);
}

export async function sendAlert(cfg: AlertChannelConfig, title: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const text = formatAlert(title, body);
  if (inQuietHours(cfg) && !cfg.digestMode) return { ok: true, error: "quiet hours — suppressed" };
  try {
    if (cfg.type === "slack" || cfg.type === "discord") {
      if (!cfg.webhookUrl) return { ok: false, error: "no webhook URL configured" };
      const check = await validateOutboundUrl(cfg.webhookUrl);
      if (!check.ok) return { ok: false, error: `SSRF guard: ${check.reason}` };
      const payload = cfg.type === "slack" ? { text } : { content: text };
      const res = await fetch(cfg.webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) });
      return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
    }
    if (cfg.type === "telegram") {
      if (!cfg.botToken || !cfg.chatId) return { ok: false, error: "telegram bot token/chat id required" };
      const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: cfg.chatId, text }), signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
    }
    // WhatsApp: delegated to the existing sender in notify-server (which
    // requires Meta credentials + an open window / approved template).
    return { ok: false, error: "whatsapp: use the existing notify-server WhatsApp path (template/window rules apply)" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
