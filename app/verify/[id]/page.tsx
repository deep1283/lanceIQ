
import { CheckCircle, XCircle, Shield, Calendar, Activity, Hash, FileText } from "lucide-react";
import { getCertificateForVerification } from "@/app/actions/certificates";
import Link from "next/link";
import { format } from "date-fns";

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

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-20">
        
        {/* Header Badge */}
        <div className="flex flex-col items-center justify-center mb-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-semibold mb-6 shadow-sm ring-1 ring-green-200/50">
            <CheckCircle className="w-4 h-4" />
            <span>Valid Verification Record</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">Verified by LanceIQ</h1>
          <p className="text-slate-500 max-w-lg mx-auto">
            This document serves as a permanent, immutable record of a digital webhook event delivery.
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

              <div className="flex items-start gap-4">
                <div className="p-2 bg-green-50 rounded-lg text-green-600">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Status</p>
                  <div className="flex items-center gap-2">
                     <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                     <p className="font-mono text-sm text-slate-700">Record Verified</p>
                  </div>
                </div>
              </div>

               <div className="flex items-start gap-4">
                <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Security</p>
                  <p className="font-mono text-sm text-slate-700">SHA-256 Signed</p>
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
