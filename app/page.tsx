import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';

const Features = dynamic(() => import('../components/Features'));
const HowItWorks = dynamic(() => import('../components/HowItWorks'));
const Trust = dynamic(() => import('../components/Trust'));
const FAQ = dynamic(() => import('../components/FAQ'));
const BlogPreview = dynamic(() => import('../components/BlogPreview'));
const Footer = dynamic(() => import('../components/Footer'));

export const metadata: Metadata = {
  title: 'LanceIQ – Webhook Delivery Proof & Verification Certificates',
  description: 'Generate verifiable PDF certificates for webhook events with hashes, optional signature checks, and QR-based proof links. Built for audits, disputes, and client reporting.',
  keywords: 'webhook proof, webhook delivery certificate, signature verification, audit trail, webhook pdf generator, stripe webhook proof, api event documentation',
  openGraph: {
    title: 'LanceIQ – Webhook Proof & Verification',
    description: 'Turn webhook events into permanent, verifiable PDF records with hashes, signature checks, and proof links.',
    type: 'website',
  },
};

export default function Home() {
  return (
    <main className="flex flex-col bg-black min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "LanceIQ",
            "applicationCategory": "DeveloperApplication",
            "operatingSystem": "Web",
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD",
              "description": "Free tier available. Paid plans remove watermarks."
            },
            "description": "Generate verifiable PDF certificates for webhook events with hashes, optional signature checks, and proof links."
          })
        }}
      />
      <Navbar />
      <Hero />
      <HowItWorks />
      <Features />
      <Trust />
      <BlogPreview />
      <FAQ />
      <Footer />
    </main>
  );
}
