import type { Metadata } from "next";
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import "./globals.css";
import { StartupInitializer } from "@/components/StartupInitializer";

export const metadata: Metadata = {
  title: "Manna AI | Autonomous Trading System",
  description: "AI-powered autonomous trading on Aster DEX",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <StartupInitializer />
        {children}
      </body>
    </html>
  );
}
