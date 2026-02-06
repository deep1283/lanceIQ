"use client";

import React from "react";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

const LAST_UPDATED = "February 6, 2026";

export default function SubprocessorsPage() {
  return (
    <main className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />

      <div className="flex-grow pt-28 pb-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12 text-center">
            <h1 className="text-3xl font-bold text-slate-900 mb-4">LanceIQ Subprocessors</h1>
            <p className="text-lg text-slate-600">
              We use the following third-party service providers to process data on our behalf.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-700">Name</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-700">Purpose</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-700">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-6 py-4 font-medium text-slate-900">Supabase</td>
                  <td className="px-6 py-4 text-slate-600">Database Hosting & Authentication</td>
                  <td className="px-6 py-4 text-slate-600">AWS (Various Regions)</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-slate-900">Vercel</td>
                  <td className="px-6 py-4 text-slate-600">Web Application Hosting & Serverless Functions</td>
                  <td className="px-6 py-4 text-slate-600">Global (Edge Network)</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-slate-900">Dodo Payments</td>
                  <td className="px-6 py-4 text-slate-600">Payment Processing & Merchant of Record</td>
                  <td className="px-6 py-4 text-slate-600">Global</td>
                </tr>
                 <tr>
                  <td className="px-6 py-4 font-medium text-slate-900">Resend</td>
                  <td className="px-6 py-4 text-slate-600">Transactional Emails</td>
                  <td className="px-6 py-4 text-slate-600">United States</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-slate-900">Upstash</td>
                  <td className="px-6 py-4 text-slate-600">Redis (Rate Limiting & Queues)</td>
                  <td className="px-6 py-4 text-slate-600">AWS (Various Regions)</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <p className="mt-8 text-sm text-slate-500 text-center">
            Last Updated: {LAST_UPDATED}
          </p>
        </div>
      </div>

      <Footer />
    </main>
  );
}
