"use client";

import React from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

const DashboardNavbar: React.FC = () => {
  const supabase = createClient();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 h-16 flex items-center justify-between px-6 border-b dashboard-border bg-[var(--dash-surface)] mb-8">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-semibold text-lg tracking-tight text-slate-900">
          LanceIQ
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings"
          className="text-sm font-medium dashboard-text-muted hover:text-[var(--dash-text)] transition-colors"
        >
          Settings
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm font-medium dashboard-text-muted hover:text-red-500 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </header>
  );
};

export default DashboardNavbar;
