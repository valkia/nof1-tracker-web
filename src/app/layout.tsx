import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nof1 Tracker Web",
  description: "Next.js dashboard for monitoring Nof1 AI trading agents.",
};

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "700"],
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full touch-manipulation">
      <body
        className={`${inter.variable} ${robotoMono.variable} min-h-full bg-surface-50 font-sans text-surface-600`}
      >
        {children}
      </body>
    </html>
  );
}
