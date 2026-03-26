import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FeedClass QR Badge Scanner",
  description: "Scan QR badges and validate them against a MySQL-backed roster.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
