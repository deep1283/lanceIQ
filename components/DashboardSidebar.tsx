'use client';

import type { ElementType } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Terminal,
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
  {
    key: 'certificates',
    label: 'Certificates',
    href: '/dashboard?tab=certificates',
    icon: FileText,
  },
  {
    key: 'sources',
    label: 'Sources & Ingestion',
    href: '/dashboard?tab=sources',
    icon: Terminal,
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
        className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? 'bg-zinc-800 text-white'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <aside className="group/sidebar fixed left-0 top-0 z-40 h-screen w-14 hover:w-56 transition-all duration-200 bg-zinc-950 border-r border-zinc-900 overflow-hidden">
      <div className="flex h-full flex-col px-2 py-4">
        <div className="mb-4 px-2 text-xs uppercase tracking-widest text-zinc-500 opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
          LanceIQ
        </div>
        <div className="space-y-1">
          {primaryItems.map(renderItem)}
        </div>
        <div className="mt-6 px-2 text-[10px] uppercase tracking-widest text-zinc-500 opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
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
