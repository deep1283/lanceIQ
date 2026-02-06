import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, Download, Calendar, CheckCircle, ShieldCheck, ShieldAlert, AlertTriangle, Plus } from "lucide-react";
import DashboardNavbar from "@/components/DashboardNavbar";
import { DashboardClient } from "@/components/DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: certificates } = await supabase
    .from("certificates")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const thisMonthCount = certificates?.filter(
    (c) => new Date(c.created_at) >= thisMonth
  ).length ?? 0;

  return (
    <main className="min-h-screen bg-slate-50">
      <DashboardNavbar />
      <DashboardClient>
        {/* Stats */}
        <div className="flex items-center justify-between mb-6">
          <Link 
            href="/tool"
            className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition-colors text-sm font-medium"
          >
            ← Back to Generator
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-sm text-slate-500">Total Certificates</p>
            <p className="text-2xl font-bold text-slate-900">{certificates?.length ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-sm text-slate-500">This Month</p>
            <p className="text-2xl font-bold text-slate-900">{thisMonthCount}</p>
          </div>
        </div>

        {/* Certificates List */}
        {!certificates || certificates.length === 0 ? (
          <div className="bg-white rounded-xl p-12 border border-slate-200 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No certificates yet</h3>
            <p className="text-slate-500 mb-6">Generate your first webhook certificate to see it here.</p>
            <Link
              href="/tool"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Generate Certificate
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Report ID
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    Date
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Signature
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {certificates.map((cert) => (
                  <tr key={cert.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span className="font-mono text-sm text-slate-900">
                          {cert.report_id.slice(0, 8)}...
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Calendar className="w-3 h-3" />
                        {new Date(cert.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                        {cert.signature_status === 'verified' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-200" title={`Verified with ${cert.verification_method}`}>
                                <ShieldCheck className="w-3 h-3" />
                                Verified
                            </span>
                        )}
                        {cert.signature_status === 'failed' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 text-xs font-medium rounded-full border border-red-200" title={cert.verification_error || 'Verification Failed'}>
                                <ShieldAlert className="w-3 h-3" />
                                Failed
                            </span>
                        )}
                        {(cert.signature_status === 'not_verified' || !cert.signature_status) && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full border border-slate-200" title="No signature verification performed">
                                <AlertTriangle className="w-3 h-3 text-slate-400" />
                                Unverified
                            </span>
                        )}
                    </td>
                    <td className="py-3 px-4">
                      {cert.is_pro ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full border border-indigo-100">
                          <CheckCircle className="w-3 h-3" />
                          Pro
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 text-slate-600 text-xs font-medium rounded-full border border-slate-200">
                          Free
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/tool?id=${cert.report_id}`}
                        className="inline-flex items-center gap-1 text-slate-600 hover:text-indigo-600 text-sm font-medium transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardClient>
    </main>
  );
}
