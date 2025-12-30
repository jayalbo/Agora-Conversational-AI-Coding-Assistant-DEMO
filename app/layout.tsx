import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeByVoice - Voice-First Coding Assistant",
  description: "Build web applications with your voice. A voice-first coding assistant that turns your spoken ideas into working code in real-time.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
