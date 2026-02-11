import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';

const Features = dynamic(() => import('../components/Features'));
const HowItWorks = dynamic(() => import('../components/HowItWorks'));
const SampleCertificate = dynamic(() => import('../components/SampleCertificate'));
const Trust = dynamic(() => import('../components/Trust'));
const FAQ = dynamic(() => import('../components/FAQ'));
const BlogPreview = dynamic(() => import('../components/BlogPreview'));
const Footer = dynamic(() => import('../components/Footer'));

export const metadata: Metadata = {
  title: 'LanceIQ – Webhook Delivery Certificates & Verification',
  description: 'Generate PDF certificates for webhook events with hashes, optional signature checks, and QR-based verification links. Designed for audits, disputes, and client reporting.',
  keywords: 'webhook delivery certificate, signature verification, audit trail, webhook pdf generator, stripe webhook verification, api event documentation',
  openGraph: {
    title: 'LanceIQ – Webhook Certificates & Verification',
    description: 'Turn webhook events into verifiable PDF records with hashes, signature checks, and verification links.',
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
            "description": "Generate PDF certificates for webhook events with hashes, optional signature checks, and verification links."
          })
        }}
      />
      <Navbar />
      <Hero />
      <SampleCertificate />
      <HowItWorks />
      <Features />
      <Trust />
      <BlogPreview />
      <FAQ />
      <Footer />
    </main>
  );
}
