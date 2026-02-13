"use client";

import { useState } from 'react';
import { ShieldCheck, ShieldAlert, XCircle, Info, Lock, Eye, EyeOff, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VerificationApiResponse } from '@/lib/signature-verification';

// Types for props
interface VerifySignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawBody: string;
  headers: Record<string, string>;
  workspaceId?: string | null;
  certificateId?: string; // Optional: provided if we have a saved cert (future flow)
  reportId?: string;      // Optional: provided if we have a saved cert report ID
  onVerified: (result: VerificationApiResponse) => void;
  canVerify?: boolean;
  upgradeHref?: string;
}

export function VerifySignatureModal({
  isOpen,
  onClose,
  rawBody,
  headers,
  workspaceId,
  certificateId,
  reportId,
  onVerified,
  canVerify = true,
  upgradeHref = "/pricing"
}: VerifySignatureModalProps) {
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationApiResponse | null>(null);

  if (!isOpen) return null;

  const handleVerify = async () => {
    if (!canVerify) {
      setError("Upgrade required to verify signatures.");
      return;
    }
    if (!secret.trim()) {
      setError("Please enter your webhook secret.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/verify-signature', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rawBody,
          headers,
          workspace_id: workspaceId,
          secret,
          certificateId, // Optional persistence
          reportId       // Optional persistence
        }),
      });

      const data = (await response.json()) as VerificationApiResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Verification request failed');
      }

      setResult(data);
      onVerified(data);
      
      // Clear secret from state after successful verification for security (UX choice)
      if (data.status === 'verified') {
        setSecret(''); 
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Lock className="w-5 h-5 text-indigo-600" />
            Verify Signature
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          
          {/* Info / Warning */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700 space-y-2">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Raw Body Integrity</p>
                <p>
                  Verification is performed against the <strong>exact raw body</strong> and headers you provided. 
	                  If you pasted &quot;pretty-printed&quot; JSON, verification will likely fail because whitespace matters.
                </p>
              </div>
            </div>
            <div className="pl-7 pt-1">
              <a href="#" className="flex items-center gap-1 text-blue-600 hover:text-blue-800 underline disabled:opacity-50 text-xs font-semibold" onClick={(e) => { e.preventDefault(); /* Could trigger a help modal or tooltip */ }}>
                <HelpCircle className="w-3 h-3" />
                How to get the raw body
              </a>
            </div>
          </div>

          {/* Secret Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Webhook Secret (Signing Secret)
            </label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="whsec_..."
                disabled={!canVerify}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                disabled={!canVerify}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Your secret is processed server-side for verification and is <strong className="text-gray-700">designed to not be stored</strong>.
            </p>
          </div>

          {!canVerify && (
            <div className="p-3 bg-amber-50 text-amber-800 text-sm rounded-lg flex items-start gap-2">
              <HelpCircle className="w-5 h-5 shrink-0" />
              <span>
                Signature verification is available on paid plans.{" "}
                <a href={upgradeHref} className="underline font-medium">Upgrade to unlock</a>.
              </span>
            </div>
          )}

          {/* Result Display */}
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-start gap-2">
              <XCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className={cn(
              "p-4 rounded-lg border flex items-start gap-3",
              result.status === 'verified' ? "bg-green-50 border-green-200 text-green-800" :
              result.status === 'failed' ? "bg-red-50 border-red-200 text-red-800" :
              "bg-yellow-50 border-yellow-200 text-yellow-800"
            )}>
              {result.status === 'verified' && <ShieldCheck className="w-6 h-6 shrink-0 text-green-600" />}
              {result.status === 'failed' && <ShieldAlert className="w-6 h-6 shrink-0 text-red-600" />}
              {result.status === 'not_verified' && <HelpCircle className="w-6 h-6 shrink-0 text-yellow-600" />}
              
              <div className="space-y-1">
                <p className="font-bold">
                  {result.status === 'verified' && "Signature Verified!"}
                  {result.status === 'failed' && "Verification Failed"}
                  {result.status === 'not_verified' && "Could Not Verify"}
                </p>
                <p className="text-sm opacity-90">
                  {result.error || (result.status === 'verified' && `Successfully verified using ${result.method}`)}
                </p>
                {result.reason && (
                  <p className="text-xs font-mono bg-black/5 inline-block px-1.5 py-0.5 rounded mt-1">
                    Code: {result.reason}
                  </p>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 text-sm font-medium"
          >
            Close
          </button>
          <button
            onClick={handleVerify}
            disabled={loading || !secret.trim() || !canVerify}
            className={cn(
              "px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all",
              loading && "animate-pulse"
            )}
          >
            {loading ? "Verifying..." : "Verify Signature"}
          </button>
        </div>

      </div>
    </div>
  );
}
