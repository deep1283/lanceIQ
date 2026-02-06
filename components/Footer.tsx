import React from "react";
import Link from "next/link";

const Footer: React.FC = () => {
  return (
    <footer className="flex flex-col justify-center items-center py-8 bg-gray-900 text-white border-t border-gray-800">
      <div className="flex flex-wrap justify-center gap-6 mb-4 text-sm text-gray-400">
        <Link href="/security" className="hover:text-white transition-colors">Security</Link>
        <Link href="/dpa" className="hover:text-white transition-colors">DPA</Link>
        <Link href="/subprocessors" className="hover:text-white transition-colors">Subprocessors</Link>
        <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-white transition-colors">Terms & Conditions</Link>
        <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
      </div>
      <p className="font-extralight text-sm sm:text-base text-gray-500">
        &copy; LanceIQ {new Date().getFullYear()}. All rights reserved.
      </p>
    </footer>
  );
};

export default Footer;
