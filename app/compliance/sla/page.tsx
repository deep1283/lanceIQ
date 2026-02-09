import Navbar from "../../../components/Navbar";
import Footer from "../../../components/Footer";

export default function SlaTemplatePage() {
  return (
    <main className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />

      <div className="flex-grow pt-28 pb-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-10">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400 mb-3">Compliance Pack</p>
            <h1 className="text-4xl font-bold text-slate-900 mb-3">SLA Template</h1>
            <p className="text-slate-600">
              A service level template for contract discussions and vendor alignment.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6 text-sm text-slate-700">
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Service Availability</h2>
              <p>Target uptime: <span className="font-mono">[Insert % per calendar month]</span></p>
              <p>Measurement window: <span className="font-mono">[Insert measurement period]</span></p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Support Response</h2>
              <p>Critical incidents: <span className="font-mono">[Insert response time]</span></p>
              <p>High priority: <span className="font-mono">[Insert response time]</span></p>
              <p>Normal priority: <span className="font-mono">[Insert response time]</span></p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Maintenance Windows</h2>
              <p>Planned maintenance notice: <span className="font-mono">[Insert notice period]</span></p>
              <p>Emergency maintenance: <span className="font-mono">[Insert procedure]</span></p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Service Credits</h2>
              <p>Credits schedule: <span className="font-mono">[Insert credit tiers]</span></p>
              <p>Request process: <span className="font-mono">[Insert process]</span></p>
            </section>

            <p className="text-xs text-slate-500">
              This template is for drafting purposes and should be adapted to your contracted terms.
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
