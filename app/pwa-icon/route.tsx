import { ImageResponse } from "next/og";

export const runtime = "edge";

const HAT =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
  "<path d='M20 34.5A8 8 0 0 1 23 20a10 10 0 0 1 2.2-3 10 10 0 0 1 13.6 0A10 10 0 0 1 41 20a8 8 0 0 1 3 14.5V46H20z' fill='white'/>" +
  "<rect x='20' y='39' width='24' height='7' rx='2' fill='white'/>" +
  "<line x1='24' y1='42.5' x2='40' y2='42.5' stroke='%23c9542f' stroke-width='2' stroke-linecap='round'/>" +
  "</svg>";

export function GET(req: Request) {
  const size = Math.min(
    512,
    Math.max(48, Number(new URL(req.url).searchParams.get("size") || "512"))
  );
  const img = size * 0.64;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg,#e8734d,#b74a29)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={"data:image/svg+xml," + encodeURIComponent(HAT)} width={img} height={img} alt="" />
      </div>
    ),
    { width: size, height: size }
  );
}
