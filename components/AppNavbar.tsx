"use client";

import React from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard } from "lucide-react";

import { User } from "@supabase/supabase-js";

interface AppNavbarProps {
  user?: User | null;
}

const AppNavbar: React.FC<AppNavbarProps> = ({ user }) => {
  const supabase = createClient();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shadow-sm">
      <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight text-slate-900">
        LanceIQ
      </Link>

      {user ? (
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition-colors text-sm font-medium"
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
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
