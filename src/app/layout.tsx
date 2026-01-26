import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "sonner";
import { SpeedInsights } from "@vercel/speed-insights/next";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
});

export const metadata: Metadata = {
  title: "NSTC Management",
  description: "NSTC Project Management Application",
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
