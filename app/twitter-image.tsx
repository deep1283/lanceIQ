import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = {
  width: 1200,
  height: 600,
};
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "56px 72px",
          background:
            "linear-gradient(135deg, #0b0b0f 0%, #0f172a 50%, #111827 100%)",
          color: "#ffffff",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            marginBottom: 12,
          }}
        >
          LanceIQ
        </div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 700,
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          Webhook delivery proof you can trust
        </div>
        <div
          style={{
            fontSize: 22,
            color: "#cbd5f5",
            marginTop: 16,
            maxWidth: 900,
          }}
        >
          Verifiable PDF certificates with hashes and optional signature checks.
        </div>
      </div>
    ),
    size
  );
}
