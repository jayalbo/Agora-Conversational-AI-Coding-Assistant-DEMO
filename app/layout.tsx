import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agora Conversational AI Demo",
  description: "Talk to AI and see code generated in real-time",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
