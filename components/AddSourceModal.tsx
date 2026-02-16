import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Copy, Check, AlertTriangle, Send } from 'lucide-react';
import { createWorkspace } from '@/app/actions/workspaces';

interface AddSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface InlineErrorState {
  message: string;
  code?: string | null;
  id?: string | null;
  status?: number | null;
}

export function AddSourceModal({ isOpen, onClose, onSuccess }: AddSourceModalProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('stripe');
  const [secret, setSecret] = useState('');
  const [storeRawBody, setStoreRawBody] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  
  // State for showing the new key
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // State for test webhook
  const [testLoading, setTestLoading] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [testError, setTestError] = useState<InlineErrorState | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateError(null);
    setLoading(true);
    try {
      const result = await createWorkspace({
        name,
        provider,
        storeRawBody,
        secret
      });
      
      if (result.error) {
        setCreateError(result.error);
        setLoading(false);
        return;
      }
      
      setNewKey(result.apiKey || null); // Show the key
      setLoading(false);
      onSuccess(); // Refresh list in background
      // Don't close yet, wait for user to copy key
    } catch (error) {
      console.error(error);
      setCreateError('Failed to create source.');
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTestWebhook = async () => {
    if (!newKey) return;
    setTestLoading(true);
    setTestError(null);
    try {
      const payload = {
        api_key: newKey,
        payload: {
          event: 'test.ping',
          source: 'workspace_test_webhook_ui',
          timestamp: new Date().toISOString(),
          message: 'This is a test webhook from LanceIQ',
        },
      };

      const res = await fetch('/api/workspaces/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setTestSuccess(true);
        setTestError(null);
        setTimeout(() => setTestSuccess(false), 3000);
      } else {
        setTestError({
          message: typeof data.error === 'string' && data.error ? data.error : 'Test webhook failed.',
          code: typeof data.error_code === 'string' ? data.error_code : null,
          id: typeof data.id === 'string' ? data.id : null,
          status: res.status,
        });
      }
    } catch (e) {
      console.error(e);
      setTestError({
        message: 'Failed to send test webhook.',
        status: null,
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleClose = () => {
    setNewKey(null);
    setName('');
    setProvider('stripe');
    setSecret('');
    setStoreRawBody(false);
    setCreateError(null);
    setLoading(false);
    setTestLoading(false);
    setTestSuccess(false);
    setTestError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{newKey ? 'Source Created!' : 'Add New Source'}</DialogTitle>
          <DialogDescription>
            {newKey 
              ? 'Copy your API Key now. You will not be able to see it again.' 
              : 'Create a dedicated endpoint to receive webhooks.'}
          </DialogDescription>
        </DialogHeader>

        {newKey ? (
          <div className="space-y-4 py-4">
             <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <Label className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Your API Key</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-sm bg-white p-2 rounded border border-slate-200 break-all text-slate-700">
                    {newKey}
                  </code>
                  <Button size="icon" variant="ghost" onClick={handleCopy}>
                    {copied ? <Check className="w-4 h-4 text-violet-600" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
             </div>
             
             <div className="bg-yellow-50 p-3 rounded-md border border-yellow-100 flex gap-3 text-sm text-yellow-800">
                <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0" />
                <div className="flex-1 flex items-center justify-between">
                  <p>Verify your connection by sending a test webhook.</p>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="bg-white border-yellow-200 text-yellow-800 hover:bg-yellow-50 hover:text-yellow-900 h-8"
                    onClick={handleTestWebhook}
                    disabled={testLoading || testSuccess}
                  >
                    {testLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : testSuccess ? (
                      <Check className="w-3 h-3 mr-1" />
                    ) : (
                      <Send className="w-3 h-3 mr-1" />
                    )}
                    {testLoading ? 'Sending...' : testSuccess ? 'Sent!' : 'Send Test'}
                  </Button>
                </div>
             </div>
             {testError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 space-y-1">
                <p className="font-medium">{testError.message}</p>
                <p className="text-xs">
                  {typeof testError.status === 'number' ? `HTTP ${testError.status}` : 'Network error'}
                  {testError.code ? ` • ${testError.code}` : ''}
                  {testError.id ? ` • Ref ${testError.id}` : ''}
                </p>
              </div>
             )}
          </div>
        ) : (
          <form id="add-source-form" onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input 
                id="name" 
                placeholder="e.g. Stripe Production" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="razorpay">Razorpay</SelectItem>
                  <SelectItem value="lemon_squeezy">Lemon Squeezy</SelectItem>
                  <SelectItem value="generic">Generic (Other)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secret">Webhook Secret (Optional)</Label>
              <Input 
                id="secret" 
                type="password"
                placeholder="whsec_..." 
                value={secret} 
                onChange={(e) => setSecret(e.target.value)} 
              />
              <p className="text-[11px] text-slate-500 leading-tight">
                Stored encrypted at rest. Allows verification if the provider doesn&apos;t support custom headers.
              </p>
            </div>

            <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base">Store Raw Body</Label>
                <div className="text-xs text-slate-500">
                  Retain raw payloads for 7 days. Useful for debugging.
                </div>
              </div>
              <Switch checked={storeRawBody} onCheckedChange={setStoreRawBody} />
            </div>
            {createError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {createError}
              </div>
            )}
          </form>
        )}

        <DialogFooter>
          {newKey ? (
            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" form="add-source-form" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Source
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
