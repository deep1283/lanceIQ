"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type WorkspaceOption = {
  id: string;
  name: string;
};

type WorkspaceMembershipRow = {
  workspace_id: string;
  workspaces: { id: string; name: string | null } | Array<{ id: string; name: string | null }> | null;
};

type VerifyState = "loading" | "needs_login" | "choose_workspace" | "verifying" | "verified" | "pending" | "error";

function SuccessContent() {
  const searchParams = useSearchParams();
  const paymentId = searchParams?.get("payment_id") || null;
  const status = searchParams?.get("status") || null;
  const workspaceFromQuery = searchParams?.get("workspace_id") || null;

  const supabase = useMemo(() => createClient(), []);

  const [state, setState] = useState<VerifyState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(workspaceFromQuery || "");

  const verifyWithWorkspace = useCallback(async (workspaceId: string) => {
    if (!paymentId) {
      setState("error");
      setMessage("Missing payment reference. Open Dashboard and retry from workspace settings.");
      return;
    }

    setState("verifying");
    setMessage(null);

    try {
      const res = await fetch("/api/dodo/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id: paymentId, workspace_id: workspaceId }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setState("needs_login");
        setMessage("Sign in to verify payment proof for your workspace.");
        return;
      }

      if (!res.ok) {
        setState("error");
        setMessage(data?.error || "Unable to verify payment proof for the selected workspace.");
        return;
      }

      if (data.workspace_plan_active) {
        setState("verified");
        setMessage("Payment proof verified and workspace subscription is active.");
      } else {
        setState("pending");
        setMessage(
          data?.message ||
            "Payment proof verified. Plan activation is webhook-driven and may still be processing."
        );
      }
    } catch {
      setState("error");
      setMessage("Verification request failed. Retry from workspace settings.");
    }
  }, [paymentId]);

  useEffect(() => {
    const initialize = async () => {
      if (!paymentId) {
        setState("error");
        setMessage("Missing payment reference. Open Dashboard and retry from workspace settings.");
        return;
      }

      if (status && status.toLowerCase() !== "succeeded") {
        setState("error");
        setMessage("Payment status is not successful.");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setState("needs_login");
        setMessage("Sign in to verify payment proof for your workspace.");
        return;
      }

      const { data: memberships, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, workspaces ( id, name )")
        .eq("user_id", user.id);

      if (error) {
        setState("error");
        setMessage("Failed to load workspace context. Open Dashboard and try again.");
        return;
      }

      const membershipRows = (memberships || []) as WorkspaceMembershipRow[];
      const options: WorkspaceOption[] = membershipRows
        .map((row) => {
          const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
          const id = row.workspace_id;
          const name = workspace?.name || "Workspace";
          return id ? { id, name } : null;
        })
        .filter((item: WorkspaceOption | null): item is WorkspaceOption => Boolean(item));

      setWorkspaceOptions(options);

      if (!options.length) {
        setState("error");
        setMessage("No workspace membership found. Open Dashboard to select or create a workspace.");
        return;
      }

      const workspaceIdFromUrl = workspaceFromQuery && options.some((w) => w.id === workspaceFromQuery)
        ? workspaceFromQuery
        : null;

      if (workspaceIdFromUrl) {
        setSelectedWorkspaceId(workspaceIdFromUrl);
        await verifyWithWorkspace(workspaceIdFromUrl);
        return;
      }

      if (options.length === 1) {
        setSelectedWorkspaceId(options[0].id);
        await verifyWithWorkspace(options[0].id);
        return;
      }

      setState("choose_workspace");
      setMessage("Select the workspace for this purchase before verification.");
    };

    void initialize();
  }, [paymentId, status, supabase, verifyWithWorkspace, workspaceFromQuery]);

  const startWorkspaceVerification = async () => {
    if (!selectedWorkspaceId) {
      setMessage("Select a workspace to continue.");
      return;
    }
    await verifyWithWorkspace(selectedWorkspaceId);
  };

  const loginHref = `/login?next=${encodeURIComponent(`/success?${searchParams?.toString() || ""}`)}`;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        {state === "loading" || state === "verifying" ? (
          <>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              {state === "loading" ? "Preparing Verification..." : "Verifying Payment Proof..."}
            </h1>
            <p className="text-slate-600">This step requires authenticated workspace context.</p>
          </>
        ) : state === "verified" ? (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment Proof Verified</h1>
            <p className="text-slate-600 mb-6">{message}</p>
            <div className="flex flex-col gap-3">
              <Link
                href="/dashboard/settings"
                className="inline-block bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Open Workspace Settings
              </Link>
              <Link
                href="/tool"
                className="inline-block border border-slate-200 text-slate-700 px-6 py-3 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Go to Generator
              </Link>
            </div>
          </>
        ) : state === "pending" ? (
          <>
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment Proof Verified</h1>
            <p className="text-slate-600 mb-6">{message}</p>
            <p className="text-xs text-slate-500 mb-6">
              Activation is webhook and proof driven. Refresh workspace settings to confirm final status.
            </p>
            <Link
              href="/dashboard/settings"
              className="inline-block bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Open Workspace Settings
            </Link>
          </>
        ) : state === "choose_workspace" ? (
          <>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Select Workspace</h1>
            <p className="text-slate-600 mb-4">{message}</p>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 mb-4 text-slate-900"
              value={selectedWorkspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
            >
              <option value="">Choose workspace</option>
              {workspaceOptions.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <div className="flex flex-col gap-3">
              <button
                onClick={startWorkspaceVerification}
                className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Verify Payment Proof
              </button>
              <Link
                href="/dashboard"
                className="inline-block border border-slate-200 text-slate-700 px-6 py-3 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          </>
        ) : state === "needs_login" ? (
          <>
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Sign In Required</h1>
            <p className="text-slate-600 mb-6">{message}</p>
            <Link
              href={loginHref}
              className="inline-block bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Sign In and Continue
            </Link>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Unable to Verify</h1>
            <p className="text-slate-600 mb-6">{message || "Verification could not be completed."}</p>
            <div className="flex flex-col gap-3">
              <Link
                href="/dashboard/settings"
                className="inline-block bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Open Workspace Settings
              </Link>
              <Link
                href="/dashboard"
                className="inline-block border border-slate-200 text-slate-700 px-6 py-3 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
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
