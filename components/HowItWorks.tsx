"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FileText, ShieldCheck, QrCode } from "lucide-react";

const steps = [
  {
    title: "Paste payload and headers",
    description:
      "Drop in the exact webhook body and headers. We format them into a clean, readable record.",
    icon: <FileText className="w-6 h-6" />,
  },
  {
    title: "Verify the signature (optional)",
    description:
      "Provide your webhook secret and the system is designed to validate authenticity server-side.",
    icon: <ShieldCheck className="w-6 h-6" />,
  },
  {
    title: "Generate and share records",
    description:
      "Download a professional PDF and, if signed in, include a QR-based verification link for audit trails.",
    icon: <QrCode className="w-6 h-6" />,
  },
];

const HowItWorks: React.FC = () => {
  return (
    <section className="py-24 bg-black text-white relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-bold mb-4"
          >
            How It Works
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-lg text-gray-400 max-w-2xl mx-auto"
          >
            From raw webhook data to audit-ready records in minutes.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="rounded-2xl border border-white/10 bg-zinc-900/50 p-6"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white mb-5">
                {step.icon}
              </div>
              <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
              <p className="text-gray-400">{step.description}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/tool"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-white text-black font-semibold hover:bg-gray-200 transition-colors"
          >
            Try the Generator
          </Link>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
