import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? "CalcProfit <onboarding@resend.dev>";

/** Throws if Resend returns an error so callers get a real exception. */
async function sendEmail(payload: Parameters<typeof resend.emails.send>[0]) {
  const { data, error } = await resend.emails.send(payload);
  if (error) {
    console.error("[Resend] send error:", error);
    throw new Error(error.message ?? "Failed to send email");
  }
  return data;
}

export async function sendWelcomeEmail(to: string, name: string) {
  return sendEmail({
    from: FROM,
    to,
    subject: "Welcome to CalcProfit 🎉",
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
    subject: `${inviterName} invited you to join ${teamName} on CalcProfit`,
    html: `
      <h2>You're invited!</h2>
      <p><strong>${inviterName}</strong> has invited you to join 
        <strong>${teamName}</strong> on CalcProfit.
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
    subject: "Reset your CalcProfit password",
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
