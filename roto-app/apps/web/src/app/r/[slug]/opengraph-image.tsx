// Route share card. ImageResponse from next/og (confirmed in Next 16 docs).
// ponytail: no server fetch here — OG images render at build time when the backend may
// be unreachable, so the card is branded but data-free. The slug names the route.
import { ImageResponse } from "next/og";

export const alt = "Roto shared motorcycle route";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = decodeURIComponent(slug).slice(0, 60);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#0E1318",
          color: "#F2EFE6",
          fontSize: 64,
          fontWeight: 800,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#FFB300" }} />
          <div style={{ fontSize: 40, letterSpacing: 2 }}>ROTO</div>
        </div>
        <div style={{ marginTop: 32, lineHeight: 1.1 }}>{name}</div>
        <div style={{ marginTop: 16, fontSize: 28, fontWeight: 400, color: "#8A94A0" }}>
          Curvy LK motorcycle route · Free offline GPX
        </div>
      </div>
    ),
    { ...size },
  );
}
