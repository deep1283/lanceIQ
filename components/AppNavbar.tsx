"use client";

import React from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard } from "lucide-react";

import { User } from "@supabase/supabase-js";

interface AppNavbarProps {
  user?: User | null;
  plan?: string;
}

const AppNavbar: React.FC<AppNavbarProps> = ({ user, plan }) => {
  const supabase = createClient();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  const getBadge = () => {
    if (plan === 'team') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 mr-2 border border-blue-200 uppercase tracking-wide">
          Team
        </span>
      );
    }
    if (plan === 'pro') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-700 mr-2 border border-indigo-200 uppercase tracking-wide">
          Pro
        </span>
      );
    }
    return null;
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shadow-sm">
      <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight text-slate-900">
        LanceIQ
      </Link>

      {user ? (
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            {getBadge()}
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition-colors text-sm font-medium"
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </Link>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-slate-600 hover:text-red-600 transition-colors text-sm font-medium ml-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-4">
             <Link
            href="/login"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Log In
          </Link>
          <Link
            href="/login?view=sign_up"
             className="text-sm font-medium px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            Sign Up
          </Link>
        </div>
      )}
    </header>
  );
};

export default AppNavbar;
