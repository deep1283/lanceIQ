import type { Metadata } from "next";
import { Geist, Geist_Mono, Merriweather } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const merriweather = Merriweather({
  variable: "--font-merriweather",
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.lanceiq.com'),
  title: {
    default: "LanceIQ – Professional Webhook Delivery Certificates",
    template: "%s | LanceIQ"
  },
  description: "Turn ephemeral webhook events into permanent, verifiable PDF records. The standard for webhook documentation and compliance.",
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.lanceiq.com',
    siteName: 'LanceIQ',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'LanceIQ - Webhook Proof',
      },
    ],
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
        className={`${geistSans.variable} ${geistMono.variable} ${merriweather.variable} antialiased font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
