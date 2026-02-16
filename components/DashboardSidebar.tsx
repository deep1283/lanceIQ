'use client';

import type { ElementType } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Bell,
  ScrollText,
  Users,
  ShieldCheck,
  ClipboardList,
  Activity,
  Settings,
  Gavel,
  Lock,
  GitCompareArrows,
} from 'lucide-react';
import type { PlanEntitlements } from '@/lib/plan';

const primaryItems = [
  {
    key: 'overview',
    label: 'Overview',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
];

const adminItems = [
  {
    key: 'alerts',
    label: 'Smart Alerts',
    href: '/dashboard/admin?section=alerts',
    icon: Bell,
    teamOnly: true,
  },
  {
    key: 'audit',
    label: 'Audit Logs',
    href: '/dashboard/admin?section=audit',
    icon: ScrollText,
    teamOnly: true,
  },
  {
    key: 'legal',
    label: 'Legal Hold',
    href: '/dashboard/admin?section=legal',
    icon: Gavel,
    teamOnly: true,
  },
  {
    key: 'members',
    label: 'Team Members',
    href: '/dashboard/admin?section=members',
    icon: Users,
    teamOnly: true,
  },
  {
    key: 'identity',
    label: 'SSO & SCIM',
    href: '/dashboard/admin?section=identity',
    icon: ShieldCheck,
    teamOnly: true,
  },
  {
    key: 'access',
    label: 'Access Reviews',
    href: '/dashboard/admin?section=access',
    icon: ClipboardList,
    teamOnly: true,
  },
  {
    key: 'ops',
    label: 'SLA & Incidents',
    href: '/dashboard/admin?section=ops',
    icon: Activity,
    teamOnly: true,
  },
  {
    key: 'reconciliation',
    label: 'Reconciliation',
    href: '/dashboard/admin?section=reconciliation',
    icon: GitCompareArrows,
    teamOnly: true,
  },
];

const footerItems = [
  {
    key: 'settings',
    label: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
  },
];

const TEAM_FEATURE_TITLE = 'Team Feature';
const TEAM_FEATURE_BODY = 'Available on Team plan.';

type SidebarEntitlements = PlanEntitlements & {
  isPro: boolean;
};

export default function DashboardSidebar({ initialEntitlements }: { initialEntitlements: SidebarEntitlements }) {
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const tab = searchParams?.get('tab');
  const section = searchParams?.get('section') || 'alerts';
  const workspaceId = searchParams?.get('workspace_id');

  const isDashboard = pathname === '/dashboard';
  const isAdmin = pathname.startsWith('/dashboard/admin');

  const teamEntitlementBySection: Record<string, boolean> = {
    alerts: initialEntitlements.canUseAlerts,
    audit: initialEntitlements.canViewAuditLogs,
    legal: initialEntitlements.canUseLegalHold,
    members: initialEntitlements.canViewAuditLogs,
    identity: initialEntitlements.canUseSso,
    access: initialEntitlements.canUseAccessReviews,
    ops: initialEntitlements.canUseSlaIncidents,
    reconciliation: initialEntitlements.canUseReconciliation,
  };

  const isActive = (itemKey: string) => {
    if (itemKey === 'settings') return pathname.startsWith('/dashboard/settings');
    if (itemKey === 'certificates') return isDashboard && (tab === 'certificates' || !tab);
    if (itemKey === 'sources') return isDashboard && tab === 'sources';
    if (itemKey === 'overview') return isDashboard && !tab;
    if (isAdmin) return section === itemKey;
    return false;
  };

  const withWorkspaceHint = (href: string) => {
    if (!workspaceId) return href;
    const [basePath, query = ''] = href.split('?');
    const params = new URLSearchParams(query);
    params.set('workspace_id', workspaceId);
    return `${basePath}?${params.toString()}`;
  };

  const renderItem = (item: { key: string; label: string; href: string; icon: ElementType; teamOnly?: boolean }) => {
    const Icon = item.icon;
    const active = isActive(item.key);
    const entitled = teamEntitlementBySection[item.key] ?? true;
    const locked = Boolean(item.teamOnly && !entitled);

    const activeClasses = locked
      ? 'bg-[var(--dash-surface-2)]/80 text-zinc-200 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] before:absolute before:left-1 before:top-1/2 before:h-4 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-zinc-500 before:opacity-70'
      : 'bg-[var(--dash-surface-2)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] before:absolute before:left-1 before:top-1/2 before:h-4 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-[var(--dash-accent)] before:opacity-70';
    const inactiveClasses = locked
      ? 'text-zinc-500 hover:text-zinc-300 hover:bg-[var(--dash-surface-2)]/60'
      : 'text-zinc-400 hover:text-white hover:bg-[var(--dash-surface-2)]';

    return (
      <Link
        key={item.key}
        href={withWorkspaceHint(item.href)}
        title={locked ? `${TEAM_FEATURE_TITLE}: ${TEAM_FEATURE_BODY}` : item.label}
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 dashboard-focus-ring ${
          active ? activeClasses : inactiveClasses
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap opacity-0 translate-x-2 transition-all duration-100 group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 group-hover/sidebar:delay-150">
          {item.label}
        </span>
        {locked && <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-500" />}
      </Link>
    );
  };

  return (
    <aside className="group/sidebar fixed left-0 top-0 z-40 h-screen w-16 hover:w-64 transition-[width,box-shadow] duration-200 bg-[var(--dash-surface-3)] border-r dashboard-border overflow-hidden shadow-[0_0_0_1px_rgba(15,23,42,0.06)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
      <div className="flex h-full flex-col px-2 py-4">
        <div className="mb-3 px-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500 opacity-0 transition-all duration-100 group-hover/sidebar:opacity-100 group-hover/sidebar:delay-150">
          LanceIQ
        </div>
        <div className="space-y-1">
          {primaryItems.map(renderItem)}
        </div>
        <div className="mt-6 px-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500 opacity-0 transition-all duration-100 group-hover/sidebar:opacity-100 group-hover/sidebar:delay-150">
          Admin
        </div>
        <div className="mt-2 space-y-1">
          {adminItems.map(renderItem)}
        </div>
        <div className="mt-auto space-y-1 pt-6">
          {footerItems.map(renderItem)}
        </div>
      </div>
    </aside>
  );
}
