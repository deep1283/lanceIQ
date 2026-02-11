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
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shadow-sm mb-6">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-bold text-xl text-slate-900 tracking-tight">
          LanceIQ
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings"
          className="text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
        >
          Settings
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-slate-600 hover:text-red-600 transition-colors text-sm font-medium"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </header>
  );
};

export default DashboardNavbar;
