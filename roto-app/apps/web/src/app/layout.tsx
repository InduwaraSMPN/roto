import type { Metadata } from "next";
import { Noto_Sans_Sinhala, Noto_Sans_Tamil, Overpass } from "next/font/google";

import "../index.css";
import Header from "@/components/header";
import Providers from "@/components/providers";
import PwaRegistration from "@/components/pwa-registration";

// Overpass is the open descendant of Highway Gothic, the road-sign face.
const overpass = Overpass({
  variable: "--font-overpass",
  subsets: ["latin"],
});

const sinhala = Noto_Sans_Sinhala({
  variable: "--font-sinhala",
  subsets: ["sinhala"],
});

const tamil = Noto_Sans_Tamil({
  variable: "--font-tamil",
  subsets: ["tamil"],
});

export const metadata: Metadata = {
  title: {
    default: "Roto — offline-first motorcycle routes for Sri Lanka",
    template: "%s · Roto",
  },
  description:
    "Curvy LK routes, GPX in and out, crash alerts, live group rides. Free forever, no tracking. English / සිංහල / தமிழ்.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${overpass.variable} ${sinhala.variable} ${tamil.variable}`}
    >
      <body className="antialiased">
        <PwaRegistration />

        <Providers>
          <div className="grid min-h-svh grid-rows-[auto_1fr]">
            <Header />
            <main>{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
