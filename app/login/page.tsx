"use client";

import { createClient } from "@/utils/supabase/client";
import { useState } from "react";
import { Loader2, Mail, CheckCircle } from "lucide-react";
import Navbar from "@/components/Navbar";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supabase = createClient();

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setMessage(null);
    
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
    } else {
      setSubmitted(true);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 p-8 rounded-2xl shadow-xl backdrop-blur-xl">
          
          {!submitted ? (
            <>
              <h1 className="text-3xl font-bold mb-2 text-center bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                Welcome to LanceIQ
              </h1>
              <p className="text-zinc-400 text-center mb-8">
                Sign in with your email to save certificates
              </p>

              <form onSubmit={handleMagicLink} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full bg-black/50 border border-zinc-700 rounded-lg pl-11 pr-4 py-3 focus:outline-none focus:border-purple-500 transition-colors"
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                {message && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300 text-center">
                    {message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Magic Link"}
                </button>
              </form>
              
              <p className="text-zinc-500 text-xs text-center mt-6">
                Use the same email you use for WebhookFix to link your accounts.
              </p>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
              <p className="text-zinc-400 mb-8 text-sm leading-relaxed">
                We sent a magic link to<br />
                <strong className="text-white text-base">{email}</strong>
              </p>
              <button 
                onClick={() => { setSubmitted(false); setEmail(''); }}
                className="text-sm text-zinc-500 hover:text-white transition-colors font-medium"
              >
                ← Use a different email
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
