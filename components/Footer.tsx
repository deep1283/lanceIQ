import React from "react";
import Link from "next/link";

const Footer: React.FC = () => {
  return (
    <footer className="flex flex-col justify-center items-center py-8 bg-gray-900 text-white border-t border-gray-800">
      <div className="max-w-3xl text-center mb-6 px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Scope of Proof</p>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          This certificate attests only to receipt by LanceIQ at the timestamp shown, the payload and headers received,
          and the verification status computed. It does not attest to upstream provider intent, downstream processing,
          or financial settlement.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-6 mb-4 text-sm text-gray-400">
        <Link href="/compliance" className="hover:text-white transition-colors">Compliance</Link>
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
