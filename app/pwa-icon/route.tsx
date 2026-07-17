import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET(req: Request) {
  const size = Math.min(
    512,
    Math.max(48, Number(new URL(req.url).searchParams.get("size") || "512"))
  );
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg,#d9613b,#b74a29)",
        }}
      >
        <div style={{ fontSize: size * 0.58, display: "flex" }}>🍽️</div>
      </div>
    ),
    { width: size, height: size, emoji: "twemoji" }
  );
}
