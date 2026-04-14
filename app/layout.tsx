import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Providers } from "@/app/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pictronic Workflow",
  description: "Noir-grade AI stock production workflow: generate, curate, and upload with runtime guardrails.",
  keywords: [
    "Pictronic",
    "AI stock production",
    "Adobe Stock workflow",
    "runtime guardrails",
    "batch generation"
  ],
  openGraph: {
    title: "Pictronic Workflow",
    description: "Noir-grade AI stock production workflow with deterministic runtime controls.",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Pictronic Workflow",
    description: "Generate, curate, and upload stock assets with guarded runtime automation."
  }
};

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans"
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className={manrope.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
