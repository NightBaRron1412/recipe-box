import type { Metadata, Viewport } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "./SW";
import { ToastHost } from "./Toast";

const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://recipes.amirshetaia.com"),
  title: "كتاب وصفات أمير",
  description: "وصفاتي المحفوظة من انستغرام وفيسبوك",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "كتاب وصفات أمير",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "كتاب وصفات أمير",
    description: "وصفاتي المحفوظة من انستغرام وفيسبوك",
    type: "website",
    locale: "ar_AR",
  },
  twitter: {
    card: "summary_large_image",
    title: "كتاب وصفات أمير",
    description: "وصفاتي المحفوظة من انستغرام وفيسبوك",
  },
};

export const viewport: Viewport = {
  themeColor: "#d9613b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        {/* Applies saved/system theme before paint to avoid a flash. */}
        <script src="/theme-init.js" />
      </head>
      <body className={tajawal.className}>
        {children}
        <ToastHost />
        <RegisterSW />
      </body>
    </html>
  );
}
