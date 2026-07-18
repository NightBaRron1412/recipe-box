import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HAT =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
  "<path d='M20 34.5A8 8 0 0 1 23 20a10 10 0 0 1 2.2-3 10 10 0 0 1 13.6 0A10 10 0 0 1 41 20a8 8 0 0 1 3 14.5V46H20z' fill='%23e8734d'/>" +
  "<rect x='20' y='39' width='24' height='7' rx='2' fill='%23e8734d'/>" +
  "</svg>";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          background: "linear-gradient(135deg,#e8734d,#b74a29)",
          color: "#fff",
        }}
      >
        <div
          style={{
            width: 200,
            height: 200,
            borderRadius: 44,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={"data:image/svg+xml," + encodeURIComponent(HAT)} width={130} height={130} alt="" />
        </div>
        <div style={{ fontSize: 82, fontWeight: 700, letterSpacing: -1 }}>Recipe Box</div>
        <div style={{ fontSize: 34, opacity: 0.92 }}>recipes.amirshetaia.com</div>
      </div>
    ),
    { ...size }
  );
}
