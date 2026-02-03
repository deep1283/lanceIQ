import React from "react";
import Navbar from "../../../components/Navbar";
import Footer from "../../../components/Footer";
import { ArrowLeft, Calendar, Clock, Tag } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Metadata } from "next";

// Mock Data for the 3 articles
const blogPosts = {
  "webhook-compliance": {
    title: "Why Webhook Documentation Matters for Compliance",
    date: "Jan 12, 2026",
    readTime: "2 min read",
    category: "Compliance",
    content: (
      <>
        <p className="mb-6 text-lg leading-relaxed text-slate-700">
          In the modern API economy, webhooks are the nervous system of your infrastructure. They trigger payments, ship orders, and sync user data. But what happens when an auditor asks for proof that a specific event occurred?
        </p>
        <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">The &quot;He Said, She Said&quot; Problem</h2>
        <p className="mb-6 text-slate-700">
          Without verifiable logs, disputes between services become a game of finger-pointing. &quot;We sent the webhook,&quot; says Stripe. &quot;We never got it,&quot; says your server logs. A standardized Webhook Delivery Certificate acts as a neutral third-party record, capturing the headers, payload, and cryptographic signature in a format that business teams (and auditors) can understand.
        </p>
        <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">SOC2 and GDPR Requirements</h2>
        <p className="mb-6 text-slate-700">
          Compliance frameworks increasingly demand &quot;non-repudiation&quot; — the ability to prove that a transaction took place. Storing raw JSON logs is often insufficient because they are easily mutable. A generated PDF certificate, especially one that is cryptographically signed or hashed, provides a much stronger artifact for your compliance trail.
        </p>
      </>
    )
  },
  "debugging-stripe-webhooks": {
    title: "Debugging Stripe Webhooks: A Visual Guide",
    date: "Jan 18, 2026",
    readTime: "2 min read",
    category: "Engineering",
    content: (
      <>
        <p className="mb-6 text-lg leading-relaxed text-slate-700">
          Stripe&apos;s developer experience is world-class, but debugging failed webhooks can still be a nightmare. Is it a signature mismatch? A timeout? A malformed payload?
        </p>
        <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Visualizing the Invisible</h2>
        <p className="mb-6 text-slate-700">
          The hardest part of debugging webhooks is their ephemeral nature. They happen, and then they&apos;re gone. By converting a webhook payload into a visual document, you can inspect the `Stripe-Signature` header, break down the timestamp (`t=...`), and verify the v1 signature (`v1=...`) manually if needed.
        </p>
        <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Common Pitfalls</h2>
        <ul className="list-disc list-inside space-y-2 mb-6 text-slate-700">
            <li><strong>Time Drift:</strong> If your server clock is more than 5 minutes off, valid signatures will fail.</li>
            <li><strong>Raw Body Access:</strong> Many frameworks automatically parse JSON. Signature verification requires the <em>raw</em> request body.</li>
        </ul>
      </>
    )
  },
  "webhook-security-signatures": {
    title: "The Ultimate Guide to Webhook Security Signatures",
    date: "Jan 25, 2026",
    readTime: "2 min read",
    category: "Security",
    content: (
      <>
        <p className="mb-6 text-lg leading-relaxed text-slate-700">
          HMAC (Hash-Based Message Authentication Code) is the industry standard for verifying that a webhook actually came from the sender it claims to be from.
        </p>
        <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">How It Works</h2>
        <p className="mb-6 text-slate-700">
          The sender takes the payload content, adds a timestamp, and hashes it using a secret key only known to you and them. They send this hash in a header (e.g., `X-Hub-Signature`). Your server repeats the process. If the hashes match, the request is authentic.
        </p>
        <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Why Documentation is Key</h2>
        <p className="mb-6 text-slate-700">
          When a security incident occurs, being able to produce a certificate showing &quot;This request had a valid signature at 10:00 AM&quot; is invaluable. It proves that you performed due diligence in accepting incoming data streams.
        </p>
      </>
    )
  }
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = blogPosts[slug as keyof typeof blogPosts];

  if (!post) {
      return {
          title: 'Article Not Found',
          description: 'The article you are looking for does not exist.'
      }
  }

  return {
    title: `${post.title} | LanceIQ Blog`,
    description: `Read about ${post.title}. ${post.category} insights for webhook management.`,
    openGraph: {
      title: post.title,
      description: `Read about ${post.title}. ${post.category} insights for webhook management.`,
      type: 'article',
      publishedTime: post.date,
      authors: ['LanceIQ Team'],
    }
  }
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = blogPosts[slug as keyof typeof blogPosts];

  if (!post) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      
      <article className="flex-grow pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <Link 
            href="/#blog" 
            className="inline-flex items-center text-sm text-slate-500 hover:text-purple-600 transition-colors mb-8 group"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Articles
          </Link>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="bg-slate-900 p-8 md:p-12 text-white relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 blur-[80px] rounded-full pointer-events-none" />
                 
                 <div className="relative z-10">
                    <div className="flex flex-wrap gap-4 text-sm font-medium text-purple-300 mb-6">
                        <span className="flex items-center bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
                            <Tag className="w-3 h-3 mr-2" />
                            {post.category}
                        </span>
                        <span className="flex items-center text-slate-400">
                            <Calendar className="w-3 h-3 mr-2" />
                            {post.date}
                        </span>
                         <span className="flex items-center text-slate-400">
                            <Clock className="w-3 h-3 mr-2" />
                            {post.readTime}
                        </span>
                    </div>

                    <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-2">
                        {post.title}
                    </h1>
                 </div>
            </div>

            {/* Content */}
            <div className="p-8 md:p-12">
               {post.content}
            </div>
          </div>
        </div>
      </article>

      <Footer />
    </main>
  );
}
