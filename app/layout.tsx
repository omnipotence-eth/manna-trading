import type { Metadata } from "next";
import "./globals.css";
import { StartupInitializer } from "@/components/StartupInitializer";

export const metadata: Metadata = {
  title: "Manna AI Arena - Decentralized AI Trading Competition",
  description: "AI models compete in real-time trading on Aster DEX",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <StartupInitializer />
        {children}
      </body>
    </html>
  );
}

