import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Roto — offline-first motorcycle routes for Sri Lanka",
    short_name: "Roto",
    description:
      "Curvy LK routes, GPX in and out, crash alerts, live group rides. Free forever, no tracking.",
    start_url: "/",
    display: "standalone",
    background_color: "#0E1318",
    theme_color: "#FFB300",
    lang: "en",
    icons: [
      {
        src: "/favicon/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
