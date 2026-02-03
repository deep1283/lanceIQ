"use client";

import { useState, useEffect } from "react";
import QRCode from 'qrcode';
import { v4 as uuidv4 } from "uuid";
import { CertificateTemplate } from "@/components/CertificateTemplate";
import { Download, RefreshCw, AlertTriangle, CreditCard, CheckCircle, Mail, User, LogIn } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { saveCertificate } from "@/app/actions/certificates";
import Link from "next/link";

export default function Home() {
  const [jsonInput, setJsonInput] = useState<string>("{\n  \"event\": \"payment.succeeded\",\n  \"amount\": 2000,\n  \"currency\": \"usd\"\n}");
  const [headersInput, setHeadersInput] = useState<string>("Stripe-Signature: t=123,v1=...\nContent-Type: application/json");
  const [status, setStatus] = useState<number>(200);
  const [timestamp, setTimestamp] = useState<string>("");
  const [reportId, setReportId] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  
  // Pro status
  const [isPro, setIsPro] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const supabase = createClient();
  
  // Verification State
  const [hash, setHash] = useState<string>("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  // Hydration fix for UUID and Timestamp + Auth check
  useEffect(() => {
    setTimestamp(new Date().toISOString());
    setReportId(uuidv4());
    
    // 🎉 LAUNCH PROMO: Free watermark-free until Feb 6, 2026
    const PROMO_END_DATE = new Date('2026-02-06T23:59:59Z');
    const isPromoActive = new Date() < PROMO_END_DATE;
    
    if (isPromoActive) {
      setIsPro(true);
    } else {
      // Check if user has purchased (from localStorage)
      const proEmail = localStorage.getItem('lanceiq_pro_email');
      if (proEmail) {
        setIsPro(true);
        setVerifyEmail(proEmail);
      }
    }
    
    // Check auth state
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setAuthLoading(false);
    };
    checkAuth();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    
    return () => subscription.unsubscribe();
  }, []);

  // Generate Hash and QR Code
  useEffect(() => {
    const generateVerificationData = async () => {
      try {
        // 1. Generate SHA-256 Hash
        const msgBuffer = new TextEncoder().encode(jsonInput);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        setHash(hashHex);

        // 2. Generate QR Code
        // In production, this would be https://lanceiq.com/verify/${reportId}
        // For local dev, we can use localhost or just the production URL structure
        const verifyUrl = `https://lanceiq.com/verify/${reportId}`;
        const qrUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 100 });
        setQrCodeDataUrl(qrUrl);
      } catch (e) {
        console.error("Error generating verification data:", e);
      }
    };

    generateVerificationData();
  }, [jsonInput, reportId]);

  const handleDownload = async () => {
    setIsGenerating(true);
    setError(null);

    // Generate fresh credentials for this new certificate
    const newReportId = uuidv4();
    const newTimestamp = new Date().toISOString();
    
    // Update state to match (so preview updates if they stay on page)
    setReportId(newReportId);
    setTimestamp(newTimestamp);

    try {
      // Parse headers
      const parsedHeaders: Record<string, string> = {};
      headersInput.split('\n').forEach(line => {
        const [key, ...values] = line.split(':');
        if (key && values.length) {
          parsedHeaders[key.trim()] = values.join(':').trim();
        }
      });

      const data = {
        payload: jsonInput,
        headers: parsedHeaders,
        timestamp: newTimestamp, // Use new timestamp
        status,
        id: newReportId, // Use new ID
        showWatermark: !isPro,
        hash, // Note: This hash is based on the CURRENT render. If jsonInput hasn't changed, hash is same. Validation logic uses this.
        // API will generate its own QR code to ensure consistency in PDF environment
        verificationUrl: `https://lanceiq.com/verify/${newReportId}`
      };

      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('API Error:', errData);
        throw new Error(errData.error || 'Failed to generate PDF');
      }

      const blob = await res.blob();
      
      if (blob.size < 100) {
         console.error('Blob too small, likely error');
         throw new Error('Generated PDF is empty or invalid.');
      }
      
      // Save to database if user is logged in
      if (user) {
        try {
          const parsedPayload = JSON.parse(jsonInput);
          // Use the real SHA-256 hash we generated
          await saveCertificate({
            report_id: newReportId, // Use new ID
            payload: parsedPayload,
            headers: parsedHeaders,
            payload_hash: hash,
            is_pro: isPro,
          });
        } catch (saveErr) {
          console.error('Failed to save certificate:', saveErr);
          // Don't block download if save fails
        }
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webhook-proof-${newReportId}.pdf`;
      a.click();
    } catch (err) {
      setError("Failed to generate PDF. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const parsedHeadersPreview: Record<string, string> = {};
  headersInput.split('\n').forEach(line => {
      const [key, ...values] = line.split(':');
      if (key && values.length) {
          parsedHeadersPreview[key.trim()] = values.join(':').trim();
      }
  });

  const handleBuy = async () => {
    setCheckoutError(null);
    if (!verifyEmail || !verifyEmail.includes('@')) {
      setVerifyMessage("Please enter a valid email address first.");
      // Focus the input if possible, or just rely on the message
      return;
    }
    
    try {
      const res = await fetch('/api/dodo/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyEmail || undefined }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError('Failed to start checkout. Please try again.');
        setTimeout(() => setCheckoutError(null), 5000);
      }
    } catch (err) {
      console.error(err);
      setCheckoutError('Error connecting to payment provider.');
      setTimeout(() => setCheckoutError(null), 5000);
    }
  };

  const handleVerifyPurchase = async () => {
    if (!verifyEmail) {
      setVerifyMessage("Please enter your email");
      return;
    }
    
    setIsVerifying(true);
    setVerifyMessage(null);
    
    try {
      const res = await fetch('/api/dodo/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyEmail }),
      });
      
      const data = await res.json();
      
      if (data.paid) {
        setIsPro(true);
        localStorage.setItem('lanceiq_pro_email', verifyEmail);
        setVerifyMessage("✓ Purchase verified! Watermark removed.");
        setShowVerifyModal(false);
      } else {
        setVerifyMessage(data.message || "No purchase found for this email");
      }
    } catch (err) {
      setVerifyMessage("Failed to verify. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans">
      {/* LEFT: Input Form */}
      <div className="w-full md:w-1/2 p-6 md:p-12 overflow-y-auto border-r border-slate-200 bg-white z-10 shadow-sm">
        <div className="max-w-xl mx-auto space-y-8">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">LanceIQ Generator</h1>
              {isPro && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  PRO
                </span>
              )}
            </div>
            <p className="text-slate-500 text-sm">Create an official-looking delivery record provided by you.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Webhook Payload (JSON)</label>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                className="w-full h-64 p-4 font-mono text-xs text-slate-900 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:outline-none resize-none placeholder:text-slate-400"
                placeholder="{ ... }"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Headers</label>
              <textarea
                value={headersInput}
                onChange={(e) => setHeadersInput(e.target.value)}
                className="w-full h-32 p-4 font-mono text-xs text-slate-900 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:outline-none resize-none placeholder:text-slate-400"
                placeholder="Content-Type: application/json"
              />
              <p className="text-xs text-slate-400 mt-1">One header per line. Key: Value</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status Code</label>
                <input 
                  type="number" 
                  value={status}
                  onChange={(e) => setStatus(parseInt(e.target.value) || 0)}
                  className="w-full p-2 text-slate-900 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Timestamp (UTC)</label>
                <input 
                  type="text" 
                  value={timestamp}
                  readOnly
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed" 
                />
              </div>
            </div>
             
             <div className="pt-6">
                <button
                    onClick={handleDownload}
                    disabled={isGenerating}
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    {isGenerating ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                        <Download className="w-4 h-4" />
                    )}
                    {isGenerating ? 'Generating...' : isPro ? 'Download PDF (No Watermark)' : 'Download PDF (With Watermark)'}
                </button>

                {/* 🎉 LAUNCH PROMO BANNER */}
                <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-700 font-medium text-center">
                    🎉 Launch Week Special: Watermark-free for everyone until Feb 6!
                  </p>
                </div>

                {/* PAYMENT UI - COMMENTED OUT UNTIL DODO VERIFICATION IS COMPLETE
                {!isPro && (
                  <div className="mt-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100">
                    <p className="text-sm text-slate-700 mb-3 font-medium">Remove watermark forever for just $9.99</p>
                    
                    <input
                      type="email"
                      value={verifyEmail}
                      onChange={(e) => setVerifyEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full p-3 border border-slate-200 rounded-lg mb-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm text-black"
                    />
                    {verifyMessage && !isVerifying && (
                        <p className="text-sm text-red-600 mb-3 -mt-2">{verifyMessage}</p>
                    )}
                    
                    <button
                        onClick={handleBuy}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                        <CreditCard className="w-4 h-4" />
                        Remove Watermark - $9.99
                    </button>
                    {checkoutError && (
                        <p className="text-sm text-red-600 font-medium mt-2 text-center">{checkoutError}</p>
                    )}

                    <button
                        onClick={() => setShowVerifyModal(true)}
                        className="w-full flex items-center justify-center gap-2 text-indigo-600 hover:text-indigo-700 py-2 text-sm font-medium mt-2"
                    >
                        <Mail className="w-4 h-4" />
                        Already purchased? Verify with email
                    </button>
                  </div>
                )}
                END PAYMENT UI */}

                {error && (
                    <div className="flex items-center gap-2 mt-3 text-red-600 text-sm bg-red-50 p-2 rounded">
                        <AlertTriangle className="w-4 h-4" />
                        {error}
                    </div>
                )}
                
                {/* Login prompt for guests */}
                {!user && !authLoading && (
                  <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-500" />
                        <span className="text-sm text-slate-600">Log in to save your certificates</span>
                      </div>
                      <Link
                        href="/login"
                        className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        <LogIn className="w-3 h-3" />
                        Log In
                      </Link>
                    </div>
                  </div>
                )}
                
                {/* Logged in indicator */}
                {user && (
                  <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-sm text-green-700">Logged in — certificates will be saved</span>
                      </div>
                      <Link
                        href="/dashboard"
                        className="text-sm text-green-700 hover:text-green-800 font-medium underline"
                      >
                        View History
                      </Link>
                    </div>
                  </div>
                )}
                
                <p className="text-xs text-slate-400 text-center mt-3">
                    {isPro ? 'PRO: Generating watermark-free certificates.' : 'Free tier includes a watermark.'}
                </p>
             </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Preview */}
      <div className="w-full md:w-1/2 bg-slate-100 p-8 md:p-12 overflow-auto flex items-start justify-center relative">
        <div className="absolute inset-0 pattern-grid-lg opacity-5 pointer-events-none fixed" />
        
        <div className="relative w-full max-w-[210mm] aspect-[210/297] shadow-2xl origin-top transition-transform duration-300 transform scale-50 md:scale-75 lg:scale-90 bg-white shrink-0">
            <CertificateTemplate 
                id={reportId}
                payload={jsonInput}
                headers={parsedHeadersPreview}
                timestamp={timestamp}
                status={status}
                showWatermark={!isPro}
                hash={hash}
                verificationUrl={`https://lanceiq.com/verify/${reportId}`}
                qrCodeDataUrl={qrCodeDataUrl}
            />
        </div>
      </div>

      {/* Verify Modal */}
      {showVerifyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Verify Your Purchase</h3>
            <p className="text-sm text-slate-600 mb-4">Enter the email you used when purchasing to restore your PRO access.</p>
            
            <input
              type="email"
              value={verifyEmail}
              onChange={(e) => setVerifyEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full p-3 border border-slate-200 rounded-lg mb-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-black"
            />
            
            {verifyMessage && (
              <p className={`text-sm mb-3 ${verifyMessage.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>
                {verifyMessage}
              </p>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowVerifyModal(false)}
                className="flex-1 py-2 px-4 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyPurchase}
                disabled={isVerifying}
                className="flex-1 py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isVerifying ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
