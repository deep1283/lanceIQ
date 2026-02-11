"use client";

import React from "react";
import { ShieldCheck, Hash, Clock3, FileText } from "lucide-react";
import { motion } from "framer-motion";

const SampleCertificate: React.FC = () => {
  return (
    <section id="sample" className="relative py-24 bg-black text-white overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-black to-zinc-950 pointer-events-none" />
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold"
            >
              Sample Certificate Preview
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-lg text-gray-400"
            >
              Clean, audit-friendly formatting with the exact payload, headers, and verification status preserved.
            </motion.p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
                <div className="flex items-center gap-3 mb-2 text-sm text-gray-300">
                  <Clock3 className="w-4 h-4 text-cyan-400" />
                  Receipt timestamp
                </div>
                <p className="text-xs text-gray-400">UTC time of receipt stored with the record.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
                <div className="flex items-center gap-3 mb-2 text-sm text-gray-300">
                  <Hash className="w-4 h-4 text-purple-400" />
                  Payload hash
                </div>
                <p className="text-xs text-gray-400">Tamper-evident hash of the payload.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
                <div className="flex items-center gap-3 mb-2 text-sm text-gray-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Verification result
                </div>
                <p className="text-xs text-gray-400">Optional signature check outcome stored on the record.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
                <div className="flex items-center gap-3 mb-2 text-sm text-gray-300">
                  <FileText className="w-4 h-4 text-pink-400" />
                  Shareable PDF
                </div>
                <p className="text-xs text-gray-400">Structured layout ready for audits and client reviews.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 text-xs text-gray-300 leading-relaxed">
              <span className="font-semibold text-white">Scope of Proof:</span>{" "}
              This certificate attests only to receipt by LanceIQ at the timestamp shown, the payload and headers received,
              and the verification status computed. It does not attest to upstream provider intent, downstream processing,
              or financial settlement.
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="rounded-3xl border border-white/10 bg-gradient-to-br from-white to-slate-100 text-slate-900 shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Webhook Receipt Record</p>
                <p className="text-lg font-semibold">Certificate Preview</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Report ID</p>
                <p className="font-mono text-sm">cert_89c2f7</p>
              </div>
            </div>
            <div className="px-6 py-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="uppercase text-slate-400 mb-1">Status</p>
                  <p className="font-semibold text-emerald-600">200 OK</p>
                </div>
                <div>
                  <p className="uppercase text-slate-400 mb-1">Received At</p>
                  <p className="font-medium">2026-02-11 14:22:08 UTC</p>
                </div>
                <div>
                  <p className="uppercase text-slate-400 mb-1">Provider</p>
                  <p className="font-medium">Stripe</p>
                </div>
                <div>
                  <p className="uppercase text-slate-400 mb-1">Signature</p>
                  <p className="font-medium text-emerald-600">Verified</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase text-slate-400 mb-2">Payload Hash (SHA-256)</p>
                <p className="font-mono text-xs text-slate-700 break-all">a8b7d1f23f0c1e9bd4c8f2d91aa2457c7e0b2f4a8a9f3c1d8e4b9a1f3d2c7b1e</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase text-slate-400 mb-2">Headers</p>
                <div className="text-xs text-slate-700 font-mono space-y-1">
                  <p>Stripe-Signature: t=170634...,v1=4f3a...</p>
                  <p>Content-Type: application/json</p>
                  <p>User-Agent: Stripe/1.0</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default SampleCertificate;
