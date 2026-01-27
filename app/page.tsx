import type { Metadata } from 'next';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Features from '../components/Features';
import FAQ from '../components/FAQ';
import BlogPreview from '../components/BlogPreview';
import Footer from '../components/Footer';

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
      <Navbar />
      <Hero />
      <Features />
      <BlogPreview />
      <FAQ />
      <Footer />
    </main>
  );
}
