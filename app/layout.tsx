import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Description is PLAN.md section 69, the final product promise. */
const PROMISE =
  "Paste any public GitHub repository and watch it become a living 3D city. Code becomes architecture, pull requests become construction, CI becomes infrastructure, and unresolved issues leave visible scars on the world. Fly through the entire project without ever leaving one screen.";

/**
 * The hero shot committed at `docs/screenshot.png`, addressed absolutely.
 *
 * Next only serves `public/`, so `docs/` has no production URL of its own and
 * the raw GitHub URL is what actually resolves to the committed file. Link
 * previews need an absolute URL anyway, so this costs nothing and keeps a
 * second copy of the same PNG out of the repository.
 */
const OG_IMAGE = "https://raw.githubusercontent.com/Robertg761/Repo-City/main/docs/screenshot.png";

/** Alt text describes the actual committed image: the cover, with `facebook/react` as a floating city at dusk. */
const OG_ALT =
  "Repo City cover: the facebook/react repository rendered as a city on a floating block of earth at dusk, with the title Repo City and the line \"Live in your GitHub repo.\"";

export const metadata: Metadata = {
  metadataBase: new URL("https://repo-city-five.vercel.app"),
  title: "Repo City",
  description: PROMISE,
  openGraph: {
    title: "Repo City",
    description: PROMISE,
    type: "website",
    url: "https://repo-city-five.vercel.app",
    siteName: "Repo City",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 675,
        alt: OG_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Repo City",
    description: PROMISE,
    images: [OG_IMAGE],
  },
};

export const viewport: Viewport = {
  themeColor: "#b9d4e6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-[#0d1114] font-sans text-white">
        {children}
      </body>
    </html>
  );
}
