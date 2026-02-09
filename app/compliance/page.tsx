import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

export default function CompliancePage() {
  return (
    <main className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />

      <div className="flex-grow pt-28 pb-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400 mb-4">Compliance Pack</p>
            <h1 className="text-4xl font-bold text-slate-900 mb-4">Compliance Documentation</h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Access security, privacy, and compliance materials for due diligence and vendor reviews.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <Link href="/compliance/soc2" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <h2 className="text-xl font-semibold text-slate-900 mb-2">SOC 2 Controls Map</h2>
              <p className="text-sm text-slate-600">
                A controls-to-criteria mapping template for review.
              </p>
              <span className="inline-flex mt-4 text-sm text-blue-600 font-medium">View SOC 2 map →</span>
            </Link>

            <Link href="/dpa" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Data Processing Addendum</h2>
              <p className="text-sm text-slate-600">
                Standard DPA covering processing roles and safeguards.
              </p>
              <span className="inline-flex mt-4 text-sm text-blue-600 font-medium">View DPA →</span>
            </Link>

            <Link href="/compliance/sla" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <h2 className="text-xl font-semibold text-slate-900 mb-2">SLA Template</h2>
              <p className="text-sm text-slate-600">
                Service level template for contractual alignment.
              </p>
              <span className="inline-flex mt-4 text-sm text-blue-600 font-medium">View SLA template →</span>
            </Link>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Additional Resources</h3>
            <div className="flex flex-wrap gap-4 text-sm">
              <Link href="/security" className="text-blue-600 hover:underline">Security Overview</Link>
              <Link href="/subprocessors" className="text-blue-600 hover:underline">Subprocessors</Link>
              <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>
              <Link href="/terms" className="text-blue-600 hover:underline">Terms & Conditions</Link>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
