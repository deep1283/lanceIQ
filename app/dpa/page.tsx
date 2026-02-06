"use client";

import React from "react";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

const EFFECTIVE_DATE = "February 6, 2026";

export default function DPAPage() {
  return (
    <main className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />

      <div className="flex-grow pt-28 pb-16 px-6">
        <div className="max-w-3xl mx-auto bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Data Processing Addendum</h1>
          <p className="text-slate-500 mb-8">Effective Date: {EFFECTIVE_DATE}</p>

          <div className="prose prose-slate max-w-none text-slate-700">
            <p>
              This Data Processing Addendum (&quot;DPA&quot;) forms part of the Master Services Agreement or Terms of Service between LanceIQ (&quot;Processor&quot;) and the Customer (&quot;Controller&quot;).
            </p>

            <h3 className="text-lg font-bold text-slate-900 mt-6 mb-2">1. Scope and Roles</h3>
            <p>
              LanceIQ acts as a Data Processor with respect to Personal Data processed on behalf of the Customer. The Customer acts as the Data Controller.
            </p>

            <h3 className="text-lg font-bold text-slate-900 mt-6 mb-2">2. Data Subject Rights</h3>
            <p>
              LanceIQ shall, to the extent legally permitted, promptly notify Customer if it receives a request from a Data Subject to exercise their rights (e.g., access, deletion). LanceIQ will assist Customers with these requests upon written instruction.
            </p>

            <h3 className="text-lg font-bold text-slate-900 mt-6 mb-2">3. Subprocessors</h3>
            <p>
              Customer grants LanceIQ general authorization to engage Subprocessors. A current list of Subprocessors is maintained at <a href="/subprocessors" className="text-blue-600 hover:underline">lanceiq.com/subprocessors</a>.
            </p>

            <h3 className="text-lg font-bold text-slate-900 mt-6 mb-2">4. Security Measures</h3>
            <p>
              LanceIQ implements appropriate technical and organizational measures to protect Personal Data, as detailed in our <a href="/security" className="text-blue-600 hover:underline">Security Policy</a>.
            </p>

             <h3 className="text-lg font-bold text-slate-900 mt-6 mb-2">5. Data Transfers</h3>
             <p>
               Data may be processed in the United States and other locations where our Subprocessors operate. We ensure appropriate safeguards are in place for cross-border transfers.
             </p>

             <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-slate-100 text-sm">
                <p><strong>LanceIQ</strong></p>
                <p>Contact: privacy@lanceiq.com</p>
             </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
