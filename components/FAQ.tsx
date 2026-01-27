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
    answer: "LanceIQ analyzes the headers provided in the webhook payload. We automatically detect and display signatures from major providers like Stripe, PayPal, Shopify, and Razorpay. While we display these for your records, the ultimate cryptographic verification happens on your server; our tool provides the visual documentation of that event."
  },
  {
    question: "Is the PDF generation truly secure?",
    answer: "Yes. All processing happens securely. We do not store your webhook data permanently.The generation process is ephemeral, ensuring your sensitive transaction data remains private."
  },
  {
    question: "Why do I need a 'Pro' version?",
    answer: "The Free version allows you to generate certificates with a watermark. The Pro version removes this watermark, giving you a pristine, white-labeled document suitable for sending to high-value clients, legal audits, or professional records. It's a one-time purchase for lifetime access."
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
