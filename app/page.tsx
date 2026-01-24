"use client";

import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { CertificateTemplate } from "@/components/CertificateTemplate";
import { Download, RefreshCw, AlertTriangle } from "lucide-react";

export default function Home() {
  const [jsonInput, setJsonInput] = useState<string>("{\n  \"event\": \"payment.succeeded\",\n  \"amount\": 2000,\n  \"currency\": \"usd\"\n}");
  const [headersInput, setHeadersInput] = useState<string>("Stripe-Signature: t=123,v1=...\nContent-Type: application/json");
  const [status, setStatus] = useState<number>(200);
  const [timestamp, setTimestamp] = useState<string>("");
  const [reportId, setReportId] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydration fix for UUID and Timestamp
  useEffect(() => {
    setTimestamp(new Date().toISOString());
    setReportId(uuidv4());
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
        id: reportId
      };

      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error('Failed to generate PDF');

      const blob = await res.blob();
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

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans">
      {/* LEFT: Input Form */}
      <div className="w-full md:w-1/2 p-6 md:p-12 overflow-y-auto border-r border-slate-200 bg-white z-10 shadow-sm">
        <div className="max-w-xl mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">Webhook Proof Generator</h1>
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
                    {isGenerating ? 'Generating...' : 'Download Official PDF Proof'}
                </button>
                {error && (
                    <div className="flex items-center gap-2 mt-3 text-red-600 text-sm bg-red-50 p-2 rounded">
                        <AlertTriangle className="w-4 h-4" />
                        {error}
                    </div>
                )}
                <p className="text-xs text-slate-400 text-center mt-3">
                    Generates a client-ready delivery certificate.
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
            />
        </div>
      </div>
    </div>
  );
}
