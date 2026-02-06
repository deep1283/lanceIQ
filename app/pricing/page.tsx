"use client";

import React from "react";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import { Check, Sparkles } from "lucide-react";

const tiers = [
  {
    name: "Free",
    price: "$0",
    tagline: "For testing webhook flows",
    cta: { label: "Get Started", href: "/login" },
    highlight: false,
    features: [
      "100 certificates per month",
      "7-day history",
      "Watermarked PDFs",
      "No saved verification",
    ],
  },
  {
    name: "Pro",
    price: "$19",
    cadence: "/month",
    tagline: "For freelancers and solo consultants",
    cta: { label: "Upgrade to Pro", href: "/login" },
    highlight: true,
    features: [
      "2,000 certificates per month",
      "1-year history",
      "No watermark",
      "Verification + export",
    ],
  },
  {
    name: "Team",
    price: "$79",
    cadence: "/month",
    tagline: "For agencies and compliance teams",
    cta: { label: "Upgrade to Team", href: "/login" },
    highlight: false,
    features: [
      "10,000 certificates per month",
      "3-year history",
      "Shared workspaces",
      "Audit log",
      "Slack/email alerts",
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />

      <section className="pt-28 pb-16 px-6">
        <div className="max-w-6xl mx-auto text-center mb-12">
          <p className="text-sm uppercase tracking-[0.3em] text-purple-400 mb-4">
            Pricing
          </p>
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            Transparent Pricing
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Start free, upgrade when you need audit-grade certificates and long-term history.
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-3xl border ${
                tier.highlight
                  ? "border-purple-500/50 bg-gradient-to-b from-white/5 to-purple-500/10"
                  : "border-white/10 bg-white/5"
              } p-8 shadow-xl`}
            >
              {tier.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-purple-500 text-black text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-2xl font-semibold mb-2">{tier.name}</h3>
                <p className="text-slate-400 text-sm">{tier.tagline}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold">{tier.price}</span>
                {tier.cadence && (
                  <span className="text-slate-400 text-sm ml-2">{tier.cadence}</span>
                )}
              </div>

              <Link
                href={tier.cta.href}
                className={`inline-flex items-center justify-center w-full py-3 rounded-full font-semibold transition-colors ${
                  tier.highlight
                    ? "bg-white text-black hover:bg-gray-200"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {tier.cta.label}
              </Link>

              <ul className="mt-8 space-y-3 text-sm text-slate-300">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
