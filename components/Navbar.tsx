"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
// Using string path for public assets since standard imports might be tricky without configured aliases
// or if the files are just in public. Next.js serves public folder at root.

const Navbar: React.FC = () => {
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

      <div className="flex items-center gap-2">
        <Link
          href="/tool"
          className="bg-[#5425B0] rounded-full text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold hover:scale-105 transition-transform duration-300 hover:cursor-pointer"
        >
          GET STARTED
        </Link>
      </div>
    </header>
  );
};

export default Navbar;
