import { Resend } from "resend";
import { logger } from "@/lib/logger";

const FROM = process.env.EMAIL_FROM ?? "GetProfitCalc <onboarding@resend.dev>";

/** Lazily constructed — module import must never throw when the env var is missing (build time). */
let resend: Resend | null = null;
function getResend(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
    resend = new Resend(apiKey);
  }
  return resend;
}

/** Throws if Resend returns an error so callers get a real exception. */
async function sendEmail(payload: Parameters<Resend["emails"]["send"]>[0]) {
  const { data, error } = await getResend().emails.send(payload);
  if (error) {
    logger.error("[Resend] send error", new Error(error.message ?? "Failed to send email"));
    throw new Error(error.message ?? "Failed to send email");
  }
  return data;
}

export async function sendWelcomeEmail(to: string, name: string) {
  return sendEmail({
    from: FROM,
    to,
    subject: "Welcome to GetProfitCalc 🎉",
    html: `
      <h2>Welcome, ${name}!</h2>
      <p>Your 14-day free trial has started. No credit card required.</p>
      <p>Get started by connecting your first store:</p>
      <a href="${process.env.NEXT_PUBLIC_SITE_URL}/onboarding" style="
        display:inline-block;background:#22c55e;color:#fff;
        padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;
      ">Connect Your Store</a>
      <p style="color:#64748b;font-size:12px;margin-top:32px;">
        Need help? Reply to this email — we respond within 24 hours.
      </p>
    `,
  });
}

export async function sendGoalAlertEmail(
  to: string,
  name: string,
  month: string,
  currentProfit: number,
  targetProfit: number,
  progressPercent: number
) {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return sendEmail({
    from: FROM,
    to,
    subject: `⚠️ Profit Alert: You're at ${progressPercent.toFixed(0)}% of your ${month} goal`,
    html: `
      <h2>Profit Goal Alert</h2>
      <p>Hi ${name},</p>
      <p>Your profit for <strong>${month}</strong> is currently 
        <strong>${formatter.format(currentProfit)}</strong>, 
        which is <strong>${progressPercent.toFixed(0)}%</strong> of your 
        ${formatter.format(targetProfit)} target.
      </p>
      <p>Review your dashboard to identify what's pulling your margin down.</p>
      <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/goals" style="
        display:inline-block;background:#22c55e;color:#fff;
        padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;
      ">View Goal Dashboard</a>
    `,
  });
}

export async function sendProfitReportEmail(
  to: string,
  teamName: string,
  periodLabel: string,
  metrics: { revenue: number; netProfit: number; netMargin: number; orderCount: number; aov: number; roas: number; rtoRate: number }
) {
  const f = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sendEmail({
    from: FROM,
    to,
    subject: `Profit report (${periodLabel}): ${f(metrics.netProfit)} net profit`,
    html: `
      <h2>Profit report — ${teamName}</h2>
      <p>Period: <strong>${periodLabel}</strong></p>
      <table>
        <tr><td>Revenue</td><td><strong>${f(metrics.revenue)}</strong></td></tr>
        <tr><td>Net profit</td><td><strong>${f(metrics.netProfit)}</strong></td></tr>
        <tr><td>Margin</td><td><strong>${metrics.netMargin}%</strong></td></tr>
        <tr><td>Orders</td><td><strong>${metrics.orderCount}</strong></td></tr>
        <tr><td>AOV</td><td><strong>${f(metrics.aov)}</strong></td></tr>
        <tr><td>ROAS</td><td><strong>${metrics.roas}x</strong></td></tr>
        <tr><td>RTO rate</td><td><strong>${metrics.rtoRate}%</strong></td></tr>
      </table>
      <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/profit">View the full True Profit dashboard</a></p>
    `,
  });
}

/**
 * Scheduled report delivery: period summary email with a real
 * attachment — CSV text for csv reports, or a generated PDF for pdf
 * reports (jsPDF, server-side). Attachment content is built from the
 * same totals the email body shows, so body and file cannot diverge.
 */
export async function sendScheduledReportEmail(
  to: string,
  periodLabel: string,
  metrics: { revenue: number; netProfit: number; netMargin: number; orderCount: number; aov: number },
  format: "csv" | "pdf",
) {
  const f = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const csv = [
    "metric,value",
    `revenue,${metrics.revenue}`,
    `netProfit,${metrics.netProfit}`,
    `netMargin,${metrics.netMargin}`,
    `orders,${metrics.orderCount}`,
    `aov,${metrics.aov}`,
  ].join("\n");
  let attachment: { filename: string; content: string } | null = null;
  if (format === "csv") {
    attachment = { filename: `profit-report-${periodLabel}.csv`, content: Buffer.from(csv, "utf8").toString("base64") };
  } else {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("GetProfitCalc — Profit Report", 14, 20);
    doc.setFontSize(11);
    doc.text(`Period: ${periodLabel}`, 14, 30);
    doc.text(`Revenue: ${f(metrics.revenue)}`, 14, 42);
    doc.text(`Net profit: ${f(metrics.netProfit)}`, 14, 52);
    doc.text(`Net margin: ${metrics.netMargin}%`, 14, 62);
    doc.text(`Orders: ${metrics.orderCount}`, 14, 72);
    doc.text(`AOV: ${f(metrics.aov)}`, 14, 82);
    const pdf = doc.output("arraybuffer");
    attachment = { filename: `profit-report-${periodLabel}.pdf`, content: Buffer.from(pdf).toString("base64") };
  }
  return sendEmail({
    from: FROM,
    to,
    subject: `Profit report (${periodLabel}): ${f(metrics.netProfit)} net profit`,
    html: `<p>Profit report for ${periodLabel}: revenue ${f(metrics.revenue)}, net profit ${f(metrics.netProfit)} (${metrics.netMargin}%), ${metrics.orderCount} orders, AOV ${f(metrics.aov)}. Full numbers are in the attached ${format.toUpperCase()}.</p>`,
    attachments: attachment ? [attachment] : undefined,
  });
}

export async function sendTeamInviteEmail(
  to: string,
  inviterName: string,
  teamName: string,
  inviteToken: string
) {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/accept-invite?token=${inviteToken}`;
  return sendEmail({
    from: FROM,
    to,
    subject: `${inviterName} invited you to join ${teamName} on GetProfitCalc`,
    html: `
      <h2>You're invited!</h2>
      <p><strong>${inviterName}</strong> has invited you to join 
        <strong>${teamName}</strong> on GetProfitCalc.
      </p>
      <a href="${url}" style="
        display:inline-block;background:#22c55e;color:#fff;
        padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;
      ">Accept Invitation</a>
      <p style="color:#64748b;font-size:12px;margin-top:16px;">
        This invitation expires in 48 hours.
      </p>
    `,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetToken: string
) {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password?token=${resetToken}`;
  return sendEmail({
    from: FROM,
    to,
    subject: "Reset your GetProfitCalc password",
    html: `
      <h2>Password Reset Request</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset your password. Click the button below to choose a new one:</p>
      <a href="${url}" style="
        display:inline-block;background:#22c55e;color:#fff;
        padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;
      ">Reset Password</a>
      <p style="color:#64748b;font-size:13px;margin-top:16px;">
        This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.
      </p>
      <p style="color:#64748b;font-size:12px;margin-top:8px;">
        Or copy this URL into your browser:<br/>
        <a href="${url}" style="color:#22c55e;word-break:break-all;">${url}</a>
      </p>
    `,
  });
}

export async function sendDunningEmail(
  to: string,
  name: string,
  plan: string,
  attempt: number
) {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?tab=billing`;
  const isFinal = attempt >= 3;
  return sendEmail({
    from: FROM,
    to,
    subject: isFinal
      ? "Action required: your GetProfitCalc subscription will be paused"
      : "Payment failed — please update your payment method",
    html: `
      <h2>${isFinal ? "Final notice" : "Payment failed"}</h2>
      <p>Hi ${name},</p>
      <p>We couldn't process the payment for your GetProfitCalc <strong>${plan}</strong> plan.</p>
      <p>Please update your payment method to avoid interruption:</p>
      <a href="${url}" style="
        display:inline-block;background:#22c55e;color:#fff;
        padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;
      ">Update Payment Method</a>
      <p style="color:#64748b;font-size:13px;margin-top:16px;">
        ${isFinal
          ? "This is our final reminder. Your subscription will be paused if payment isn't received soon."
          : "We'll retry automatically. You can update your card anytime from billing settings."}
      </p>
    `,
  });
}

export async function sendVerificationEmail(to: string, name: string, verifyToken: string) {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/verify-email?token=${verifyToken}`;
  return sendEmail({
    from: FROM,
    to,
    subject: "Verify your GetProfitCalc email",
    html: `
      <h2>Verify your email</h2>
      <p>Hi ${name},</p>
      <p>Please confirm your email address to finish setting up your account:</p>
      <a href="${url}" style="
        display:inline-block;background:#22c55e;color:#fff;
        padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;
      ">Verify Email</a>
      <p style="color:#64748b;font-size:13px;margin-top:16px;">
        This link expires in <strong>24 hours</strong>. If you didn't create an account, you can safely ignore this email.
      </p>
    `,
  });
}

/** Escape HTML so a plain-text order message renders safely as email. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Phase 9a: generic order-notification email (WhatsApp fallback /
 * email channel). The subject/body come from whatsapp.ts templates;
 * this function only delivers them via Resend.
 */
export async function sendOrderNotificationEmail(to: string, subject: string, body: string) {
  return sendEmail({
    from: FROM,
    to,
    subject,
    html: `<p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p>`,
  });
}
