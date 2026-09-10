import type { ReactNode } from "react";
import { headers } from "next/headers";

import { Backdrop } from "@/components/shared/Backdrop";
import { AppNav } from "@/components/shared/AppNav";
import { AppProviders } from "@/providers/AppProviders";
import { Chakra_Petch, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";

import "./globals.css";

const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-chakra",
});

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
});

export const metadata = {
  title: "RIPTIDE",
  description: "Internalize LVR with volatility-indexed fees and resolver rebalancing auctions",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headersList = await headers();
  const cookies = headersList.get("cookie");

  return (
    <html lang="en" className={`${chakra.variable} ${plex.variable} ${jetbrains.variable}`}>
      <body>
        <AppProviders cookies={cookies}>
          <div className="app-shell">
            <Backdrop />
            <AppNav />
            <main className="app-main">{children}</main>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
