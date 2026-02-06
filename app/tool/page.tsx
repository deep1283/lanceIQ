"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from 'qrcode';
import { v4 as uuidv4 } from "uuid";
import { CertificateTemplate } from "@/components/CertificateTemplate";
import { Download, RefreshCw, AlertTriangle, CheckCircle, User, LogIn, Lock, ShieldCheck } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { saveCertificate } from "@/app/actions/certificates";
import { checkProStatus } from "@/app/actions/subscription";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { VerifySignatureModal } from "@/components/VerifySignatureModal";
import type { VerificationApiResponse } from "@/lib/signature-verification";
import AppNavbar from "@/components/AppNavbar";

const PROMO_END_LOCAL = new Date(2026, 1, 6, 23, 59, 59, 999);

export default function Home() {
  const searchParams = useSearchParams();
  const certificateId = searchParams?.get('id');
  const autoDownload = searchParams?.get('download') === '1';
  const [jsonInput, setJsonInput] = useState<string>("{\n  \"event\": \"payment.succeeded\",\n  \"amount\": 2000,\n  \"currency\": \"usd\"\n}");
  const [headersInput, setHeadersInput] = useState<string>("Stripe-Signature: t=123,v1=...\nContent-Type: application/json");
  const [status, setStatus] = useState<number>(200);
  const [timestamp, setTimestamp] = useState<string>("");
  const [reportId, setReportId] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingCertificate, setIsLoadingCertificate] = useState(false);
  const [isExistingCertificate, setIsExistingCertificate] = useState(false);
  const [autoDownloaded, setAutoDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Plan status
  const [isPro, setIsPro] = useState(false);
  const [isWatermarkFree, setIsWatermarkFree] = useState(false);
  const [canVerify, setCanVerify] = useState(false);
  const [isPromoActive, setIsPromoActive] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  
  // Auth state
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  
  // Verification State
  const [hash, setHash] = useState<string>("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  // Signature Verification State (BYOS Phase 1)
  const [showSigVerifyModal, setShowSigVerifyModal] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationApiResponse | null>(null);

  const syncProStatus = async () => {
    const promoActive = Date.now() <= PROMO_END_LOCAL.getTime();
    setIsPromoActive(promoActive);

    try {
      const { isPro: dbPro, plan: currentPlan } = await checkProStatus();
      const watermarkFree = promoActive || dbPro;
      setIsPro(dbPro);
      setIsWatermarkFree(watermarkFree);
      setCanVerify(currentPlan !== 'free');
      return watermarkFree;
    } catch (err) {
      console.error("Failed to sync pro status:", err);
      setIsPro(false);
      setIsWatermarkFree(promoActive);
      setCanVerify(false);
      return promoActive;
    }
  };

  // Hydration fix for UUID and Timestamp + Auth check
  useEffect(() => {
    if (!certificateId) {
      setTimestamp(new Date().toISOString());
      setReportId(uuidv4());
    }
    
    const updatePromoState = () => {
      void syncProStatus();
    };

    updatePromoState();

    // Ensure UI flips when the promo window ends (local time).
    const msUntilEnd = PROMO_END_LOCAL.getTime() - Date.now();
    const promoTimeout =
      msUntilEnd > 0 ? window.setTimeout(updatePromoState, msUntilEnd + 1000) : undefined;
    
    // Check auth state
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setAuthLoading(false);
    };
    checkAuth();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      await syncProStatus();
    });
    
    return () => {
      subscription.unsubscribe();
      if (promoTimeout) {
        window.clearTimeout(promoTimeout);
      }
    };
  }, [supabase, certificateId]);

  useEffect(() => {
    if (!certificateId) {
      setIsExistingCertificate(false);
      return;
    }

    let cancelled = false;
    setIsLoadingCertificate(true);
    setError(null);

    fetch(`/api/certificates/${certificateId}`)
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || "Unable to load certificate.");
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const cert = data.certificate;
        const headers = (cert.headers ?? {}) as Record<string, string>;
        const payload = cert.payload ?? {};
        const hashValue = cert.raw_body_sha256 || cert.payload_hash || cert.hash || "";
        const lines = Object.entries(headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n");

        setReportId(cert.report_id);
        setTimestamp(cert.created_at);
        setJsonInput(JSON.stringify(payload, null, 2));
        setHeadersInput(lines);
        setHash(hashValue);
        setStatus(typeof cert.status_code === 'number' ? cert.status_code : 200);
        setIsExistingCertificate(true);

        setVerificationResult({
          status: cert.signature_status ?? 'not_verified',
          reason: cert.signature_status_reason ?? undefined,
          method: cert.verification_method ?? undefined,
          error: cert.verification_error ?? undefined,
          secretHint: cert.signature_secret_hint ?? undefined,
          toleranceUsedSec: cert.stripe_timestamp_tolerance_sec ?? undefined,
          provider: cert.provider ?? 'unknown',
          verifiedAt: cert.verified_at ?? null,
          rawBodySha256: hashValue || '',
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || "Unable to load certificate.");
        setIsExistingCertificate(false);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingCertificate(false);
      });

    return () => {
      cancelled = true;
    };
  }, [certificateId]);

  // Generate Hash and QR Code
  useEffect(() => {
    const generateVerificationData = async () => {
      try {
        if (!isExistingCertificate) {
          // 1. Generate SHA-256 Hash
          const msgBuffer = new TextEncoder().encode(jsonInput);
          const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          setHash(hashHex);
        }

        // 2. Generate QR Code
        // In production, this would be https://lanceiq.com/verify/${reportId}
        // For local dev, we can use localhost or just the production URL structure
        if (reportId) {
          const verifyUrl = `https://lanceiq.com/verify/${reportId}`;
          const qrUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 100 });
          setQrCodeDataUrl(qrUrl);
        }
      } catch (e) {
        console.error("Error generating verification data:", e);
      }
    };

    generateVerificationData();
  }, [jsonInput, reportId, isExistingCertificate]);

  const handleDownload = async (options?: { existing?: boolean }) => {
    const useExisting = options?.existing ?? false;
    setIsGenerating(true);
    setError(null);

    // Generate fresh credentials for this new certificate
    const newReportId = useExisting ? reportId : uuidv4();
    const newTimestamp = useExisting ? (timestamp || new Date().toISOString()) : new Date().toISOString();
    
    // Update state to match (so preview updates if they stay on page)
    if (!useExisting) {
      setReportId(newReportId);
      setTimestamp(newTimestamp);
    } else if (!timestamp) {
      setTimestamp(newTimestamp);
    }

    let pdfContainer: HTMLDivElement | null = null;
    let root: ReturnType<(typeof import('react-dom/client'))['createRoot']> | null = null;

    try {
      // Parse headers
      const parsedHeaders: Record<string, string> = {};
      headersInput.split('\n').forEach(line => {
        const [key, ...values] = line.split(':');
        if (key && values.length) {
          parsedHeaders[key.trim()] = values.join(':').trim();
        }
      });

      // Generate QR code if user is logged in
      let qrCodeDataUrl: string | undefined;
      if (user) {
        try {
          qrCodeDataUrl = await QRCode.toDataURL(`https://lanceiq.com/verify/${newReportId}`, { margin: 1, width: 100 });
        } catch (e) {
          console.error('Failed to generate QR code:', e);
        }
      }

      // Create a hidden div for PDF generation - no fixed dimensions, let content determine size
      pdfContainer = document.createElement('div');
      pdfContainer.id = 'pdf-container';
      pdfContainer.style.cssText = 'position: absolute; left: -9999px; top: 0; background: white; padding: 0; margin: 0;';
      document.body.appendChild(pdfContainer);

      // Import dependencies dynamically
      const { default: html2canvas } = await import('html2canvas-pro');
      const { default: jsPDF } = await import('jspdf');
      
      // Render certificate using React DOM
      const { createRoot } = await import('react-dom/client');
      const React = await import('react');
      const { CertificateTemplate } = await import('@/components/CertificateTemplate');

      // Render certificate to container
      root = createRoot(pdfContainer);
      root.render(
        React.createElement(CertificateTemplate, {
          id: newReportId,
          date: newTimestamp, // Corrected prop name based on recent update
          payload: jsonInput,
          headers: parsedHeaders,
          status,
          payloadHash: hash,
          
          showWatermark: !isWatermarkFree,
          verificationUrl: user ? `https://lanceiq.com/verify/${newReportId}` : undefined,
          qrCodeDataUrl,

          // Signature Verification Props
          signatureStatus: verificationResult?.status,
          verifiedAt: verificationResult?.verifiedAt ?? undefined,
          verificationMethod: verificationResult?.method,
          verificationError: verificationResult?.error,
          secretHint: verificationResult?.secretHint,
          toleranceUsedSec: verificationResult?.toleranceUsedSec,
        })
      );

      const waitForCertificateEl = async () => {
        const timeoutMs = 2500;
        const start = performance.now();
        // React render is async; poll until it exists (or timeout)
        while (performance.now() - start < timeoutMs) {
          const el = pdfContainer?.querySelector('#certificate-root') as HTMLElement | null;
          if (el) return el;
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        return null;
      };

      const certificateEl = await waitForCertificateEl();
      if (!certificateEl) {
        throw new Error('Certificate render failed');
      }

      // Wait for fonts and images to load before capturing
      await Promise.all([
        document.fonts.ready,
        ...Array.from(certificateEl.querySelectorAll('img')).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
              })
        ),
        new Promise((resolve) => setTimeout(resolve, 100)),
      ]);

      // Capture to canvas with html2canvas-pro (supports modern CSS)
      const canvas = await html2canvas(certificateEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      // Convert canvas to A4 PDF (mm) for consistent print sizing
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgProps = pdf.getImageProperties(imgData);
      const imgRatio = imgProps.width / imgProps.height;
      const pageRatio = pageWidth / pageHeight;

      let renderWidth = pageWidth;
      let renderHeight = pageHeight;
      if (imgRatio > pageRatio) {
        renderHeight = renderWidth / imgRatio;
      } else {
        renderWidth = renderHeight * imgRatio;
      }

      const x = (pageWidth - renderWidth) / 2;
      const y = (pageHeight - renderHeight) / 2;
      pdf.addImage(imgData, 'JPEG', x, y, renderWidth, renderHeight);
      pdf.save(`webhook-certificate-${newReportId}.pdf`);
      
      // Save to database if user is logged in (only for new certificates)
      if (user && !useExisting) {
        try {
          const parsedPayload = JSON.parse(jsonInput);
          const saveResult = await saveCertificate({
            report_id: newReportId,
            payload: parsedPayload,
            headers: parsedHeaders,
            payload_hash: hash,
            is_pro: isPro,
            status_code: status,
            verificationToken: verificationResult?.verificationToken,
          });
          if (!saveResult.success) {
            setError(saveResult.error || "Failed to save certificate.");
          }
        } catch (saveErr) {
          console.error('Failed to save certificate:', saveErr);
        }
      }
    } catch (e) {
      console.error('PDF Generation Error:', e);
      setError("Failed to generate PDF. Please try again.");
    } finally {
      try {
        root?.unmount();
      } catch {
        // ignore
      }
      if (pdfContainer?.parentNode) {
        pdfContainer.parentNode.removeChild(pdfContainer);
      }
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!autoDownload || !isExistingCertificate || autoDownloaded || isLoadingCertificate) return;
    if (!reportId || !timestamp) return;
    setAutoDownloaded(true);
    void handleDownload({ existing: true });
  }, [autoDownload, isExistingCertificate, autoDownloaded, isLoadingCertificate, reportId, timestamp]);

  const parsedHeadersPreview: Record<string, string> = {};
  headersInput.split('\n').forEach(line => {
      const [key, ...values] = line.split(':');
      if (key && values.length) {
          parsedHeadersPreview[key.trim()] = values.join(':').trim();
      }
  });

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
        if (!user) {
          setVerifyMessage("Payment verified. Please log in to unlock Pro.");
          return;
        }

        const proNow = await syncProStatus();
        setVerifyMessage(proNow ? "✓ Purchase verified! Pro unlocked." : "Purchase verified. Pro will activate shortly.");
        setShowVerifyModal(false);
      } else {
        setVerifyMessage(data.message || "No purchase found for this email");
      }
    } catch (e) {
      console.error(e);
      setVerifyMessage("Failed to verify. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans pt-16">
      <AppNavbar user={user} />
      <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)]">
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
              {!isPro && isPromoActive && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
                  <ShieldCheck className="w-3 h-3" />
                  PROMO
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

            {/* Signature Verification Triggers */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between">
                 <div>
                   <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                     <Lock className="w-4 h-4 text-slate-500" />
                     Signature Verification
                   </h3>
                   <p className="text-xs text-slate-500 mt-1">
                     Verify authenticity with your webhook secret.
                   </p>
                 </div>
                 
                 {verificationResult?.status === 'verified' ? (
                   <div className="flex items-center gap-2 text-green-700 bg-green-100 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm">
                     <ShieldCheck className="w-3.5 h-3.5" />
                     VERIFIED
                   </div>
                 ) : (
                   canVerify ? (
                     <button
                       onClick={() => setShowSigVerifyModal(true)}
                       className="px-3 py-1.5 bg-white border border-slate-300 shadow-sm text-slate-700 text-xs font-medium rounded-md hover:bg-slate-50 transition-colors"
                     >
                       Verify Signature...
                     </button>
                   ) : (
                     <Link
                       href={user ? "/pricing" : "/login"}
                       className="px-3 py-1.5 bg-white border border-slate-300 shadow-sm text-slate-700 text-xs font-medium rounded-md hover:bg-slate-50 transition-colors"
                     >
                       {user ? "Upgrade to Verify" : "Log In to Verify"}
                     </Link>
                   )
                 )}
              </div>
              
              {verificationResult?.status === 'failed' && (
                <p className="text-xs text-red-600 mt-2 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Last attempt failed: {verificationResult.error}
                </p>
              )}
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
                    onClick={() => handleDownload()}
                    disabled={isGenerating}
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    {isGenerating ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                        <Download className="w-4 h-4" />
                    )}
                    {isGenerating ? 'Generating...' : isWatermarkFree ? 'Download PDF (No Watermark)' : 'Download PDF (With Watermark)'}
                </button>

                {/* 🎉 LAUNCH PROMO BANNER */}
                {isPromoActive && !isPro && (
                  <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                    <p className="text-sm text-green-700 font-medium text-center">
                      🎉 Launch Week Special: Watermark-free for everyone through Feb 6, 2026 (local time).
                    </p>
                  </div>
                )}

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
                    <p className="text-xs text-slate-400 mt-2">Sign in to enable QR code verification on your certificates</p>
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
                    {isWatermarkFree ? 'Watermark-free certificates enabled.' : 'Free tier includes a watermark.'}
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
                date={timestamp}
                payload={jsonInput}
                headers={parsedHeadersPreview}
                status={status}
                payloadHash={hash}
                
                showWatermark={!isWatermarkFree}
                verificationUrl={user ? `https://lanceiq.com/verify/${reportId}` : undefined}
                qrCodeDataUrl={qrCodeDataUrl}

                // Signature Verification Props
                signatureStatus={verificationResult?.status}
                // For preview, we use local time if verified, or just show current state
                verifiedAt={verificationResult?.verifiedAt ?? undefined}
                verificationMethod={verificationResult?.method}
                verificationError={verificationResult?.error}
                secretHint={verificationResult?.secretHint}
                toleranceUsedSec={verificationResult?.toleranceUsedSec}
            />
        </div>
      </div>

      {/* Verify Modal */}
      <VerifySignatureModal 
        isOpen={showSigVerifyModal}
        onClose={() => setShowSigVerifyModal(false)}
        rawBody={jsonInput}
        headers={parsedHeadersPreview}
        // Ideally pass certificateId if saved, but for new generation flow we verify first then save
        // If user is saved, we have reportId.
        // We can pass reportId. API will update DB if it matches this reportId for this user.
        reportId={reportId} 
        canVerify={canVerify}
        upgradeHref={user ? "/pricing" : "/login"}
        onVerified={(res) => {
          setVerificationResult(res);
          // If successful, we might want to close modal automatically or let user close
          // Let's keep it open for a moment or close it? 
          // Result is shown in modal. Let user close.
        }}
      />

      {/* Verify Purchase Modal (Existing) */}
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
    </div>
  );
}
