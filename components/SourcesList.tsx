'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Trash2,
  Copy,
  Check,
  Terminal,
  RefreshCw,
  Archive,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Forward,
  Lock,
  RotateCcw,
  Activity,
  Save,
} from 'lucide-react';
import {
  getWorkspaces,
  deleteWorkspace,
  getWorkspaceDeliveryTargets,
  upsertWorkspaceDeliveryTarget,
  type WorkspaceDeliveryTarget,
} from '@/app/actions/workspaces';
import {
  getRecentIngestionEvents,
  getPaymentRecoverySummary,
  IngestionEvent,
  type PaymentRecoverySummary,
} from '@/app/actions/ingestion-history';
import { formatDistanceToNow } from 'date-fns';
import type { Role } from '@/lib/roles';
import { isOwner } from '@/lib/roles';

interface Workspace {
  id: string;
  name: string;
  provider: string;
  api_key_last4: string;
  store_raw_body: boolean;
  secret_last4?: string;
  created_at: string;
}

type RotationState = {
  rotating?: boolean;
  error?: string | null;
  apiKey?: string | null;
  rotatedAt?: string | null;
};

export function SourcesList({
  refreshTrigger,
  canManageSources = false,
  workspaceRole,
  canUseForwarding = false,
  canUseReconciliation = false,
}: {
  refreshTrigger: number;
  canManageSources?: boolean;
  workspaceRole?: Role | null;
  canUseForwarding?: boolean;
  canUseReconciliation?: boolean;
}) {
  const [sources, setSources] = useState<Workspace[]>([]);
  const [history, setHistory] = useState<IngestionEvent[]>([]);
  const [targets, setTargets] = useState<WorkspaceDeliveryTarget[]>([]);
  const [recoverySummary, setRecoverySummary] = useState<PaymentRecoverySummary | null>(null);
  const [replayingEventId, setReplayingEventId] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rotationState, setRotationState] = useState<Record<string, RotationState>>({});
  const canRotateKeys = isOwner(workspaceRole);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [wsData, historyData, targetsData, paymentSummary] = await Promise.all([
      getWorkspaces(),
      getRecentIngestionEvents(),
      getWorkspaceDeliveryTargets(),
      getPaymentRecoverySummary(),
    ]);
    setSources(wsData || []);
    setHistory(historyData || []);
    setTargets(targetsData || []);
    setRecoverySummary(paymentSummary || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshTrigger]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;
    
    setDeletingId(id);
    await deleteWorkspace(id);
    await loadData(); // reload list
    setDeletingId(null);
  };

  const handleRotateKey = async (workspaceId: string, reason?: string) => {
    if (!canRotateKeys) return;

    setRotationState((prev) => ({
      ...prev,
      [workspaceId]: { rotating: true, error: null, apiKey: null, rotatedAt: null },
    }));

    try {
      const res = await fetch('/api/workspaces/keys/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, reason }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to rotate key');
      }

      const apiKey = data?.api_key as string | undefined;
      if (!apiKey) {
        throw new Error('Rotation succeeded but no key was returned.');
      }

      setRotationState((prev) => ({
        ...prev,
        [workspaceId]: {
          rotating: false,
          error: null,
          apiKey,
          rotatedAt: data?.rotated_at || null,
        },
      }));

      const last4 = apiKey.slice(-4);
      setSources((prev) =>
        prev.map((source) =>
          source.id === workspaceId ? { ...source, api_key_last4: last4 } : source
        )
      );
    } catch (error) {
      setRotationState((prev) => ({
        ...prev,
        [workspaceId]: {
          rotating: false,
          error: error instanceof Error ? error.message : 'Failed to rotate key',
          apiKey: null,
          rotatedAt: null,
        },
      }));
    }
  };

  const handleReplayEvent = async (workspaceId: string, ingestedEventId: string) => {
    if (!canManageSources || !canUseForwarding) return;
    setReplayingEventId(ingestedEventId);
    setReplayError(null);
    try {
      const response = await fetch('/api/delivery/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          ingested_event_id: ingestedEventId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Replay failed.');
      }
      await loadData();
    } catch (error) {
      setReplayError(error instanceof Error ? error.message : 'Replay failed.');
    } finally {
      setReplayingEventId(null);
    }
  };

  const targetByWorkspaceId = new Map<string, WorkspaceDeliveryTarget>();
  for (const target of targets) {
    if (!targetByWorkspaceId.has(target.workspace_id)) {
      targetByWorkspaceId.set(target.workspace_id, target);
    }
  }

  const getIngestUrl = () => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/api/ingest/`;
  };

  return (
    <div className="space-y-8">
      <div className="dashboard-panel rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="w-5 h-5 dashboard-text-muted" />
              Payment Delivery Recovery
            </h2>
            <p className="text-sm dashboard-text-muted mt-1">
              Last 24 hours of payment webhooks and delivery outcomes.
            </p>
          </div>
          {!canUseForwarding && (
            <Badge variant="outline" className="dashboard-chip gap-1">
              <Lock className="w-3 h-3" />
              Pro/Team
            </Badge>
          )}
        </div>

        {!canUseForwarding ? (
          <div className="mt-4 dashboard-panel-muted rounded-lg border dashboard-border p-4 text-sm dashboard-text-muted">
            Forwarding and one-click replay are available on Pro and Team plans.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="dashboard-panel-muted rounded-lg p-4">
                <p className="text-xs uppercase tracking-wider dashboard-text-subtle">Matched</p>
                <p className="text-2xl font-semibold text-slate-900">{recoverySummary?.matched_last_24h ?? 0}</p>
              </div>
              <div className="dashboard-panel-muted rounded-lg p-4">
                <p className="text-xs uppercase tracking-wider dashboard-text-subtle">Missing</p>
                <p className="text-2xl font-semibold text-red-500">{recoverySummary?.missing_last_24h ?? 0}</p>
              </div>
              <div className="dashboard-panel-muted rounded-lg p-4">
                <p className="text-xs uppercase tracking-wider dashboard-text-subtle">Total</p>
                <p className="text-2xl font-semibold text-slate-900">{recoverySummary?.total_last_24h ?? 0}</p>
              </div>
            </div>

            {replayError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {replayError}
              </div>
            )}

            <div className="dashboard-panel-muted rounded-lg border dashboard-border overflow-hidden">
              <div className="px-4 py-3 border-b dashboard-border text-sm font-medium text-slate-900">
                Missing Payments
              </div>
              {(recoverySummary?.missing?.length || 0) === 0 ? (
                <div className="px-4 py-6 text-sm dashboard-text-muted">No missing deliveries in the last 24 hours.</div>
              ) : (
                <table className="w-full text-sm dashboard-table">
                  <thead className="border-b dashboard-border text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Payment</th>
                      <th className="px-4 py-2 text-left">Source</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--dash-border)]">
                    {recoverySummary?.missing.map((item) => (
                      <tr key={item.ingested_event_id} className="dashboard-row">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {item.amount_label || item.provider_event_id || item.ingested_event_id.slice(0, 8)}
                          </div>
                          <div className="text-xs dashboard-text-muted">
                            {item.customer_label || item.provider.toUpperCase()}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-900">{item.source_name}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="dashboard-chip">
                            {item.delivery_status}
                            {typeof item.last_status_code === 'number' ? ` (${item.last_status_code})` : ''}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canManageSources ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="dashboard-button-secondary"
                              disabled={!item.replayable || replayingEventId === item.ingested_event_id}
                              onClick={() => handleReplayEvent(item.workspace_id, item.ingested_event_id)}
                            >
                              {replayingEventId === item.ingested_event_id ? (
                                <>
                                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                  Replaying...
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="w-3 h-3 mr-1" />
                                  Replay
                                </>
                              )}
                            </Button>
                          ) : (
                            <span className="text-xs dashboard-text-subtle">Owner/admin only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sources Section */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Terminal className="w-5 h-5 dashboard-text-muted" />
          Active Sources
        </h2>
        <div className="grid grid-cols-1 gap-6">
          {loading && sources.length === 0 ? (
            <div className="text-center py-10 dashboard-text-muted">Loading sources...</div>
          ) : sources.length === 0 ? (
            <Card className="dashboard-panel-muted border-dashed border-2 shadow-none">
               <div className="flex flex-col items-center justify-center py-12 text-center">
                 <div className="dashboard-panel-elevated p-3 rounded-full mb-4">
                   <Terminal className="w-6 h-6 dashboard-text-subtle" />
                 </div>
                 <h3 className="font-semibold text-slate-900 mb-1">No Sources Yet</h3>
                 <p className="text-sm dashboard-text-muted max-w-sm mb-6">
                   Create a source to get a unique API URL for receiving webhooks.
                 </p>
               </div>
            </Card>
          ) : (
            sources.map((source) => (
              <SourceCard 
                key={`${source.id}:${targetByWorkspaceId.get(source.id)?.updated_at || 'none'}`} 
                source={source} 
                target={targetByWorkspaceId.get(source.id) || null}
                onDelete={() => handleDelete(source.id, source.name)}
                isDeleting={deletingId === source.id}
                baseUrl={getIngestUrl()}
                canManageSources={canManageSources}
                canRotateKeys={canRotateKeys}
                canUseForwarding={canUseForwarding}
                canUseReconciliation={canUseReconciliation}
                rotationState={rotationState[source.id]}
                onRotateKey={(reason) => handleRotateKey(source.id, reason)}
              />
            ))
          )}
        </div>
      </div>

      {/* History Section */}
      <div>
         <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Archive className="w-5 h-5 dashboard-text-muted" />
              Recent Ingestion Events
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="dashboard-button-ghost"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
         </div>

         <div className="dashboard-panel rounded-xl overflow-hidden">
            {history.length === 0 ? (
               <div className="p-8 text-center dashboard-text-muted text-sm">
                 No events received yet. Send a webhook to one of your sources to see it here.
               </div>
            ) : (
              <table className="w-full text-sm text-left dashboard-table">
                <thead className="border-b dashboard-border text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Delivery</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3 text-right">Replay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--dash-border)]">
                  {history.map((event) => (
                    <tr key={event.id} className="dashboard-row">
                      <td className="px-4 py-3 dashboard-text-muted font-mono text-xs">
                        {formatDistanceToNow(new Date(event.received_at))} ago
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {event.source_name}
                      </td>
                      <td className="px-4 py-3">
                         {event.signature_status === 'verified' && (
                            <Badge variant="outline" className="dashboard-accent-chip gap-1">
                              <ShieldCheck className="w-3 h-3" /> Verified
                            </Badge>
                         )}
                         {event.signature_status === 'failed' && (
                            <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 gap-1">
                              <ShieldAlert className="w-3 h-3" /> Failed
                            </Badge>
                         )}
                         {event.signature_status === 'not_verified' && (
                            <Badge variant="outline" className="dashboard-chip gap-1">
                              <AlertTriangle className="w-3 h-3" /> Not Verified
                            </Badge>
                         )}
                      </td>
                      <td className="px-4 py-3">
                        {event.delivery_status === 'delivered' && (
                          <Badge variant="outline" className="dashboard-accent-chip gap-1">
                            Delivered
                          </Badge>
                        )}
                        {event.delivery_status === 'retrying' && (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1">
                            Retrying
                          </Badge>
                        )}
                        {event.delivery_status === 'queued' && (
                          <Badge variant="outline" className="dashboard-chip gap-1">
                            Queued
                          </Badge>
                        )}
                        {event.delivery_status === 'dlq' && (
                          <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 gap-1">
                            DLQ
                          </Badge>
                        )}
                        {event.delivery_status === 'not_configured' && (
                          <span className="text-xs dashboard-text-subtle">Not configured</span>
                        )}
                        {event.delivery_attempt_count > 0 && (
                          <div className="text-xs dashboard-text-subtle mt-1">
                            attempts: {event.delivery_attempt_count}
                            {typeof event.delivery_last_status_code === 'number'
                              ? ` • last ${event.delivery_last_status_code}`
                              : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 dashboard-text-muted max-w-xs truncate">
                        {event.signature_reason ? (
                          <span className="font-mono text-xs bg-[var(--dash-surface-2)] px-1.5 py-0.5 rounded text-slate-600">
                            {event.signature_reason}
                          </span>
                        ) : (
                          <span className="text-xs dashboard-text-subtle">-</span>
                        )}
                        <span className="mx-2 dashboard-text-subtle">|</span>
                        <span className="font-mono text-xs dashboard-text-subtle" title={event.raw_body_sha256}>
                           SHA256: {event.raw_body_sha256.substring(0, 8)}...
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canUseForwarding && canManageSources && event.delivery_status === 'dlq' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="dashboard-button-secondary"
                            onClick={() => handleReplayEvent(event.workspace_id, event.id)}
                            disabled={replayingEventId === event.id}
                          >
                            {replayingEventId === event.id ? (
                              <>
                                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                Replaying...
                              </>
                            ) : (
                              <>
                                <RotateCcw className="w-3 h-3 mr-1" />
                                Replay
                              </>
                            )}
                          </Button>
                        ) : (
                          <span className="text-xs dashboard-text-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
         </div>
      </div>
    </div>
  );
}

function SourceCard({
  source,
  target,
  onDelete,
  isDeleting,
  baseUrl,
  canManageSources,
  canRotateKeys,
  canUseForwarding,
  canUseReconciliation,
  rotationState,
  onRotateKey,
}: {
  source: Workspace,
  target: WorkspaceDeliveryTarget | null,
  onDelete: () => void,
  isDeleting: boolean,
  baseUrl: string,
  canManageSources: boolean,
  canRotateKeys: boolean,
  canUseForwarding: boolean,
  canUseReconciliation: boolean,
  rotationState?: RotationState,
  onRotateKey: (reason?: string) => void,
}) {
  const [copied, setCopied] = useState(false);
  const [showRotate, setShowRotate] = useState(false);
  const [rotateReason, setRotateReason] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [showForwardingEditor, setShowForwardingEditor] = useState(false);
  const [forwardingUrl, setForwardingUrl] = useState(target?.url || '');
  const [forwardingEnabled, setForwardingEnabled] = useState(Boolean(target?.is_active));
  const [savingForwarding, setSavingForwarding] = useState(false);
  const [forwardingError, setForwardingError] = useState<string | null>(null);
  const [forwardingSuccess, setForwardingSuccess] = useState<string | null>(null);

  const rotating = rotationState?.rotating ?? false;
  const rotateError = rotationState?.error ?? null;
  const rotatedKey = rotationState?.apiKey ?? null;
  const rotatedAt = rotationState?.rotatedAt ?? null;
  const forwardingLocked = !canUseForwarding;
  const forwardingConfigured = Boolean(target?.id);

  const redactedTarget = (() => {
    if (!target?.url) return 'Not configured';
    try {
      const parsed = new URL(target.url);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return target.url;
    }
  })();

  const handleSaveForwarding = async () => {
    if (!canManageSources || forwardingLocked) return;
    setSavingForwarding(true);
    setForwardingError(null);
    setForwardingSuccess(null);
    const result = await upsertWorkspaceDeliveryTarget({
      workspaceId: source.id,
      destinationUrl: forwardingUrl,
      enabled: forwardingEnabled,
      name: `${source.name} Destination`,
    });
    if (result.error) {
      setForwardingError(result.error);
    } else {
      setForwardingSuccess('Forwarding target saved.');
    }
    setSavingForwarding(false);
  };
  
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(`${baseUrl}{API_KEY}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyKey = () => {
    if (!rotatedKey) return;
    navigator.clipboard.writeText(rotatedKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <Card className="dashboard-panel">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900">{source.name}</h3>
              <Badge variant="secondary" className="dashboard-chip font-normal capitalize">
                {source.provider}
              </Badge>
              {source.store_raw_body && (
                 <Badge variant="outline" className="dashboard-accent-chip text-[10px]">
                    Raw Storage
                 </Badge>
              )}
            </div>
            <p className="text-sm dashboard-text-muted">Created {formatDistanceToNow(new Date(source.created_at))} ago</p>
          </div>
          
          {canManageSources && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : <Trash2 className="w-4 h-4" />}
            </Button>
          )}
        </div>

        <div className="mt-4 pt-4 border-t dashboard-border grid grid-cols-1 md:grid-cols-2 gap-4">
           <div>
              <p className="text-xs font-semibold uppercase tracking-wider dashboard-text-subtle mb-2">Endpoint URL Structure</p>
              <div className="flex items-center gap-2 bg-[var(--dash-surface-2)] p-2 rounded border dashboard-border">
                <code className="text-xs font-mono dashboard-text-muted flex-1 truncate">
                  {baseUrl}
                  <span className="font-semibold text-slate-900">API_KEY</span>
                </code>
                 <Button size="icon" variant="ghost" className="h-6 w-6 dashboard-button-ghost" onClick={handleCopyUrl}>
                  {copied ? <Check className="w-3 h-3 dashboard-accent-text" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
           </div>
           
           <div>
               <p className="text-xs font-semibold uppercase tracking-wider dashboard-text-subtle mb-2">Key ID</p>
               <div className="flex items-center gap-2">
                 <div className="font-mono text-sm text-slate-900 bg-[var(--dash-surface-2)] px-2 py-1 rounded border dashboard-border">
                   ...{source.api_key_last4}
                 </div>
                 <span className="text-xs dashboard-text-subtle">
                   (Full key hidden)
                 </span>
               </div>
               <div className="mt-3 space-y-3">
                 {canRotateKeys ? (
                   <>
                     <Button size="sm" variant="outline" className="dashboard-button-secondary" onClick={() => setShowRotate((prev) => !prev)}>
                       {showRotate ? 'Hide Rotation' : 'Rotate API Key'}
                     </Button>
                     {showRotate && (
                       <div className="rounded-lg border dashboard-border bg-[var(--dash-surface-2)] p-3 space-y-3">
                         <div>
                           <label className="block text-xs font-semibold dashboard-text-muted mb-1">Reason (optional)</label>
                           <input
                             value={rotateReason}
                             onChange={(e) => setRotateReason(e.target.value)}
                             placeholder="Scheduled rotation"
                             className="w-full text-sm rounded-md px-3 py-2 dashboard-input"
                           />
                         </div>
                         <div className="flex items-center gap-2">
                           <Button size="sm" className="dashboard-button-primary" onClick={() => onRotateKey(rotateReason)} disabled={rotating}>
                             {rotating ? 'Rotating...' : 'Confirm Rotation'}
                           </Button>
                           <span className="text-xs dashboard-text-muted">Old keys remain valid for 24 hours.</span>
                         </div>
                         {rotateError && (
                           <p className="text-xs text-red-400">{rotateError}</p>
                         )}
                         {rotatedKey && (
                           <div className="rounded-md border dashboard-accent-border dashboard-accent-soft p-3">
                             <p className="text-[11px] uppercase dashboard-accent-text font-semibold mb-2">New API Key (shown once)</p>
                             <div className="flex items-center gap-2">
                               <code className="flex-1 text-xs font-mono dashboard-accent-text break-all">{rotatedKey}</code>
                               <Button size="icon" variant="ghost" className="h-7 w-7 dashboard-button-ghost" onClick={handleCopyKey}>
                                 {copiedKey ? <Check className="w-3 h-3 dashboard-accent-text" /> : <Copy className="w-3 h-3 dashboard-accent-text" />}
                               </Button>
                             </div>
                             {rotatedAt && (
                               <p className="mt-2 text-[11px] dashboard-accent-text">Rotated at {new Date(rotatedAt).toLocaleString()}</p>
                             )}
                           </div>
                         )}
                       </div>
                     )}
                   </>
                 ) : (
                   <span className="text-xs dashboard-text-subtle">Only owners can rotate keys.</span>
                 )}
               </div>
           </div>

           <div>
               <p className="text-xs font-semibold uppercase tracking-wider dashboard-text-subtle mb-2">Secret</p>
               {source.secret_last4 ? (
                  <div className="flex items-center gap-2">
                     <div className="font-mono text-sm text-slate-900 bg-[var(--dash-surface-2)] px-2 py-1 rounded border dashboard-border">
                       •••• {source.secret_last4}
                     </div>
                     <Badge variant="outline" className="dashboard-accent-chip text-[10px]">
                        Encrypted
                     </Badge>
                  </div>
               ) : (
                  <div className="text-sm dashboard-text-subtle italic py-1">
                    Not configured (Header required)
                  </div>
               )}
           </div>

           <div className="md:col-span-2">
             <div className="rounded-lg border dashboard-border bg-[var(--dash-surface-2)] p-4 space-y-3">
               <div className="flex items-center justify-between gap-3">
                 <div>
                   <p className="text-xs font-semibold uppercase tracking-wider dashboard-text-subtle">Forwarding</p>
                   <p className="text-sm text-slate-900 mt-1">
                     {forwardingConfigured
                       ? forwardingEnabled
                         ? 'Enabled'
                         : 'Configured (disabled)'
                       : 'Not configured'}
                   </p>
                   <p className="text-xs dashboard-text-muted mt-1">{redactedTarget}</p>
                 </div>
                 <div className="flex items-center gap-2">
                   {canUseReconciliation && (
                     <Badge variant="outline" className="dashboard-accent-chip text-[10px]">
                       Reconciliation Ready
                     </Badge>
                   )}
                   {forwardingLocked && (
                     <Badge variant="outline" className="dashboard-chip gap-1">
                       <Lock className="w-3 h-3" />
                       Pro/Team
                     </Badge>
                   )}
                 </div>
               </div>

               {canManageSources && (
                 <div className="space-y-3">
                   <Button
                     size="sm"
                     variant="outline"
                     className="dashboard-button-secondary"
                     onClick={() => setShowForwardingEditor((prev) => !prev)}
                     disabled={forwardingLocked}
                   >
                     <Forward className="w-3 h-3 mr-1" />
                     {showForwardingEditor ? 'Hide Forwarding' : forwardingConfigured ? 'Edit Forwarding' : 'Configure Forwarding'}
                   </Button>

                   {showForwardingEditor && (
                     <div className="space-y-3 rounded-md border dashboard-border bg-[var(--dash-surface)] p-3">
                       <div>
                         <label className="block text-xs font-semibold dashboard-text-muted mb-1">Destination URL</label>
                         <input
                           value={forwardingUrl}
                           onChange={(event) => setForwardingUrl(event.target.value)}
                           placeholder="https://api.yourapp.com/webhooks/payment"
                           className="w-full rounded-md px-3 py-2 text-sm dashboard-input"
                           disabled={forwardingLocked}
                         />
                       </div>
                       <label className="flex items-center gap-2 text-xs dashboard-text-muted">
                         <input
                           type="checkbox"
                           checked={forwardingEnabled}
                           onChange={(event) => setForwardingEnabled(event.target.checked)}
                           disabled={forwardingLocked}
                         />
                         Enable forwarding for this source
                       </label>
                       <div className="flex items-center gap-2">
                         <Button
                           size="sm"
                           className="dashboard-button-primary"
                           onClick={handleSaveForwarding}
                           disabled={savingForwarding || forwardingLocked}
                         >
                           <Save className="w-3 h-3 mr-1" />
                           {savingForwarding ? 'Saving...' : 'Save Target'}
                         </Button>
                         <span className="text-xs dashboard-text-muted">LanceIQ signs forwarded requests.</span>
                       </div>
                       {forwardingError && <p className="text-xs text-red-400">{forwardingError}</p>}
                       {forwardingSuccess && <p className="text-xs dashboard-accent-text">{forwardingSuccess}</p>}
                     </div>
                   )}
                 </div>
               )}
             </div>
           </div>
        </div>
      </CardContent>
    </Card>
  );
}
