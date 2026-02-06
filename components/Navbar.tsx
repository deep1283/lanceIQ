"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
// Using string path for public assets since standard imports might be tricky without configured aliases
// or if the files are just in public. Next.js serves public folder at root.

const Navbar: React.FC = () => {
  const [user, setUser] = React.useState<SupabaseUser | null>(null);
  const supabase = React.useMemo(() => createClient(), []);

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

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black h-17 flex items-center justify-between px-6 py-3 space-y-0">
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
            <Link 
              href="/dashboard"
              className="text-white hover:text-zinc-200 text-sm transition-colors font-medium"
            >
              {user.email}
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-4">
             <Link
              href="/pricing"
              className="text-white hover:text-zinc-200 text-sm transition-colors font-medium"
            >
              Pricing
            </Link>
             <Link
              href="/login"
              className="text-white hover:text-zinc-200 text-sm transition-colors font-medium"
            >
              Log In
            </Link>
             <Link
              href="/contact"
              className="text-white hover:text-zinc-200 text-sm transition-colors font-medium ml-4"
            >
              Contact Us
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
