"use client";

import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { CertificateTemplate } from "@/components/CertificateTemplate";
import { Download, RefreshCw, AlertTriangle, CreditCard, CheckCircle, Mail } from "lucide-react";

export default function Home() {
  const [jsonInput, setJsonInput] = useState<string>("{\n  \"event\": \"payment.succeeded\",\n  \"amount\": 2000,\n  \"currency\": \"usd\"\n}");
  const [headersInput, setHeadersInput] = useState<string>("Stripe-Signature: t=123,v1=...\nContent-Type: application/json");
  const [status, setStatus] = useState<number>(200);
  const [timestamp, setTimestamp] = useState<string>("");
  const [reportId, setReportId] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Pro status
  const [isPro, setIsPro] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  // Hydration fix for UUID and Timestamp
  useEffect(() => {
    setTimestamp(new Date().toISOString());
    setReportId(uuidv4());
    
    // Check if user has purchased (from localStorage)
    const proEmail = localStorage.getItem('lanceiq_pro_email');
    if (proEmail) {
      setIsPro(true);
      setVerifyEmail(proEmail);
    }
  }, []);

  const handleDownload = async () => {
    setIsGenerating(true);
    setError(null);

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
        timestamp,
        status,
        id: reportId,
        showWatermark: !isPro
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
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webhook-proof-${reportId}.pdf`;
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
        alert('Failed to start checkout');
      }
    } catch (err) {
      console.error(err);
      alert('Error starting checkout');
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

                {!isPro && (
                  <div className="mt-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100">
                    <p className="text-sm text-slate-700 mb-3 font-medium">Remove watermark forever for just $9</p>
                    
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
                        Remove Watermark - $9
                    </button>
                    {!verifyEmail && (
                      <p className="text-xs text-slate-500 mt-2 text-center">We'll send your Pro key to this email.</p>
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

                {error && (
                    <div className="flex items-center gap-2 mt-3 text-red-600 text-sm bg-red-50 p-2 rounded">
                        <AlertTriangle className="w-4 h-4" />
                        {error}
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
