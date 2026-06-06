import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Assistant",
  description: "An AI-driven, multi-user financial companion.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
