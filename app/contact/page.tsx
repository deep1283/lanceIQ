import React from "react";
import Navbar from "@/components/Navbar";
import { Mail, Phone } from "lucide-react";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12">
        <div className="max-w-2xl w-full text-center space-y-8">
          <h1 className="text-4xl sm:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
            Contact Us
          </h1>
          <p className="text-gray-400 text-lg">
            Have questions about team plans or need support? Reach out directly.
          </p>

          <div className="grid gap-6 mt-12 w-full max-w-md mx-auto">
            {/* Email Card */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-4 hover:border-purple-500/50 transition-colors">
              <div className="p-3 rounded-full bg-purple-500/20">
                <Mail className="w-6 h-6 text-purple-400" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold text-gray-400">Email</h3>
                <a href="mailto:deepmishra1283@gmail.com" className="text-lg font-medium text-white hover:text-purple-300 transition-colors">
                  deepmishra1283@gmail.com
                </a>
              </div>
            </div>

            {/* Phone Card */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-4 hover:border-pink-500/50 transition-colors">
              <div className="p-3 rounded-full bg-pink-500/20">
                <Phone className="w-6 h-6 text-pink-400" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold text-gray-400">Mobile</h3>
                <a href="tel:+916294655027" className="text-lg font-medium text-white hover:text-pink-300 transition-colors">
                  +91 6294655027
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
