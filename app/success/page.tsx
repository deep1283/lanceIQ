"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const paymentId = searchParams?.get("payment_id") || null;
  const status = searchParams?.get("status") || null;
  
  const [isVerifying, setIsVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifyPayment = async () => {
      if (status === "succeeded" && paymentId) {
        try {
          // Call our API to verify this payment and get customer email
          const res = await fetch("/api/dodo/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment_id: paymentId }),
          });
          
          const data = await res.json();
          
          if (data.paid && data.email) {
            // Save to localStorage to unlock Pro
            localStorage.setItem("lanceiq_pro_email", data.email);
            setVerified(true);
          } else {
            setError("Could not verify payment. Please try verifying with your email on the home page.");
          }
        } catch (err) {
          console.error(err);
          setError("Verification failed. Please try verifying with your email on the home page.");
        }
      } else if (status !== "succeeded") {
        setError("Payment was not successful.");
      }
      setIsVerifying(false);
    };

    verifyPayment();
  }, [paymentId, status]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        {isVerifying ? (
          <>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Verifying Payment...</h1>
            <p className="text-slate-600">Please wait while we confirm your purchase.</p>
          </>
        ) : verified ? (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment Successful!</h1>
            <p className="text-slate-600 mb-6">
              Thank you for your purchase! Your Pro access is now active. 
              All watermarks have been removed.
            </p>
            <Link
              href="/tool"
              className="inline-block bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Generate Watermark-Free PDFs →
            </Link>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Almost There!</h1>
            <p className="text-slate-600 mb-6">
              {error || "Please verify your purchase on the home page using your email."}
            </p>
            <Link
              href="/tool"
              className="inline-block bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Return to Home
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Loading...</h1>
        <p className="text-slate-600">Please wait.</p>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SuccessContent />
    </Suspense>
  );
}
