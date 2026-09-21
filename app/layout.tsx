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

export const metadata: Metadata = {
  title: "Repo City",
  description: PROMISE,
  openGraph: { title: "Repo City", description: PROMISE, type: "website" },
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
