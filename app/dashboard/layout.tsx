import DashboardThemeProvider from "@/components/DashboardThemeProvider";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardNavbar from "@/components/DashboardNavbar";
import { createClient } from "@/utils/supabase/server";
import { checkPlanEntitlements } from "@/app/actions/subscription";
import { getPlanEntitlements } from "@/lib/plan";
import { resolveWorkspaceContext } from "@/lib/workspace-context";
import { cookies } from "next/headers";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const freeEntitlements = {
    isPro: false,
    ...getPlanEntitlements('free'),
  };

  let sidebarEntitlements = freeEntitlements;

  if (user) {
    const cookieStore = await cookies();
    const workspaceIdCookie = cookieStore.get('lanceiq_workspace_id')?.value ?? null;
    const context = await resolveWorkspaceContext({
      supabase,
      userId: user.id,
      workspaceIdCookie,
    });
    if (context?.workspaceId) {
      sidebarEntitlements = await checkPlanEntitlements(context.workspaceId);
    }
  }

  return (
    <DashboardThemeProvider>
      <div className="min-h-screen flex">
        <DashboardSidebar initialEntitlements={sidebarEntitlements} />
        <div className="flex-1 pl-16">
          <DashboardNavbar />
          {children}
        </div>
      </div>
    </DashboardThemeProvider>
  );
}
