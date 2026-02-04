"use client";

import React from "react";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

export default function PrivacyPolicy() {
  return (
    <main className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />
      
      <div className="flex-grow pt-28 pb-16 px-6">
        <div className="max-w-3xl mx-auto bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
          <p className="text-slate-500 mb-8">Last Updated: {new Date().toLocaleDateString()}</p>

          <div className="prose prose-slate max-w-none text-slate-700">
            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">1. Data Processing</h2>
              <p className="mb-4">
                At LanceIQ, we prioritize your data privacy.
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>PDF Generation:</strong> For guest users, PDF generation happens entirely client-side. Your data never typically leaves your browser.</li>
                <li><strong>Signature Verification:</strong> If you use the Signature Verification feature, your payload, headers, and secret are sent securely to our servers for processing. This data is processed in-memory to verify the cryptographic signature and is <strong>never stored or logged</strong> for guest users.</li>
                <li><strong>Logged-in Users:</strong> If you choose to save a certificate to your account, we store the payload, headers, verification status, and cryptographic hashes to provide a permanent, verifiable record.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">2. Payment Information</h2>
              <p className="mb-4">
                All payments are processed securely by our third-party provider, <strong>Dodo Payments</strong>. We do not store your credit card information or billing details on our servers. We only retain the email address you provide for verification purposes to validate your Pro status.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">3. Local Storage</h2>
              <p className="mb-4">
                We use your browser&apos;s Local Storage mechanism to save your Pro status so you don&apos;t have to verify your email every time you visit. This data stays on your device.
              </p>
            </section>

            

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-4">4. Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy, please contact us at deepmishra1283@gmail.com
              </p>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
