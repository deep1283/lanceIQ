import { XCircle, Shield, Calendar, Activity, Hash, ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import { getCertificateForVerification } from "@/app/actions/certificates";
import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Verify Certificate | LanceIQ",
  description: "Verify the authenticity of a LanceIQ delivery record.",
};

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCertificateForVerification(id);

  if (!result.success || !result.data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-slate-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Verification Failed</h1>
          <p className="text-slate-500 mb-6">
            We could not find a certificate with ID <span className="font-mono bg-slate-100 px-1 rounded">{id.slice(0, 8)}...</span>
          </p>
          <p className="text-sm text-slate-400 mb-8">
            This record may have been deleted or the ID is invalid.
          </p>
          <Link 
            href="/"
            className="inline-flex items-center justify-center px-6 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
          >
            Create New Certificate
          </Link>
        </div>
      </div>
    );
  }

  const cert = result.data;
  const formattedDate = cert.created_at ? format(new Date(cert.created_at), "PPpp") : "Unknown Date";

  // Truncate payload for preview
  const payloadString = JSON.stringify(cert.payload, null, 2);
  const isPayloadLong = payloadString.split('\n').length > 10;
  const payloadPreview = isPayloadLong 
    ? payloadString.split('\n').slice(0, 10).join('\n') + '\n\n... (content hidden for privacy)' 
    : payloadString;
  
  const signatureStatus: 'verified' | 'failed' | 'not_verified' =
    cert.signature_status === 'verified'
      ? 'verified'
      : cert.signature_status === 'failed'
        ? 'failed'
        : 'not_verified';

  const badge =
    signatureStatus === 'verified'
      ? {
          className: "bg-green-100 text-green-700 ring-green-200/50",
          icon: <ShieldCheck className="w-4 h-4" />,
          label: "Signature Verified",
        }
      : signatureStatus === 'failed'
        ? {
            className: "bg-red-100 text-red-700 ring-red-200/50",
            icon: <ShieldAlert className="w-4 h-4" />,
            label: "Signature Failed",
          }
        : {
            className: "bg-yellow-100 text-yellow-800 ring-yellow-200/50",
            icon: <AlertTriangle className="w-4 h-4" />,
            label: "Not Verified",
          };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-20">
        
        {/* Header Badge */}
        <div className="flex flex-col items-center justify-center mb-12 text-center">
          <div className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-6 shadow-sm ring-1",
            badge.className
          )}>
            {badge.icon}
            <span>{badge.label}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">LanceIQ Verification</h1>
          <p className="text-slate-500 max-w-lg mx-auto">
            This page shows the stored certificate data and (when available) a server-computed signature verification result.
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/60 overflow-hidden">
          
          {/* Top Section: Metadata */}
          <div className="p-8 border-b border-slate-100 bg-slate-50/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                  <Hash className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Record ID</p>
                  <p className="font-mono text-sm text-slate-700 break-all">{id}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Timestamp</p>
                  <p className="font-mono text-sm text-slate-700">{formattedDate}</p>
                </div>
              </div>

              {/* Integrity Status */}
              <div className="flex items-start gap-4">
                <div className="p-2 bg-green-50 rounded-lg text-green-600">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Integrity</p>
                  <div className="flex items-center gap-2">
                     <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                     <p className="font-mono text-sm text-slate-700">Record Stored</p>
                  </div>
                </div>
              </div>

               {/* Signature Status */}
               <div className="flex items-start gap-4">
                <div className={cn(
                  "p-2 rounded-lg",
                  signatureStatus === 'verified'
                    ? "bg-green-50 text-green-600"
                    : signatureStatus === 'failed'
                      ? "bg-red-50 text-red-600"
                      : "bg-yellow-50 text-yellow-700"
                )}>
                  {signatureStatus === 'verified' ? (
                    <ShieldCheck className="w-5 h-5" />
                  ) : signatureStatus === 'failed' ? (
                    <ShieldAlert className="w-5 h-5" />
                  ) : (
                    <Shield className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Origin Signature</p>
                  <p className={cn(
                    "font-mono text-sm",
                    signatureStatus === 'verified'
                      ? "text-green-700 font-semibold"
                      : signatureStatus === 'failed'
                        ? "text-red-700 font-semibold"
                        : "text-slate-500"
                  )}>
                    {signatureStatus === 'verified' ? "Verified" : signatureStatus === 'failed' ? "Failed" : "Not Verified"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Verification Proof Section */}
          <div className="p-8">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <span className="w-1 h-6 bg-indigo-500 rounded-full" />
              Cryptographic Proof
            </h3>
            
            {/* Signature Verification Details - Prominent if Verified */}
            {cert.signature_status === 'verified' && (
              <div className="bg-green-50 rounded-xl p-6 border border-green-200 mb-6">
                <div className="flex items-center gap-3 mb-3">
                   <ShieldCheck className="w-5 h-5 text-green-700" />
                   <h4 className="font-bold text-green-900">Origin Verified by LanceIQ</h4>
                </div>
                <p className="text-sm text-green-800 mb-3 leading-relaxed">
                   This payload was cryptographically verified against the provider&apos;s signature using the secret key provided by the host. 
                </p>
                 <div className="bg-white/80 p-3 rounded-lg text-xs font-mono text-green-800 space-y-1">
                    <p>Method: {cert.verification_method}</p>
                    <p>Verified At: {cert.verified_at ? format(new Date(cert.verified_at), "PPpp") + " UTC" : "Unknown"}</p>
                    {cert.signature_secret_hint && <p>Key Hint: {cert.signature_secret_hint}</p>}
                 </div>
              </div>
            )}

            {/* Failed Verification Warning */}
            {cert.signature_status === 'failed' && (
               <div className="bg-red-50 rounded-xl p-6 border border-red-200 mb-6">
                 <div className="flex items-center gap-3 mb-3">
                    <ShieldAlert className="w-5 h-5 text-red-700" />
                    <h4 className="font-bold text-red-900">Verification Failed</h4>
                 </div>
                 <p className="text-sm text-red-800">
                    Warning: The signature provided did NOT match the payload. This record may have been tampered with or generated with incorrect credentials.
                 </p>
               </div>
            )}

            {/* Standard Integrity Hash */}
            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 mb-8">
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Payload Hash (SHA-256)</p>
                <div className="bg-white p-3 rounded-lg border border-slate-200 font-mono text-xs text-slate-600 break-all">
                  {cert.payload_hash || "Legacy Record (No Hash Stored)"}
                </div>
              </div>
               <p className="text-xs text-slate-400 leading-relaxed">
                 To verify this record manually, calculate the SHA-256 hash of the original JSON payload. It should match the string above exactly.
               </p>
            </div>

            {/* Privacy-First Preview */}
            <div>
              <div className="flex items-center justify-between mb-4">
                 <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1 h-6 bg-slate-300 rounded-full" />
                  Data Preview
                </h3>
                 <span className="text-xs font-medium px-2 py-1 bg-yellow-100 text-yellow-700 rounded-md border border-yellow-200/50">
                    Content Truncated for Privacy
                 </span>
              </div>
             
              <div className="relative group">
                <div className="absolute inset-0 bg-slate-900/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none" />
                <pre className="bg-slate-900 text-slate-50 p-6 rounded-xl overflow-x-auto text-xs font-mono leading-relaxed opacity-90">
                  {payloadPreview}
                </pre>
              </div>
            </div>

          </div>
          
           {/* Footer */}
          <div className="bg-slate-50 p-6 text-center border-t border-slate-100">
             <Link href="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline">
               Generate your own proof with LanceIQ &rarr;
             </Link>
          </div>
        </div>
        
        <div className="mt-12 text-center">
           <p className="text-slate-400 text-sm mb-2">LanceIQ is an independent verification utility.</p>
           <div className="flex items-center justify-center gap-4 text-sm text-slate-400">
             <Link href="/terms" className="hover:text-slate-600">Terms</Link>
             <span>&bull;</span>
             <Link href="/privacy" className="hover:text-slate-600">Privacy</Link>
           </div>
        </div>

      </div>
    </div>
  );
}
