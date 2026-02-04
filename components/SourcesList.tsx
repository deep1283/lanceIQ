'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Copy, Check, Terminal, RefreshCw, Archive, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import { getWorkspaces, deleteWorkspace } from '@/app/actions/workspaces';
import { getRecentIngestionEvents, IngestionEvent } from '@/app/actions/ingestion-history';
import { formatDistanceToNow } from 'date-fns';

interface Workspace {
  id: string;
  name: string;
  provider: string;
  api_key_last4: string;
  store_raw_body: boolean;
  secret_last4?: string;
  created_at: string;
}

export function SourcesList({ refreshTrigger }: { refreshTrigger: number }) {
  const [sources, setSources] = useState<Workspace[]>([]);
  const [history, setHistory] = useState<IngestionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const getIngestUrl = () => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/api/ingest/`;
  };

  return (
    <div className="space-y-8">
      {/* Sources Section */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-slate-500" />
          Active Sources
        </h2>
        <div className="grid grid-cols-1 gap-6">
          {loading && sources.length === 0 ? (
            <div className="text-center py-10 text-slate-500">Loading sources...</div>
          ) : sources.length === 0 ? (
            <Card className="bg-slate-50 border-dashed border-2 shadow-none">
               <div className="flex flex-col items-center justify-center py-12 text-center">
                 <div className="bg-white p-3 rounded-full shadow-sm mb-4">
                   <Terminal className="w-6 h-6 text-slate-400" />
                 </div>
                 <h3 className="font-semibold text-slate-900 mb-1">No Sources Yet</h3>
                 <p className="text-sm text-slate-500 max-w-sm mb-6">
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
              />
            ))
          )}
        </div>
      </div>

      {/* History Section */}
      <div>
         <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Archive className="w-5 h-5 text-slate-500" />
              Recent Ingestion Events
            </h2>
            <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
         </div>

         <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {history.length === 0 ? (
               <div className="p-8 text-center text-slate-500 text-sm">
                 No events received yet. Send a webhook to one of your sources to see it here.
               </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((event) => (
                    <tr key={event.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                        {formatDistanceToNow(new Date(event.received_at))} ago
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {event.source_name}
                      </td>
                      <td className="px-4 py-3">
                         {event.signature_status === 'verified' && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                              <ShieldCheck className="w-3 h-3" /> Verified
                            </Badge>
                         )}
                         {event.signature_status === 'failed' && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
                              <ShieldAlert className="w-3 h-3" /> Failed
                            </Badge>
                         )}
                         {event.signature_status === 'not_verified' && (
                            <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 gap-1">
                              <AlertTriangle className="w-3 h-3" /> Not Verified
                            </Badge>
                         )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                        {event.signature_reason ? (
                          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                            {event.signature_reason}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                        <span className="mx-2 text-slate-300">|</span>
                        <span className="font-mono text-xs text-slate-400" title={event.raw_body_sha256}>
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

function SourceCard({ source, onDelete, isDeleting, baseUrl }: { source: Workspace, onDelete: () => void, isDeleting: boolean, baseUrl: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(`${baseUrl}{API_KEY}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900">{source.name}</h3>
              <Badge variant="secondary" className="font-normal capitalize text-slate-600 bg-slate-100">
                {source.provider}
              </Badge>
              {source.store_raw_body && (
                 <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200 bg-blue-50">
                    Raw Storage
                 </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500">Created {formatDistanceToNow(new Date(source.created_at))} ago</p>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : <Trash2 className="w-4 h-4" />}
          </Button>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
           <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Endpoint URL Structure</p>
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                <code className="text-xs font-mono text-slate-600 flex-1 truncate">
                  {baseUrl}
                  <span className="font-bold text-slate-900">API_KEY</span>
                </code>
                 <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCopyUrl}>
                  {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
           </div>
           
           <div>
               <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Key ID</p>
               <div className="flex items-center gap-2">
                 <div className="font-mono text-sm text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                   ...{source.api_key_last4}
                 </div>
                 <span className="text-xs text-slate-400">
                   (Full key hidden)
                 </span>
               </div>
           </div>

           <div>
               <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Secret</p>
               {source.secret_last4 ? (
                  <div className="flex items-center gap-2">
                     <div className="font-mono text-sm text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                       •••• {source.secret_last4}
                     </div>
                     <Badge variant="outline" className="text-[10px] text-green-600 border-green-200 bg-green-50">
                        Encrypted
                     </Badge>
                  </div>
               ) : (
                  <div className="text-sm text-slate-400 italic py-1">
                    Not configured (Header required)
                  </div>
               )}
           </div>
        </div>
      </CardContent>
    </Card>
  );
}
