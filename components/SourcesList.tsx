'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Copy, Check, Terminal, RefreshCw, Archive, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import { getWorkspaces, deleteWorkspace } from '@/app/actions/workspaces';
import { getRecentIngestionEvents, IngestionEvent } from '@/app/actions/ingestion-history';
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
}: {
  refreshTrigger: number;
  canManageSources?: boolean;
  workspaceRole?: Role | null;
}) {
  const [sources, setSources] = useState<Workspace[]>([]);
  const [history, setHistory] = useState<IngestionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rotationState, setRotationState] = useState<Record<string, RotationState>>({});
  const canRotateKeys = isOwner(workspaceRole);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [wsData, historyData] = await Promise.all([
      getWorkspaces(),
      getRecentIngestionEvents()
    ]);
    setSources(wsData || []);
    setHistory(historyData || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const getIngestUrl = () => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/api/ingest/`;
  };

  return (
    <div className="space-y-8">
      {/* Sources Section */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-slate-500 dark:text-zinc-400" />
          Active Sources
        </h2>
        <div className="grid grid-cols-1 gap-6">
          {loading && sources.length === 0 ? (
            <div className="text-center py-10 text-slate-500 dark:text-zinc-400">Loading sources...</div>
          ) : sources.length === 0 ? (
            <Card className="bg-slate-50 dark:bg-zinc-800 border-dashed border-2 shadow-none">
               <div className="flex flex-col items-center justify-center py-12 text-center">
                 <div className="bg-white dark:bg-zinc-800 p-3 rounded-full shadow-sm mb-4">
                   <Terminal className="w-6 h-6 text-slate-400 dark:text-zinc-500" />
                 </div>
                 <h3 className="font-semibold text-slate-900 dark:text-white mb-1">No Sources Yet</h3>
                 <p className="text-sm text-slate-500 dark:text-zinc-400 max-w-sm mb-6">
                   Create a source to get a unique API URL for receiving webhooks.
                 </p>
               </div>
            </Card>
          ) : (
            sources.map((source) => (
              <SourceCard 
                key={source.id} 
                source={source} 
                onDelete={() => handleDelete(source.id, source.name)}
                isDeleting={deletingId === source.id}
                baseUrl={getIngestUrl()}
                canManageSources={canManageSources}
                canRotateKeys={canRotateKeys}
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
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Archive className="w-5 h-5 text-slate-500 dark:text-zinc-400" />
              Recent Ingestion Events
            </h2>
            <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
         </div>

         <div className="bg-white dark:bg-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700 shadow-sm overflow-hidden">
            {history.length === 0 ? (
               <div className="p-8 text-center text-slate-500 dark:text-zinc-400 text-sm">
                 No events received yet. Send a webhook to one of your sources to see it here.
               </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700 text-xs uppercase text-slate-500 dark:text-zinc-400 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-700">
                  {history.map((event) => (
                    <tr key={event.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800 dark:bg-zinc-800">
                      <td className="px-4 py-3 text-slate-500 dark:text-zinc-400 font-mono text-xs">
                        {formatDistanceToNow(new Date(event.received_at))} ago
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {event.source_name}
                      </td>
                      <td className="px-4 py-3">
                         {event.signature_status === 'verified' && (
                            <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 gap-1">
                              <ShieldCheck className="w-3 h-3" /> Verified
                            </Badge>
                         )}
                         {event.signature_status === 'failed' && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
                              <ShieldAlert className="w-3 h-3" /> Failed
                            </Badge>
                         )}
                         {event.signature_status === 'not_verified' && (
                            <Badge variant="outline" className="bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700 gap-1">
                              <AlertTriangle className="w-3 h-3" /> Not Verified
                            </Badge>
                         )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-zinc-400 max-w-xs truncate">
                        {event.signature_reason ? (
                          <span className="font-mono text-xs bg-slate-100 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-zinc-400">
                            {event.signature_reason}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-zinc-500">-</span>
                        )}
                        <span className="mx-2 text-slate-300 dark:text-zinc-600">|</span>
                        <span className="font-mono text-xs text-slate-400 dark:text-zinc-500" title={event.raw_body_sha256}>
                           SHA256: {event.raw_body_sha256.substring(0, 8)}...
                        </span>
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
  onDelete,
  isDeleting,
  baseUrl,
  canManageSources,
  canRotateKeys,
  rotationState,
  onRotateKey,
}: {
  source: Workspace,
  onDelete: () => void,
  isDeleting: boolean,
  baseUrl: string,
  canManageSources: boolean,
  canRotateKeys: boolean,
  rotationState?: RotationState,
  onRotateKey: (reason?: string) => void,
}) {
  const [copied, setCopied] = useState(false);
  const [showRotate, setShowRotate] = useState(false);
  const [rotateReason, setRotateReason] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  const rotating = rotationState?.rotating ?? false;
  const rotateError = rotationState?.error ?? null;
  const rotatedKey = rotationState?.apiKey ?? null;
  const rotatedAt = rotationState?.rotatedAt ?? null;
  
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
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 dark:text-white">{source.name}</h3>
              <Badge variant="secondary" className="font-normal capitalize text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-700">
                {source.provider}
              </Badge>
              {source.store_raw_body && (
                 <Badge variant="outline" className="text-[10px] text-violet-600 border-violet-200 bg-violet-50">
                    Raw Storage
                 </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-zinc-400">Created {formatDistanceToNow(new Date(source.created_at))} ago</p>
          </div>
          
          {canManageSources && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : <Trash2 className="w-4 h-4" />}
            </Button>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-700 grid grid-cols-1 md:grid-cols-2 gap-4">
           <div>
              <p className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-2">Endpoint URL Structure</p>
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-zinc-800 p-2 rounded border border-slate-200 dark:border-zinc-700">
                <code className="text-xs font-mono text-slate-600 dark:text-zinc-400 flex-1 truncate">
                  {baseUrl}
                  <span className="font-bold text-slate-900 dark:text-white">API_KEY</span>
                </code>
                 <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCopyUrl}>
                  {copied ? <Check className="w-3 h-3 text-violet-600" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
           </div>
           
           <div>
               <p className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-2">Key ID</p>
               <div className="flex items-center gap-2">
                 <div className="font-mono text-sm text-slate-700 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-800 px-2 py-1 rounded border border-slate-200 dark:border-zinc-700">
                   ...{source.api_key_last4}
                 </div>
                 <span className="text-xs text-slate-400 dark:text-zinc-500">
                   (Full key hidden)
                 </span>
               </div>
               <div className="mt-3 space-y-3">
                 {canRotateKeys ? (
                   <>
                     <Button size="sm" variant="outline" onClick={() => setShowRotate((prev) => !prev)}>
                       {showRotate ? 'Hide Rotation' : 'Rotate API Key'}
                     </Button>
                     {showRotate && (
                       <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-3 space-y-3">
                         <div>
                           <label className="block text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1">Reason (optional)</label>
                           <input
                             value={rotateReason}
                             onChange={(e) => setRotateReason(e.target.value)}
                             placeholder="Scheduled rotation"
                             className="w-full text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-md px-3 py-2 text-slate-700 dark:text-zinc-300"
                           />
                         </div>
                         <div className="flex items-center gap-2">
                           <Button size="sm" onClick={() => onRotateKey(rotateReason)} disabled={rotating}>
                             {rotating ? 'Rotating...' : 'Confirm Rotation'}
                           </Button>
                           <span className="text-xs text-slate-500 dark:text-zinc-400">Old keys remain valid for 24 hours.</span>
                         </div>
                         {rotateError && (
                           <p className="text-xs text-red-600">{rotateError}</p>
                         )}
                         {rotatedKey && (
                           <div className="rounded-md border border-violet-200 bg-violet-50 p-3">
                             <p className="text-[11px] uppercase text-violet-700 font-semibold mb-2">New API Key (shown once)</p>
                             <div className="flex items-center gap-2">
                               <code className="flex-1 text-xs font-mono text-violet-900 break-all">{rotatedKey}</code>
                               <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCopyKey}>
                                 {copiedKey ? <Check className="w-3 h-3 text-violet-700" /> : <Copy className="w-3 h-3 text-violet-700" />}
                               </Button>
                             </div>
                             {rotatedAt && (
                               <p className="mt-2 text-[11px] text-violet-700">Rotated at {new Date(rotatedAt).toLocaleString()}</p>
                             )}
                           </div>
                         )}
                       </div>
                     )}
                   </>
                 ) : (
                   <span className="text-xs text-slate-400 dark:text-zinc-500">Only owners can rotate keys.</span>
                 )}
               </div>
           </div>

           <div>
               <p className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-2">Secret</p>
               {source.secret_last4 ? (
                  <div className="flex items-center gap-2">
                     <div className="font-mono text-sm text-slate-700 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-800 px-2 py-1 rounded border border-slate-200 dark:border-zinc-700">
                       •••• {source.secret_last4}
                     </div>
                     <Badge variant="outline" className="text-[10px] text-violet-600 border-violet-200 bg-violet-50">
                        Encrypted
                     </Badge>
                  </div>
               ) : (
                  <div className="text-sm text-slate-400 dark:text-zinc-500 italic py-1">
                    Not configured (Header required)
                  </div>
               )}
           </div>
        </div>
      </CardContent>
    </Card>
  );
}
