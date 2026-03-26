import type { Metadata } from "next";
import { Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading"
});

const bodyFont = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: "PostPort",
  description: "Media library and social publishing workspace"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${headingFont.variable} ${bodyFont.variable} font-[var(--font-body)]`}>{children}</body>
    </html>
  );
}
