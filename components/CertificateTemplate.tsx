import { Calendar, Globe, Hash, ShieldCheck, ShieldAlert, ShieldX, FileJson, Server } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CertificateTemplateProps {
  id: string; // Report ID
  date: string; // Timestamp
  payload: string; // JSON String
  headers: Record<string, string>;
  status: number;
  payloadHash: string;
  retentionPolicyLabel?: string;
  rawBodyPresent?: boolean;
  rawBodyExpiresAt?: string;
  
  // Visuals
  showWatermark?: boolean;
  qrCodeDataUrl?: string;
  verificationUrl?: string;

  // Signature Verification Props
  signatureStatus?: 'not_verified' | 'verified' | 'failed';
  verifiedAt?: string;
  verificationMethod?: string;
  verificationError?: string;
  secretHint?: string;
  toleranceUsedSec?: number;
}

export function CertificateTemplate({
  id,
  date,
  payload,
  headers,
  status,
  payloadHash,
  retentionPolicyLabel,
  rawBodyPresent,
  rawBodyExpiresAt,
  showWatermark,
  qrCodeDataUrl,
  verificationUrl,
  signatureStatus = 'not_verified',
  verifiedAt,
  verificationMethod,
  verificationError,
  secretHint,
  toleranceUsedSec,
}: CertificateTemplateProps) {
  const rawBodyPresentLabel =
    typeof rawBodyPresent === 'boolean'
      ? rawBodyPresent
        ? 'Present'
        : 'Pruned'
      : 'Pending backend data';
  const rawBodyExpiresAtLabel = rawBodyExpiresAt || 'Pending backend data';
  const retentionPolicyLabelText = retentionPolicyLabel || 'Pending backend data';
  
  return (
    <div 
      id="certificate-root"
      className={cn(
        "w-[800px] bg-white text-slate-900 relative overflow-hidden flex flex-col",
        "font-sans"
      )}
      style={{ minHeight: '1131px' }} // A4 height approx
    >
      {/* Watermark Overlay */}
      {showWatermark && (
        <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center opacity-[0.03] overflow-hidden">
          <p className="text-[120px] font-bold -rotate-45 whitespace-nowrap">
            LANCEIQ FREE TIER
          </p>
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-900 text-white px-12 py-10 flex justify-between items-start relative z-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Webhook Receipt Record</h1>
          <div className="flex items-center gap-2 opacity-80 text-sm">
             <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
             <span>Receipt evidence recorded by LanceIQ</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-slate-400 text-xs font-mono uppercase tracking-wider mb-1">Report ID</p>
          <p className="font-mono text-lg font-bold">{id}</p>
        </div>
      </div>

      <div className="p-12 flex-1 relative z-10">
        
        {/* Top Grid: Status & Verification */}
        <div className="grid grid-cols-2 gap-8 mb-10">
            
            {/* Delivery Status */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Delivery Status</h3>
                <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <div className={cn(
                        "p-2 rounded-lg",
                        status >= 200 && status < 300 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                        <Server className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={cn(
                                "text-xl font-bold font-mono",
                                status >= 200 && status < 300 ? "text-green-700" : "text-red-700"
                            )}>
                                {status}
                            </span>
                            <span className="text-sm font-medium text-slate-600">
                                {status >= 200 && status < 300 ? 'OK' : 'Error'}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">
                            Remote Server Response Code
                        </p>
                    </div>
                </div>
            </div>

            {/* Signature Verification */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Signature Verification</h3>
                <div className={cn(
                    "flex items-start gap-4 p-4 rounded-xl border",
                    signatureStatus === 'verified' ? "bg-green-50 border-green-200" :
                    signatureStatus === 'failed' ? "bg-red-50 border-red-200" :
                    "bg-yellow-50 border-yellow-200"
                )}>
                    <div className={cn(
                        "p-2 rounded-lg shrink-0",
                        signatureStatus === 'verified' ? "bg-green-100 text-green-700" :
                        signatureStatus === 'failed' ? "bg-red-100 text-red-700" :
                        "bg-yellow-100 text-yellow-700"
                    )}>
                        {signatureStatus === 'verified' && <ShieldCheck className="w-6 h-6" />}
                        {signatureStatus === 'failed' && <ShieldX className="w-6 h-6" />}
                        {signatureStatus === 'not_verified' && <ShieldAlert className="w-6 h-6" />}
                    </div>
                    <div>
                         {signatureStatus === 'verified' && (
                            <>
                                <p className="font-bold text-green-800 text-sm mb-1">Verified</p>
                                <div className="text-[10px] text-green-700 font-mono space-y-0.5">
                                    <p>Method: {verificationMethod}</p>
                                    <p>Time: {verifiedAt}</p>
                                    {secretHint && <p>Key Hint: {secretHint}</p>}
                                    {toleranceUsedSec && <p>Tolerance: {toleranceUsedSec}s</p>}
                                </div>
                            </>
                         )}
                         {signatureStatus === 'failed' && (
                             <>
                                <p className="font-bold text-red-800 text-sm mb-1">Verification Failed</p>
                                <p className="text-xs text-red-700 mb-1">{verificationError || "Signature mismatch"}</p>
                                <p className="text-[10px] text-red-600">This payload may have been tampered with or secret is incorrect.</p>
                             </>
                         )}
                         {signatureStatus === 'not_verified' && (
                             <>
                                <p className="font-bold text-yellow-800 text-sm mb-1">Not Verified</p>
                                <p className="text-xs text-yellow-700">Client did not provide credentials to verify this webhook&apos;s origin.</p>
                             </>
                         )}
                    </div>
                </div>
            </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-8 mb-10 pb-10 border-b border-slate-100">
            <div className="space-y-1">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Message Timestamp (UTC)</p>
                <div className="flex items-center gap-2 text-slate-700">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="font-medium">{date}</span>
                </div>
            </div>
            <div className="space-y-1">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Integrity Checksum (SHA-256)</p>
                <div className="flex items-center gap-2 text-slate-700">
                    <Hash className="w-4 h-4 text-slate-400" />
                    <span className="font-mono text-xs break-all">{payloadHash}</span>
                </div>
            </div>
        </div>

        {/* Retention Status */}
        <div className="mb-10 pb-10 border-b border-slate-100">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-4">Retention Status</p>
            <div className="grid grid-cols-3 gap-6 text-xs text-slate-600">
                <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Raw Body Present</p>
                    <p className="font-mono text-slate-700">{rawBodyPresentLabel}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Raw Body Expires At</p>
                    <p className="font-mono text-slate-700 break-all">{rawBodyExpiresAtLabel}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Retention Policy</p>
                    <p className="font-mono text-slate-700 break-all">{retentionPolicyLabelText}</p>
                </div>
            </div>
        </div>

        {/* Payload Section */}
        <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase text-slate-900 tracking-wider flex items-center gap-2">
                    <FileJson className="w-4 h-4 text-slate-400" />
                    Payload Body
                </h3>
                <span className="text-xs text-slate-400 font-mono">application/json</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 font-mono text-xs leading-relaxed text-slate-800 break-words whitespace-pre-wrap shadow-inner">
                {payload}
            </div>
        </div>

        {/* Headers Section */}
        <div className="mb-12">
            <h3 className="text-sm font-bold uppercase text-slate-900 tracking-wider mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-400" />
                Request Headers
            </h3>
            <div className="grid grid-cols-1 gap-1 bg-white border border-slate-200 rounded-xl overflow-hidden">
                {Object.entries(headers).map(([key, value], i) => (
                    <div key={key} className={cn(
                        "flex border-b border-slate-100 last:border-0 p-3 text-xs",
                        i % 2 === 0 ? "bg-slate-50/50" : "bg-white"
                    )}>
                        <span className="w-1/3 font-semibold text-slate-600 truncate pr-4">{key}</span>
                        <span className="w-2/3 text-slate-800 font-medium break-all">{value}</span>
                    </div>
                ))}
            </div>
        </div>

      </div>

      {/* Footer */}
      <div className="bg-slate-50 border-t border-slate-200 p-8 flex items-end justify-between mt-auto">
         <div className="max-w-md">
            <p className="font-bold text-slate-900 text-sm mb-2">Scope of Proof</p>
            <p className="text-[10px] text-slate-500 leading-relaxed mb-4">
                This certificate attests only to receipt by LanceIQ at the timestamp shown, the payload and headers received,
                and the verification status computed. It does not attest to upstream provider intent, downstream processing,
                or financial settlement.
            </p>
            <div className="flex gap-4 text-[10px] font-medium text-slate-400">
                <span>lanceiq.com</span>
                <span>•</span>
                <span>Verify at: {verificationUrl || 'https://lanceiq.com/verify'}</span>
            </div>
         </div>
         
         {qrCodeDataUrl && (
             <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                 {/* eslint-disable-next-line @next/next/no-img-element */}
                 <img src={qrCodeDataUrl} alt="Verification QR" className="w-20 h-20" />
             </div>
         )}
      </div>

    </div>
  );
}
