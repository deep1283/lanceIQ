"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldCheck, Lock, Hash, Server } from "lucide-react";

const items = [
  {
    title: "Hash-based integrity",
    description:
      "Designed to compute SHA-256 hashes of raw payloads and canonical JSON to make certificates tamper-evident.",
    icon: <Hash className="w-5 h-5" />,
  },
  {
    title: "Optional signature checks",
    description:
      "Designed to verify Stripe and Razorpay signatures server-side when you provide your secret.",
    icon: <ShieldCheck className="w-5 h-5" />,
  },
  {
    title: "Scoped access control",
    description:
      "Designed to scope saved certificates to your account using Supabase row-level security.",
    icon: <Lock className="w-5 h-5" />,
  },
  {
    title: "Reliable infrastructure",
    description:
      "Built on Vercel and Supabase and designed for dependable uptime.",
    icon: <Server className="w-5 h-5" />,
  },
];

const Trust: React.FC = () => {
  return (
    <section className="py-24 bg-zinc-950 text-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-bold mb-4"
          >
            Built for Audit-Grade Proof
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-lg text-gray-400 max-w-2xl mx-auto"
          >
            Every certificate is designed to hold up under scrutiny from clients,
            auditors, and compliance teams.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {items.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6"
            >
              <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white mb-4">
                {item.icon}
              </div>
              <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
              <p className="text-gray-400">{item.description}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-4 justify-center text-sm text-gray-400">
          <Link href="/security" className="hover:text-white transition-colors">
            Security
          </Link>
          <Link href="/privacy" className="hover:text-white transition-colors">
            Privacy
          </Link>
          <Link href="/dpa" className="hover:text-white transition-colors">
            DPA
          </Link>
          <Link href="/subprocessors" className="hover:text-white transition-colors">
            Subprocessors
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Trust;
