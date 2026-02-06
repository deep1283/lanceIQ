import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "64px 80px",
          background:
            "linear-gradient(135deg, #0b0b0f 0%, #0f172a 50%, #111827 100%)",
          color: "#ffffff",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            marginBottom: 16,
          }}
        >
          LanceIQ
        </div>
        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          Webhook delivery records you can trust
        </div>
        <div
          style={{
            fontSize: 24,
            color: "#cbd5f5",
            marginTop: 18,
            maxWidth: 900,
          }}
        >
          PDF certificates with hashes and optional signature checks.
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 20,
            color: "#e2e8f0",
            border: "1px solid rgba(148, 163, 184, 0.4)",
            borderRadius: 9999,
            padding: "8px 14px",
            width: "fit-content",
            background: "rgba(15, 23, 42, 0.6)",
          }}
        >
          lanceiq.com
        </div>
      </div>
    ),
    size
  );
}
