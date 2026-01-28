import React from 'react';
import { CheckCircle, AlertCircle, Clock, Server, FileJson, Shield } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utils
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CertificateTemplateProps {
  id: string;
  payload: string;
  headers: Record<string, string>;
  timestamp: string;
  status: number;
  showWatermark?: boolean;
  hash?: string;
  verificationUrl?: string;
  qrCodeDataUrl?: string;
}

export function CertificateTemplate({
  id,
  payload,
  headers,
  timestamp,
  status,
  showWatermark = true,
  hash,
  verificationUrl,
  qrCodeDataUrl,
}: CertificateTemplateProps) {
  const isSuccess = status >= 200 && status < 300;
  
  // Basic Header Detection
  const detectedProviders = [];
  const headerKeys = Object.keys(headers).map(k => k.toLowerCase());
  if (headerKeys.some(k => k === 'stripe-signature')) detectedProviders.push('Stripe');
  if (headerKeys.some(k => k.includes('shopify'))) detectedProviders.push('Shopify');
  if (headerKeys.some(k => k.includes('paypal'))) detectedProviders.push('PayPal');
  if (headerKeys.some(k => k.includes('razorpay'))) detectedProviders.push('Razorpay');

  // Format Payload
  let formattedPayload = payload;
  try {
    formattedPayload = JSON.stringify(JSON.parse(payload), null, 2);
  } catch (e) {
    // Keep as raw if invalid json
  }

  return (
    <div className="w-[210mm] min-h-[297mm] bg-white p-12 mx-auto relative text-slate-800 font-serif" id="certificate-root">
      {/* Border Decoration */}
      <div className="absolute inset-4 border-4 border-slate-900 double-border pointer-events-none" />
      <div className="absolute inset-5 border border-slate-300 pointer-events-none" />

      {/* Watermark for Free Tier */}
      {showWatermark && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-10">
          <div 
            className="text-slate-300 text-4xl font-bold uppercase tracking-widest opacity-30"
            style={{
              transform: 'rotate(-35deg)',
              whiteSpace: 'nowrap',
              fontSize: '48px',
              letterSpacing: '0.1em',
            }}
          >
            FREE • LANCEIQ.COM • FREE • LANCEIQ.COM
          </div>
        </div>
      )}

      {/* Badge - Top Right */}
      <div className="absolute top-12 right-12 flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full">
        <Shield className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-sans font-medium text-slate-500 uppercase tracking-wider">Human-readable delivery record</span>
      </div>

      {/* Header */}
      <div className="mt-8 mb-12 text-center">
        <h1 className="text-4xl font-bold font-serif text-slate-900 tracking-tight mb-2 uppercase border-b-2 border-slate-900 pb-4 inline-block">
          LanceIQ
        </h1>
        <p className="text-sm font-sans text-slate-500 tracking-widest uppercase mt-2">Delivery Certificate</p>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-8 mb-12">
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
              <Clock className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <p className="text-xs font-sans uppercase text-slate-500 font-semibold mb-1">Provided Timestamp</p>
              <p className="font-mono text-sm">{timestamp} (UTC)</p>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
             <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
              <Server className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <p className="text-xs font-sans uppercase text-slate-500 font-semibold mb-1">Status Code</p>
              <div className="flex items-center gap-2">
                <span className={cn("font-bold font-mono", isSuccess ? "text-slate-900" : "text-red-600")}>
                  {status}
                </span>
                <span className="text-sm italic text-slate-600">
                  {isSuccess ? '(Successful HTTP Response)' : '(Error Response)'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
           <div className="flex items-start gap-4">
            <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <p className="text-xs font-sans uppercase text-slate-500 font-semibold mb-1">Detected Provider Headers</p>
              {detectedProviders.length > 0 ? (
                <p className="font-bold text-slate-900">{detectedProviders.join(', ')}</p>
              ) : (
                <p className="text-slate-400 italic font-light">None recognized</p>
              )}
            </div>
          </div>

           <div className="flex items-start gap-4">
            <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
              <FileJson className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <p className="text-xs font-sans uppercase text-slate-500 font-semibold mb-1">Report ID</p>
              <p className="font-mono text-xs text-slate-600 break-all">{id}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Headers Table */}
      <div className="mb-10">
        <h3 className="text-lg font-bold mb-4 font-serif text-slate-900 border-b border-slate-200 pb-2">Provided Headers</h3>
        <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden text-sm">
           <table className="w-full text-left font-mono">
             <tbody>
                {Object.entries(headers).length > 0 ? (
                   Object.entries(headers).map(([key, value], idx) => (
                    <tr key={key} className={idx !== Object.entries(headers).length - 1 ? "border-b border-slate-100" : ""}>
                      <td className="py-2 px-4 font-semibold text-slate-600 w-1/3 truncate bg-slate-100/50">{key}</td>
                      <td className="py-2 px-4 text-slate-800 break-all">{value}</td>
                    </tr>
                   ))
                ) : (
                   <tr><td className="p-4 text-slate-400 italic">No headers provided</td></tr>
                )}
             </tbody>
           </table>
        </div>
      </div>

       {/* Payload */}
      <div className="mb-12">
        <h3 className="text-lg font-bold mb-4 font-serif text-slate-900 border-b border-slate-200 pb-2">Payload Content</h3>
         <pre className="p-6 bg-slate-50 rounded-lg border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap break-all overflow-hidden border-l-4 border-l-slate-300">
           {formattedPayload}
         </pre>
      </div>

    {/* Footer with QR and Legal */}
    <div className="absolute bottom-12 left-12 right-12 border-t border-slate-200 pt-6 flex items-end justify-between">
        
        {/* Left: QR Code & Verification */}
        <div className="flex items-center gap-4">
            {qrCodeDataUrl && (
                <div className="w-24 h-24 bg-white p-1 border border-slate-200 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrCodeDataUrl} alt="Verification QR Code" className="w-full h-full" />
                </div>
            )}
            <div className="text-left">
                <p className="text-[10px] font-sans text-slate-500 uppercase tracking-wider font-bold mb-1">
                    Scan to Verify
                </p>
                <p className="text-[10px] font-mono text-slate-400 mb-2 break-all">
                    {verificationUrl?.replace('https://', '') || 'lanceiq.com/verify'}
                </p>
                {hash && (
                     <div>
                        <p className="text-[8px] font-sans text-slate-400 uppercase tracking-wider mb-0.5">SHA-256 Hash</p>
                        <p className="text-[8px] font-mono text-slate-300 max-w-[200px] break-all leading-tight">
                            {hash}
                        </p>
                     </div>
                )}
            </div>
        </div>

        {/* Right: Legal Text */}
        <div className="text-right max-w-sm">
             <p className="text-[10px] font-sans text-slate-400 uppercase tracking-widest mb-1">
               Document Generated via LanceIQ
            </p>
            <p className="text-[10px] font-sans text-slate-400 leading-relaxed">
              This document is a human-readable record generated from user-provided webhook data.
            </p>
        </div>
      </div>
    </div>
  );
}
