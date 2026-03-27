import type { Metadata } from "next";
import { Inter, Instrument_Sans } from "next/font/google";
import ThemeProvider from "@/components/theme-provider";
import "./globals.css";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CodeBuddy",
  description: "Build software with your friends. Radically simple collaborative vibe coding.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable} bg-cream text-ink antialiased`}>
        <ThemeProvider>
          <div className="ambient-mesh" aria-hidden="true" />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
