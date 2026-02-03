"use client";

import React from "react";
import Link from "next/link";

interface BlogPost {
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  slug: string;
  category: string;
}

const posts: BlogPost[] = [
  {
    title: "Why Webhook Documentation Matters for Compliance",
    excerpt: "In the age of API-first businesses, verifiable logs are your safety net. Learn how PDF certificates can save you during audits.",
    date: "Jan 12, 2026",
    readTime: "2 min read",
    slug: "/blog/webhook-compliance",
    category: "Compliance"
  },
  {
    title: "Debugging Stripe Webhooks: A Visual Guide",
    excerpt: "Stop guessing what went wrong. Visualizing headers and payloads in a clean format makes debugging payment failures 10x faster.",
    date: "Jan 18, 2026",
    readTime: "2 min read",
    slug: "/blog/debugging-stripe-webhooks",
    category: "Engineering"
  },
  {
    title: "The Ultimate Guide to Webhook Security Signatures",
    excerpt: "Understanding HMAC signatures from Stripe, PayPal, and Razorpay. How to verify them and why documentation is key.",
    date: "Jan 25, 2026",
    readTime: "2 min read",
    slug: "/blog/webhook-security-signatures",
    category: "Security"
  }
];

const BlogPreview: React.FC = () => {
  return (
    <section className="py-24 bg-black text-white relative overflow-hidden" id="blog">
      {/* Background Gradient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-purple-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
          <div className="max-w-2xl">
            <span className="text-purple-400 font-semibold tracking-wider text-sm uppercase mb-2 block">
              From the Blog
            </span>
            <h2 className="text-3xl md:text-5xl font-bold leading-tight">
              Insights on API <br /> <span className="text-gray-500">Reliability & Docs.</span>
            </h2>
          </div>

        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {posts.map((post, index) => (
            <div 
              key={index}
              className="group flex flex-col p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-purple-500/30 hover:bg-zinc-900/60 transition-all duration-300"
            >
              <div className="flex items-center justify-between text-xs text-gray-500 mb-6 font-mono">
                <span className="text-purple-400">{post.category}</span>
                <span>{post.readTime}</span>
              </div>
              <h3 className="text-xl font-bold mb-4 group-hover:text-purple-300 transition-colors">
                <Link href={post.slug}>{post.title}</Link>
              </h3>
              <p className="text-gray-400 leading-relaxed mb-6 flex-grow">
                {post.excerpt}
              </p>
              <div className="mt-auto pt-6 border-t border-zinc-800">
                <span className="text-sm text-gray-500">{post.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BlogPreview;
