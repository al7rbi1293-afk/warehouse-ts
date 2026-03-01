import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import "handsontable/dist/handsontable.full.min.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "sonner";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getSiteUrl } from "@/lib/siteUrl";

const siteUrl = getSiteUrl();

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "NSTC Management",
  description: "NSTC Project Management Application",
  openGraph: {
    title: "NSTC Management",
    description: "NSTC Project Management Application",
    url: siteUrl,
    siteName: "NSTC Management",
    locale: "en_US",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <body className={`${cairo.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <SpeedInsights />
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
