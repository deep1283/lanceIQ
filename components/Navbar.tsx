"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
// Using string path for public assets since standard imports might be tricky without configured aliases
// or if the files are just in public. Next.js serves public folder at root.

import { Menu, X } from "lucide-react";

const Navbar: React.FC = () => {
  const [user, setUser] = React.useState<SupabaseUser | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
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

  const toggleMenu = () => setIsOpen(!isOpen);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black border-b border-white/10">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Logo */}
        <Link href="/">
          <div className="relative w-[140px] h-[66px]">
            <Image 
              src="/assets/lancelogo.png" 
              alt="LanceIQ Logo" 
              fill
              className="object-cover"
              priority 
            />
          </div>
        </Link>
        
        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <>
              <Link href="/pricing" className="text-white hover:text-zinc-200 text-sm transition-colors font-medium">Pricing</Link>
              <Link href="/contact" className="text-white hover:text-zinc-200 text-sm transition-colors font-medium">Contact Us</Link>
              <Link href="/dashboard" className="text-white hover:text-zinc-200 text-sm transition-colors font-medium">{user.email}</Link>
            </>
          ) : (
            <>
              <Link href="/pricing" className="text-white hover:text-zinc-200 text-sm transition-colors font-medium">Pricing</Link>
              <Link href="/login" className="text-white hover:text-zinc-200 text-sm transition-colors font-medium">Log In</Link>
              <Link href="/contact" className="text-white hover:text-zinc-200 text-sm transition-colors font-medium ml-4">Contact Us</Link>
            </>
          )}
        </div>

        {/* Mobile Toggle */}
        <button className="md:hidden text-white p-2" onClick={toggleMenu} aria-label="Toggle menu">
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-zinc-900 border-t border-white/10 px-6 py-4 flex flex-col space-y-4 shadow-xl">
          {user ? (
            <>
              <Link href="/pricing" className="text-white hover:text-purple-400 text-base font-medium py-2" onClick={toggleMenu}>Pricing</Link>
              <Link href="/contact" className="text-white hover:text-purple-400 text-base font-medium py-2" onClick={toggleMenu}>Contact Us</Link>
              <Link href="/dashboard" className="text-white hover:text-purple-400 text-base font-medium py-2" onClick={toggleMenu}>Dashboard ({user.email})</Link>
            </>
          ) : (
            <>
              <Link href="/pricing" className="text-white hover:text-purple-400 text-base font-medium py-2" onClick={toggleMenu}>Pricing</Link>
              <Link href="/login" className="text-white hover:text-purple-400 text-base font-medium py-2" onClick={toggleMenu}>Log In</Link>
              <Link href="/contact" className="text-white hover:text-purple-400 text-base font-medium py-2" onClick={toggleMenu}>Contact Us</Link>
            </>
          )}
        </div>
      )}
    </header>
  );
};

export default Navbar;
