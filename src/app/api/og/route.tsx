import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") ?? "CalcProfit";
  const subtitle = searchParams.get("subtitle") ?? "Free Profit & ROI Calculators";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          padding: "60px 72px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Logo / Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 48 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "#22c55e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}
          >
            📊
          </div>
          <span style={{ fontSize: 28, fontWeight: 700, color: "#f8fafc" }}>
            Profit<span style={{ color: "#22c55e" }}>Calc</span>
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <p
            style={{
              fontSize: title.length > 50 ? 44 : 56,
              fontWeight: 800,
              color: "#f8fafc",
              lineHeight: 1.15,
              margin: "0 0 20px 0",
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </p>
          <p style={{ fontSize: 24, color: "#94a3b8", margin: 0, fontWeight: 400 }}>
            {subtitle}
          </p>
        </div>

        {/* Footer bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 28,
            borderTop: "1px solid #334155",
            marginTop: 32,
          }}
        >
          <span style={{ color: "#64748b", fontSize: 18 }}>profitcalc.io</span>
          <div
            style={{
              background: "#22c55e",
              color: "white",
              padding: "8px 20px",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Free · No Sign-up
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
