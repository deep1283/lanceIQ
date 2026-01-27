import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';

const Features = dynamic(() => import('../components/Features'));
const FAQ = dynamic(() => import('../components/FAQ'));
const BlogPreview = dynamic(() => import('../components/BlogPreview'));
const Footer = dynamic(() => import('../components/Footer'));

export const metadata: Metadata = {
  title: 'LanceIQ – Professional Webhook Delivery Certificates & API Proof',
  description: 'Generate verify-ready PDF certificates for your webhooks. Document API events from Stripe, PayPal, and more with LanceIQ. Essential for compliance, disputes, and client reporting.',
  keywords: 'webhook proof, connection certificate, API documentation, stripe signature verification tool, paypal webhook logs, compliance audit tools, webhook pdf generator',
  openGraph: {
    title: 'LanceIQ – Webhook Verification & Documentation',
    description: 'Turn ephemeral webhooks into permanent, professional PDF records. trusted by developers for compliance and client transparency.',
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
              "priceCurrency": "USD"
            },
            "description": "Generate verifiable, professional PDF certificates for every webhook event your system processes."
          })
        }}
      />
      <Navbar />
      <Hero />
      <Features />
      <BlogPreview />
      <FAQ />
      <Footer />
    </main>
  );
}
