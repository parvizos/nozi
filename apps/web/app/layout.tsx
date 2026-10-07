import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "NOZI — подарки с доставкой в Душанбе",
    template: "%s · NOZI",
  },
  description:
    "Цветы, подарки и сладости от лучших магазинов Душанбе с бережной доставкой.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
