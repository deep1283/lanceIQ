import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL('https://lanceiq.com'),
  alternates: {
    canonical: 'https://lanceiq.com',
  },
  title: {
    default: "LanceIQ – Professional Webhook Delivery Certificates",
    template: "%s | LanceIQ"
  },
  description: "Turn ephemeral webhook events into long-lived, verifiable PDF records. Designed for webhook documentation and compliance workflows.",
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://lanceiq.com',
    siteName: 'LanceIQ',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LanceIQ – Webhook Documentation & Proof',
    description: 'Generate professional PDF certificates for your webhooks instantly.',
    creator: '@lanceiq',
  },
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased font-sans"
      >
        {children}
      </body>
    </html>
  );
}
