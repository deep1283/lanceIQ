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
} from 'lucide-react';

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
  },
  {
    key: 'audit',
    label: 'Audit Logs',
    href: '/dashboard/admin?section=audit',
    icon: ScrollText,
  },
  {
    key: 'legal',
    label: 'Legal Hold',
    href: '/dashboard/admin?section=legal',
    icon: Gavel,
  },
  {
    key: 'members',
    label: 'Team Members',
    href: '/dashboard/admin?section=members',
    icon: Users,
  },
  {
    key: 'identity',
    label: 'SSO & SCIM',
    href: '/dashboard/admin?section=identity',
    icon: ShieldCheck,
  },
  {
    key: 'access',
    label: 'Access Reviews',
    href: '/dashboard/admin?section=access',
    icon: ClipboardList,
  },
  {
    key: 'ops',
    label: 'SLA & Incidents',
    href: '/dashboard/admin?section=ops',
    icon: Activity,
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

export default function DashboardSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  const section = searchParams.get('section') || 'alerts';

  const isDashboard = pathname === '/dashboard';
  const isAdmin = pathname.startsWith('/dashboard/admin');

  const isActive = (itemKey: string) => {
    if (itemKey === 'settings') return pathname.startsWith('/dashboard/settings');
    if (itemKey === 'certificates') return isDashboard && (tab === 'certificates' || !tab);
    if (itemKey === 'sources') return isDashboard && tab === 'sources';
    if (itemKey === 'overview') return isDashboard && !tab;
    if (isAdmin) return section === itemKey;
    return false;
  };

  const renderItem = (item: { key: string; label: string; href: string; icon: ElementType }) => {
    const Icon = item.icon;
    const active = isActive(item.key);
    return (
      <Link
        key={item.key}
        href={item.href}
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 dashboard-focus-ring ${
          active
            ? 'bg-[var(--dash-surface-2)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] before:absolute before:left-1 before:top-1/2 before:h-4 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-[var(--dash-accent)] before:opacity-70'
            : 'text-zinc-400 hover:text-white hover:bg-[var(--dash-surface-2)]'
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap opacity-0 translate-x-2 transition-all duration-100 group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 group-hover/sidebar:delay-150">
          {item.label}
        </span>
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
