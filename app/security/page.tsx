"use client";

import React from "react";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import { ShieldCheck, Lock, Server } from "lucide-react";

export default function SecurityPage() {
  return (
    <main className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />

      <div className="flex-grow pt-28 pb-16 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-4xl font-bold text-slate-900 mb-4">Security at LanceIQ</h1>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              We take the security of your data seriously. Our infrastructure is designed to provide secure, scalable, and reliable services.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            {/* Data Protection */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
                <Lock className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Data Protection</h2>
              <ul className="space-y-3 text-slate-600">
                <li className="flex items-start">
                  <span className="mr-2 text-green-500">✓</span>
                  <span><strong>In Transit:</strong> The system is designed to use HTTPS to protect data between your browser and our servers.</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-green-500">✓</span>
                  <span><strong>At Rest:</strong> Stored certificates are hosted in Supabase and are designed to be protected by provider security controls.</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-green-500">✓</span>
                  <span><strong>Secrets:</strong> Webhook secrets are designed to be processed transiently and not stored. Only a short hint plus the verification result is saved.</span>
                </li>
              </ul>
            </div>

            {/* Access and Integrity */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6 text-indigo-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Access and Integrity</h2>
              <ul className="space-y-3 text-slate-600">
                <li className="flex items-start">
                  <span className="mr-2 text-green-500">✓</span>
                  <span><strong>Account Scoping:</strong> Saved certificates are designed to be tied to your account and protected by database access controls.</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-green-500">✓</span>
                  <span><strong>Integrity Proof:</strong> Each certificate is designed to store hashes and verification metadata.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Infrastructure */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 mb-16">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center mr-4">
                <Server className="w-6 h-6 text-slate-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Infrastructure</h2>
            </div>
            <p className="text-slate-600 mb-6">
              We run on established infrastructure providers and are designed to follow a least-privilege approach for data access.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div>
                  <h3 className="font-semibold text-slate-900 mb-2">Cloud Providers</h3>
                  <p className="text-slate-600">We use Vercel and Supabase for hosting and database services, and design for operational resilience.</p>
               </div>
               <div>
                  <h3 className="font-semibold text-slate-900 mb-2">Data Processing</h3>
                  <p className="text-slate-600">We act as a Data Processor. See our <a href="/dpa" className="text-blue-600 hover:underline">DPA</a> for more details.</p>
               </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-slate-500">
              Questions? Contact <a href="mailto:security@lanceiq.com" className="text-blue-600 hover:underline">security@lanceiq.com</a>
            </p>
          </div>

        </div>
      </div>

      <Footer />
    </main>
  );
}
