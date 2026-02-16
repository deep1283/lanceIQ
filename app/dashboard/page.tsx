import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, Download, Calendar, CheckCircle, ShieldCheck, ShieldAlert, AlertTriangle, Plus, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardClient } from "@/components/DashboardClient";
import { checkPlanEntitlements } from "@/app/actions/subscription";
import { getPlanLimits } from "@/lib/plan";
import { pickPrimaryWorkspace } from "@/lib/workspace";
import { canExportCertificates } from "@/lib/roles";

const PAGE_SIZE = 50;
type DashboardCertificate = {
  id: string;
  report_id: string;
  created_at: string;
  signature_status: 'verified' | 'failed' | 'not_verified' | null;
  verification_method: string | null;
  verification_error: string | null;
  is_pro: boolean | null;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const initialTab = params.tab === 'sources' ? 'sources' : 'certificates';
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select(`workspace_id, role, workspaces ( id, plan, created_at )`)
    .eq("user_id", user.id);

  const activeWorkspace = pickPrimaryWorkspace(memberships);
  const workspaceId = activeWorkspace?.id ?? null;
  const activeMembership = memberships?.find((membership) => membership.workspace_id === workspaceId);
  const workspaceRole = activeMembership?.role ?? null;
  const canExport = canExportCertificates(workspaceRole);

  const entitlements = workspaceId ? await checkPlanEntitlements(workspaceId) : await checkPlanEntitlements();
  const { plan } = entitlements;
  const limits = getPlanLimits(plan);

  const nowIso = new Date().toISOString();
  let certificates: DashboardCertificate[] | null = [];
  let totalCount = 0;
  let thisMonthCount = 0;

  if (workspaceId) {
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const thisMonthIso = thisMonth.toISOString();

    // Accurate total count
    const { count } = await supabase
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gt("expires_at", nowIso);
    totalCount = count ?? 0;

    // Accurate this-month count
    const { count: monthCount } = await supabase
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gt("expires_at", nowIso)
      .gte("created_at", thisMonthIso);
    thisMonthCount = monthCount ?? 0;

    // Paginated fetch
    const { data } = await supabase
      .from("certificates")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    certificates = data || [];
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="min-h-screen bg-transparent">
      <DashboardClient workspaceRole={workspaceRole} initialTab={initialTab} entitlements={entitlements}>
        {/* Stats */}
        <div className="flex items-center justify-between mb-6">
          <Link 
            href="/tool"
            className="flex items-center gap-2 dashboard-text-muted hover:text-[var(--dash-text)] transition-colors text-sm font-medium"
          >
            ← Back to Generator
          </Link>
          {limits.canExport && canExport && (
            <a
              href="/api/certificates/export"
              className="flex items-center gap-2 dashboard-text-muted hover:text-[var(--dash-text)] transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </a>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="dashboard-panel rounded-xl p-6">
            <p className="text-sm dashboard-text-muted">Total Certificates</p>
            <p className="text-2xl font-semibold text-slate-900">{totalCount}</p>
          </div>
          <div className="dashboard-panel rounded-xl p-6">
            <p className="text-sm dashboard-text-muted">This Month</p>
            <p className="text-2xl font-semibold text-slate-900">{thisMonthCount}</p>
          </div>
        </div>

        {/* Certificates List */}
        {!certificates || certificates.length === 0 ? (
          <div className="dashboard-panel rounded-xl p-12 text-center">
            <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No certificates yet</h3>
            <p className="dashboard-text-muted mb-6">Generate your first webhook certificate to see it here.</p>
            <Link
              href="/tool"
              className="inline-flex items-center gap-2 dashboard-button-primary px-6 py-3 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Generate Certificate
            </Link>
          </div>
        ) : (
          <div className="dashboard-panel rounded-xl overflow-hidden">
            <table className="w-full dashboard-table">
              <thead className="border-b dashboard-border">
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
              <tbody className="divide-y divide-[var(--dash-border)]">
                {certificates.map((cert) => (
                  <tr key={cert.id} className="dashboard-row">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span className="font-mono text-sm text-slate-900">
                          {cert.report_id.slice(0, 8)}...
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <div className="flex items-center gap-2 text-sm dashboard-text-muted">
                        <Calendar className="w-3 h-3" />
                        {new Date(cert.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                        {cert.signature_status === 'verified' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 dashboard-accent-chip text-xs font-medium rounded-full" title={`Verified with ${cert.verification_method}`}>
                                <ShieldCheck className="w-3 h-3" />
                                Verified
                            </span>
                        )}
                        {cert.signature_status === 'failed' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 text-red-400 text-xs font-medium rounded-full border border-red-500/20" title={cert.verification_error || 'Verification Failed'}>
                                <ShieldAlert className="w-3 h-3" />
                                Failed
                            </span>
                        )}
                        {(cert.signature_status === 'not_verified' || !cert.signature_status) && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 dashboard-chip text-xs font-medium rounded-full" title="No signature verification performed">
                                <AlertTriangle className="w-3 h-3 text-slate-400" />
                                Unverified
                            </span>
                        )}
                    </td>
                    <td className="py-3 px-4">
                      {cert.is_pro ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 dashboard-accent-chip text-xs font-medium rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Pro
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 dashboard-chip text-xs font-medium rounded-full">
                          Free
                        </span>
                        )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-3">
                        <Link
                          href={`/tool?id=${cert.report_id}`}
                          className="inline-flex items-center gap-1 dashboard-text-muted hover:text-[var(--dash-text)] text-sm font-medium transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open
                        </Link>
                        {canExport && (
                          <a
                            href={`/tool?id=${cert.report_id}&download=1`}
                            className="inline-flex items-center gap-1 dashboard-text-muted hover:text-[var(--dash-text)] text-sm font-medium transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            PDF
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t dashboard-border bg-[var(--dash-surface-2)]">
                <p className="text-sm dashboard-text-muted">
                  Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount}
                </p>
                <div className="flex items-center gap-2">
                  {page > 1 ? (
                    <Link
                      href={`/dashboard?page=${page - 1}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium dashboard-button-secondary rounded-lg transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Prev
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-400 bg-[var(--dash-surface)] border dashboard-border rounded-lg cursor-not-allowed">
                      <ChevronLeft className="w-4 h-4" />
                      Prev
                    </span>
                  )}
                  <span className="text-sm dashboard-text-muted">
                    Page {page} of {totalPages}
                  </span>
                  {page < totalPages ? (
                    <Link
                      href={`/dashboard?page=${page + 1}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium dashboard-button-secondary rounded-lg transition-colors"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-400 bg-[var(--dash-surface)] border dashboard-border rounded-lg cursor-not-allowed">
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </DashboardClient>
    </main>
  );
}
