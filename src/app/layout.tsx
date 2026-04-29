import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import ThemeProvider from "@/components/theme-provider";
import "./globals.css";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600", "700"],
});

const displayFont = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const codeFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-code",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "CodeCollab",
  description: "Build software with your friends. Radically simple collaborative vibe coding.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable} ${codeFont.variable} bg-void text-text antialiased`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
