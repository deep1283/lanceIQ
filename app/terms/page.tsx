"use client";

import React from "react";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

export default function TermsAndConditions() {
  return (
    <main className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />
      
      <div className="flex-grow pt-28 pb-16 px-6">
        <div className="max-w-3xl mx-auto bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms and Conditions</h1>
          <p className="text-slate-500 mb-8">Last Updated: {new Date().toLocaleDateString()}</p>

          <div className="prose prose-slate max-w-none text-slate-700">
            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">1. Welcome to LanceIQ</h2>
              <p className="mb-4">
                Thank you for choosing LanceIQ. By using our service, you agree to these terms. We've designed them to be fair and transparent, ensuring a positive experience for everyone.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">2. How Our Service Works</h2>
              <p className="mb-4">
                LanceIQ helps you generate professional-grade PDF certificates for your webhook events. We provide this tool "as is" to help you document and organize your technical records efficiently.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">3. Use of the Platform</h2>
              <p className="mb-4">
                We trust our users to use LanceIQ responsibly. Please ensure that the data you input for certificate generation is accurate and lawful. As a user-generated content tool, we rely on your integrity to not create misleading or fraudulent documents.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">4. Payments & Satisfaction</h2>
              <p className="mb-4">
                The Pro upgrade is a one-time purchase that immediately unlocks premium features, such as watermark removal. Because these features are available instantly, we generally cannot offer refunds. However, we encourage you to try the free tier first to make sure LanceIQ is the right fit for you.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">5. Service Reliability</h2>
              <p className="mb-4">
                We are committed to providing a secure and reliable experience. However, like any online service, technical issues can occasionally occur. The service is provided on an "as is" and "as available" basis. While we do our best to ensure smooth operation, we are not liable for unforeseen interruptions or service outages beyond our reasonable control.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-4">6. Updates</h2>
              <p>
                We may occasionally update these terms to reflect changes in our service or the law. We will always post the most current version here for your review.
              </p>
            </section>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
