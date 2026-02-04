import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Copy, Check, AlertTriangle } from 'lucide-react';
import { createWorkspace } from '@/app/actions/workspaces';

interface AddSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddSourceModal({ isOpen, onClose, onSuccess }: AddSourceModalProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('stripe');
  const [secret, setSecret] = useState('');
  const [storeRawBody, setStoreRawBody] = useState(false);
  
  // State for showing the new key
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await createWorkspace({
        name,
        provider,
        storeRawBody,
        secret
      });
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      setNewKey(result.apiKey || null); // Show the key
      onSuccess(); // Refresh list in background
      // Don't close yet, wait for user to copy key
    } catch (error) {
      console.error(error);
      alert('Failed to create source');
      setLoading(false); // Only stop loading on error, on success we stay loading/showing key
    }
  };

  const handleCopy = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setNewKey(null);
    setName('');
    setProvider('stripe');
    setSecret('');
    setStoreRawBody(false);
    setLoading(false);
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
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
             </div>
             
             <div className="bg-yellow-50 p-3 rounded-md border border-yellow-100 flex gap-3 text-sm text-yellow-800">
                <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0" />
                <p>Make sure to verify your connection by sending a test webhook.</p>
             </div>
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
