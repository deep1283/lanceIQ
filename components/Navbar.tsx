"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
// Using string path for public assets since standard imports might be tricky without configured aliases
// or if the files are just in public. Next.js serves public folder at root.

const Navbar: React.FC = () => {
  const [user, setUser] = React.useState<SupabaseUser | null>(null);
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();

  React.useEffect(() => {
    const setInitialUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    setInitialUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md h-17 flex items-center justify-between px-6 py-3 space-y-0">
      {/* Logo */}
      <Link href="/">
        <div className="relative w-36 h-10">
          <Image 
            src="/assets/lancelogo.png" 
            alt="LanceIQ Logo" 
            fill
            className="object-contain"
            priority 
          />
        </div>
      </Link>

      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-4">
            <span className="text-zinc-400 text-sm hidden sm:block">
              {user.email}
            </span>
            <button
              onClick={handleLogout}
              className="text-zinc-400 hover:text-white text-sm transition-colors"
            >
              Sign Out
            </button>
            <Link
              href="/dashboard/settings"
              className="text-zinc-400 hover:text-white text-sm transition-colors"
            >
              Settings
            </Link>
            <Link
              href="/dashboard"
              className="bg-[#5425B0] rounded-full text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold hover:scale-105 transition-transform duration-300 hover:cursor-pointer"
            >
              DASHBOARD
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-4">
             <Link
              href="/login"
              className="text-zinc-400 hover:text-white text-sm transition-colors font-medium"
            >
              Log In
            </Link>
            <Link
              href="/tool"
              className="bg-[#5425B0] rounded-full text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold hover:scale-105 transition-transform duration-300 hover:cursor-pointer"
            >
              GET STARTED
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
