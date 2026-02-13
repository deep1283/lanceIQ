"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from 'qrcode';
import { v4 as uuidv4 } from "uuid";
import { CertificateTemplate } from "@/components/CertificateTemplate";
import { Download, RefreshCw, AlertTriangle, CheckCircle, User, LogIn, Lock, ShieldCheck } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { saveCertificate } from "@/app/actions/certificates";
import { checkPlanEntitlements } from "@/app/actions/subscription";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { VerifySignatureModal } from "@/components/VerifySignatureModal";
import type { VerificationApiResponse } from "@/lib/signature-verification";
import { canExportCertificates } from "@/lib/roles";
import AppNavbar from "@/components/AppNavbar";

const PROMO_END_LOCAL = new Date(2026, 1, 6, 23, 59, 59, 999);

type TimestampReceipt = {
  anchoredHash: string | null;
  transactionId: string | null;
  proofData: string | null;
  tsaUrl: string | null;
  chainName: string | null;
  blockHeight: number | null;
  createdAt: string | null;
};

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
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Plan status
  const [isPro, setIsPro] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<string>("free");
  const [isWatermarkFree, setIsWatermarkFree] = useState(false);
  const [canRemoveWatermark, setCanRemoveWatermark] = useState(false);
  const [canExportPdf, setCanExportPdf] = useState(false);
  const [canVerify, setCanVerify] = useState(false);
  const [isPromoActive, setIsPromoActive] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceRole, setWorkspaceRole] = useState<string | null>(null);
  const [rawBodyExpiresAt, setRawBodyExpiresAt] = useState<string | null>(null);
  const [rawBodyPresent, setRawBodyPresent] = useState<boolean | null>(null);
  const [retentionPolicyLabel, setRetentionPolicyLabel] = useState<string | null>(null);
  const [timestampReceipt, setTimestampReceipt] = useState<TimestampReceipt | null>(null);
  const [timestampReceiptLoading, setTimestampReceiptLoading] = useState(false);
  const [timestampReceiptError, setTimestampReceiptError] = useState<string | null>(null);
  
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
  const workspaceIdRef = useRef<string | null>(null);

  const canExportByRole = !user || canExportCertificates(workspaceRole);
  const canExportPdfAllowed = canExportByRole && canExportPdf;

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  const syncProStatus = async (workspaceScopeId?: string | null) => {
    const promoActive = Date.now() <= PROMO_END_LOCAL.getTime();
    setIsPromoActive(promoActive);

    // Strict workspace-scoped gating: never resolve paid entitlements without workspace context.
    if (!workspaceScopeId) {
      setIsPro(false);
      setCurrentPlan('free');
      setIsWatermarkFree(promoActive);
      setCanRemoveWatermark(false);
      setCanExportPdf(false);
      setCanVerify(false);
      return promoActive;
    }

    try {
      const {
        isPro: dbPro,
        plan: planTier,
        canRemoveWatermark: watermarkEntitlement,
        canExportPdf: pdfEntitlement,
        canVerify: verifyEntitlement,
      } = await checkPlanEntitlements(workspaceScopeId);
      const watermarkFree = promoActive || watermarkEntitlement;
      setIsPro(dbPro);
      setCurrentPlan(planTier);
      setIsWatermarkFree(watermarkFree);
      setCanRemoveWatermark(watermarkEntitlement);
      setCanExportPdf(pdfEntitlement);
      setCanVerify(verifyEntitlement);
      return watermarkFree;
    } catch (err) {
      console.error("Failed to sync pro status:", err);
      setIsPro(false);
      setCurrentPlan('free');
      setIsWatermarkFree(promoActive);
      setCanRemoveWatermark(false);
      setCanExportPdf(false);
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
      void syncProStatus(workspaceIdRef.current);
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
      if (!session?.user) {
        await syncProStatus(null);
      }
    });
    
    return () => {
      subscription.unsubscribe();
      if (promoTimeout) {
        window.clearTimeout(promoTimeout);
      }
    };
  }, [supabase, certificateId]);

  useEffect(() => {
    void syncProStatus(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (!user) {
      setWorkspaceId(null);
      setWorkspaceRole(null);
      setTimestampReceipt(null);
      setTimestampReceiptError(null);
      setTimestampReceiptLoading(false);
      return;
    }

    let cancelled = false;

    const loadWorkspaceContext = async () => {
      const { data: membership, error: membershipError } = await supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (cancelled) return;

      if (membershipError || !membership) {
        setWorkspaceId(null);
        setWorkspaceRole(null);
        return;
      }

      setWorkspaceId(membership.workspace_id);
      setWorkspaceRole(membership.role);
    };

    loadWorkspaceContext();

    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  useEffect(() => {
    if (!workspaceId || !isExistingCertificate || !hash) {
      setTimestampReceipt(null);
      setTimestampReceiptError(null);
      setTimestampReceiptLoading(false);
      return;
    }

    let cancelled = false;
    setTimestampReceiptLoading(true);
    setTimestampReceiptError(null);

    const fetchTimestampReceipt = async () => {
      const { data: ingestedEvents, error: ingestedError } = await supabase
        .from('ingested_events')
        .select('id, received_at')
        .eq('workspace_id', workspaceId)
        .eq('raw_body_sha256', hash)
        .order('received_at', { ascending: false })
        .limit(1);

      if (cancelled) return;

      if (ingestedError) {
        setTimestampReceipt(null);
        setTimestampReceiptError(ingestedError.message || 'Failed to load timestamp receipt.');
        setTimestampReceiptLoading(false);
        return;
      }

      const ingestedEvent = Array.isArray(ingestedEvents) ? ingestedEvents[0] : null;
      if (!ingestedEvent?.id) {
        setTimestampReceipt(null);
        setTimestampReceiptLoading(false);
        return;
      }

      const { data: receipts, error: receiptError } = await supabase
        .from('timestamp_receipts')
        .select('anchored_hash, transaction_id, proof_data, tsa_url, chain_name, block_height, created_at')
        .eq('workspace_id', workspaceId)
        .eq('resource_type', 'ingested_event')
        .eq('resource_id', ingestedEvent.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (cancelled) return;

      if (receiptError) {
        setTimestampReceipt(null);
        setTimestampReceiptError(receiptError.message || 'Failed to load timestamp receipt.');
        setTimestampReceiptLoading(false);
        return;
      }

      const receipt = Array.isArray(receipts) ? receipts[0] : null;
      if (!receipt) {
        setTimestampReceipt(null);
        setTimestampReceiptLoading(false);
        return;
      }

      setTimestampReceipt({
        anchoredHash: receipt.anchored_hash ?? null,
        transactionId: receipt.transaction_id ?? null,
        proofData: typeof receipt.proof_data === 'string'
          ? receipt.proof_data
          : receipt.proof_data
            ? JSON.stringify(receipt.proof_data)
            : null,
        tsaUrl: receipt.tsa_url ?? null,
        chainName: receipt.chain_name ?? null,
        blockHeight: typeof receipt.block_height === 'number' ? receipt.block_height : null,
        createdAt: receipt.created_at ?? null,
      });
      setTimestampReceiptLoading(false);
    };

    void fetchTimestampReceipt();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, isExistingCertificate, hash, supabase]);

  useEffect(() => {
    if (!certificateId) {
      setIsExistingCertificate(false);
      setRawBodyExpiresAt(null);
      setRawBodyPresent(null);
      setRetentionPolicyLabel(null);
      return;
    }

    let cancelled = false;
    setIsLoadingCertificate(true);
    setError(null);
    setTimestampReceipt(null);
    setTimestampReceiptError(null);
    setTimestampReceiptLoading(false);

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
        setRawBodyExpiresAt(cert.raw_body_expires_at ?? cert.rawBodyExpiresAt ?? null);
        setRawBodyPresent(
          typeof cert.raw_body_present === 'boolean'
            ? cert.raw_body_present
            : typeof cert.rawBodyPresent === 'boolean'
              ? cert.rawBodyPresent
              : null
        );
        setRetentionPolicyLabel(cert.retention_policy_label ?? cert.retentionPolicyLabel ?? null);

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
        setRawBodyExpiresAt(null);
        setRawBodyPresent(null);
        setRetentionPolicyLabel(null);
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
          rawBodyExpiresAt: rawBodyExpiresAt ?? undefined,
          rawBodyPresent: rawBodyPresent ?? undefined,
          retentionPolicyLabel: retentionPolicyLabel ?? undefined,
          timestampReceipt: timestampReceipt ?? undefined,
          
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
    if (!autoDownload || !isExistingCertificate || autoDownloaded || isLoadingCertificate || !canExportPdfAllowed) return;
    if (!reportId || !timestamp) return;
    setDownloadNotice("Downloading PDF...");
    setAutoDownloaded(true);
    void handleDownload({ existing: true }).finally(() => {
      setTimeout(() => {
        setDownloadNotice("Download ready. Returning to dashboard...");
      }, 400);
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1400);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDownload, isExistingCertificate, autoDownloaded, isLoadingCertificate, reportId, timestamp, canExportPdfAllowed]);

  const parsedHeadersPreview: Record<string, string> = {};
  headersInput.split('\n').forEach(line => {
      const [key, ...values] = line.split(':');
      if (key && values.length) {
          parsedHeadersPreview[key.trim()] = values.join(':').trim();
      }
  });

  return (
    <div className="min-h-screen bg-slate-100 font-sans pt-16">
      <AppNavbar user={user} plan={currentPlan} />
      <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)]">
      {downloadNotice && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {downloadNotice}
        </div>
      )}
      {/* LEFT: Input Form */}
      <div className="w-full md:w-1/2 p-6 md:p-12 overflow-y-auto border-r border-slate-200 bg-white z-10 shadow-sm">
        <div className="max-w-xl mx-auto space-y-8">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">LanceIQ Generator</h1>
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
                    disabled={isGenerating || !canExportPdfAllowed}
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    {isGenerating ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                        <Download className="w-4 h-4" />
                    )}
                    {isGenerating
                      ? 'Generating...'
                      : !canExportPdfAllowed && user
                        ? 'Export Unavailable'
                        : isWatermarkFree
                          ? 'Download PDF (No Watermark)'
                          : 'Download PDF (With Watermark)'}
                </button>

                {/* 🎉 LAUNCH PROMO BANNER */}
                {isPromoActive && !canRemoveWatermark && (
                  <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                    <p className="text-sm text-green-700 font-medium text-center">
                      🎉 Launch Week Special: Watermark-free for everyone through Feb 6, 2026 (local time).
                    </p>
                  </div>
                )}

                {!canExportPdfAllowed && user && (
                    <div className="mt-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-2">
                        {!canExportByRole
                          ? 'PDF export isn’t available for your role. Ask an owner/admin to grant export access.'
                          : !canExportPdf
                            ? 'Upgrade your plan to enable PDF export.'
                            : 'PDF export is unavailable.'}
                    </div>
                )}

                {timestampReceiptLoading && isExistingCertificate && (
                    <div className="mt-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-2">
                        Loading timestamp receipt...
                    </div>
                )}

                {timestampReceiptError && (
                    <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                        Timestamp receipt unavailable: {timestampReceiptError}
                    </div>
                )}

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
                  <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-slate-500" />
                        <span className="text-sm text-slate-600">Saved to your workspace</span>
                      </div>
                      <Link
                        href="/dashboard"
                        className="text-sm text-slate-600 hover:text-slate-800 font-medium underline"
                      >
                        View History
                      </Link>
                    </div>
                  </div>
                )}
                
                {!isWatermarkFree && (
                  <p className="text-xs text-slate-400 text-center mt-3">
                    Free tier includes a watermark.
                  </p>
                )}

                <div className="mt-4 border border-slate-200 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                  <p className="font-semibold text-slate-700 mb-1">Scope of Proof</p>
                  <p>
                    This certificate attests only to receipt by LanceIQ at the timestamp shown, the payload and headers received,
                    and the verification status computed. It does not attest to upstream provider intent, downstream processing,
                    or financial settlement.
                  </p>
                </div>
             </div>
          </div>

          {/* Legal Hold + Audit Logs removed from generator */}
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
                rawBodyExpiresAt={rawBodyExpiresAt ?? undefined}
                rawBodyPresent={rawBodyPresent ?? undefined}
                retentionPolicyLabel={retentionPolicyLabel ?? undefined}
                timestampReceipt={timestampReceipt ?? undefined}
                
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
        workspaceId={workspaceId}
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
      </div>
    </div>
  );
}
