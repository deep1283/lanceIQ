"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "What is a Webhook Delivery Certificate?",
    answer: "A Webhook Delivery Certificate is a human-readable, professional document that proves a specific webhook event occurred. It captures the payload, headers, timestamp, and security signatures (like Stripe-Signature) to serve as verifiable evidence for clients, compliance teams, or dispute resolution."
  },
  {
    question: "How does LanceIQ verify webhook authenticity?",
    answer: "Designed to detect provider-specific headers and optionally verify signatures server-side when you provide your webhook secret. For signed-in users, the verification result and hashes are stored with the certificate so it can be re-verified later."
  },
  {
    question: "Is the PDF generation truly secure?",
    answer: "Guest generation is designed to happen in your browser. If you choose to save a certificate, we store the payload, headers, hashes, and verification status for your account. We are designed to avoid storing your raw webhook secret, only a short hint plus the verification result."
  },
  {
    question: "Why do I need a 'Pro' version?",
    answer: "The Free version includes a watermark for internal use. Pro removes the watermark so your certificates are client-ready and audit-friendly. Paid plan details are shown at checkout."
  },
  {
    question: "Can I use this for non-payment webhooks?",
    answer: "Absolutely. LanceIQ works with any JSON webhook payload. Whether it's a GitHub push event, a Twilio SMS status, or a custom internal API event, you can generate a professional certificate for it."
  }
];

const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="py-20 bg-zinc-900 text-white" id="faq">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
            Frequently Asked Questions
          </h2>
          <p className="text-gray-400 text-lg">
            Everything you need to know about documenting your webhook events.
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div 
              key={index} 
              className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/50 hover:border-zinc-700 transition-colors"
            >
              <button
                className="flex items-center justify-between w-full p-6 text-left focus:outline-none"
                onClick={() => toggleFAQ(index)}
              >
                <span className="text-lg font-medium text-gray-200">{faq.question}</span>
                {openIndex === index ? (
                  <ChevronUp className="w-5 h-5 text-purple-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>
              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="p-6 pt-0 text-gray-400 leading-relaxed border-t border-zinc-800/50">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
