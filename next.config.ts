import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy
 * - 'unsafe-eval' and 'unsafe-inline' removed in production
 * - Recharts uses inline styles, so style-src needs 'unsafe-inline'
 * - Next.js image optimisation serves from /_next/image
 */
const cspDirectives = [
  "default-src 'self'",
  // Scripts: allow self + Next.js inline bootstrap in dev only
  isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline'",                   // Next.js RSC needs inline
  // Styles: Recharts and Tailwind both inject inline styles
  "style-src 'self' 'unsafe-inline'",
  // Images: self + data URIs + remote CDNs used by the app
  "img-src 'self' data: blob: https://*.shopify.com https://*.cloudinary.com https://lh3.googleusercontent.com",
  // Fonts
  "font-src 'self' data:",
  // Fetch / XHR: self + external APIs the client calls directly
  "connect-src 'self' https://api.openai.com https://api.resend.com",
  // Iframes — block entirely
  "frame-src 'none'",
  // Objects / embeds
  "object-src 'none'",
  // Upgrade insecure requests in production
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
  // Base URI restriction
  "base-uri 'self'",
  // Form actions restricted to self
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  // HSTS — only meaningful in production with HTTPS
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
];

const nextConfig: NextConfig = {
  // reactCompiler disabled — it breaks custom hooks with closures (toggle function)
  // reactCompiler: true,

  // Mongoose and bcryptjs use Node.js internals — must not be bundled by webpack.
  // Required for NextAuth v5 credentials provider + Mongoose to work in server routes.
  serverExternalPackages: ["mongoose", "bcryptjs", "resend"],

  // Allow images from common ecommerce/CDN domains
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.shopify.com" },
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },

  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Billing webhook must stay public — no CSP needed, no framing risk
        source: "/api/billing/webhook",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
