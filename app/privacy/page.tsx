"use client";

import React from "react";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

const LAST_UPDATED = "February 6, 2026";

export default function PrivacyPolicy() {
  return (
    <main className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />
      
      <div className="flex-grow pt-28 pb-16 px-6">
        <div className="max-w-3xl mx-auto bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
          <p className="text-slate-500 mb-8">Last Updated: {LAST_UPDATED}</p>

          <div className="prose prose-slate max-w-none text-slate-700">
            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">1. Data Processing</h2>
              <p className="mb-4">
                At LanceIQ, we prioritize your data privacy.
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>PDF Generation:</strong> For guest users, PDF generation is designed to happen client-side. We do not persist your payload for guest sessions.</li>
                <li><strong>Signature Verification:</strong> If you use Signature Verification, your payload, headers, and secret are sent to our servers to compute the verification result. We are designed to avoid storing raw secrets, and guest verification data is not persisted.</li>
                <li><strong>Logged-in Users:</strong> If you save a certificate, we store the payload, headers, hashes, and verification status to provide history and proof links.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">2. Payment Information</h2>
              <p className="mb-4">
                Payments are processed by our third-party provider, <strong>Dodo Payments</strong>. We do not store your credit card information or billing details on our servers.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">3. Local Storage</h2>
              <p className="mb-4">
                We use your browser&apos;s Local Storage to remember your Pro verification email so you do not have to re-verify it on every visit. This data stays on your device.
              </p>
            </section>

            

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-4">4. Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy, please contact us at privacy@lanceiq.com
              </p>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
