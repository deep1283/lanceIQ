import Navbar from "../../../components/Navbar";
import Footer from "../../../components/Footer";

export default function Soc2ControlsMapPage() {
  return (
    <main className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />

      <div className="flex-grow pt-28 pb-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-10">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400 mb-3">Compliance Pack</p>
            <h1 className="text-4xl font-bold text-slate-900 mb-3">SOC 2 Controls Map</h1>
            <p className="text-slate-600">
              This document maps LanceIQ controls to SOC 2 trust service criteria for review.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Trust Service Criteria</h2>
              <p className="text-sm text-slate-600">
                The mapping below summarizes how operational controls align to the SOC 2 categories.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div className="border border-slate-200 rounded-xl p-4">
                <h3 className="font-semibold text-slate-900 mb-2">Security</h3>
                <p className="text-slate-600">Access control, logging, and evidence integrity safeguards.</p>
              </div>
              <div className="border border-slate-200 rounded-xl p-4">
                <h3 className="font-semibold text-slate-900 mb-2">Availability</h3>
                <p className="text-slate-600">Infrastructure monitoring, redundancy, and uptime practices.</p>
              </div>
              <div className="border border-slate-200 rounded-xl p-4">
                <h3 className="font-semibold text-slate-900 mb-2">Processing Integrity</h3>
                <p className="text-slate-600">Verification workflows, checksum validation, and immutable logs.</p>
              </div>
              <div className="border border-slate-200 rounded-xl p-4">
                <h3 className="font-semibold text-slate-900 mb-2">Confidentiality</h3>
                <p className="text-slate-600">Scoped access, encryption design, and data handling policies.</p>
              </div>
              <div className="border border-slate-200 rounded-xl p-4 md:col-span-2">
                <h3 className="font-semibold text-slate-900 mb-2">Privacy</h3>
                <p className="text-slate-600">Data processing commitments and privacy documentation alignment.</p>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              This controls map is provided for evaluation purposes and does not constitute certification.
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
