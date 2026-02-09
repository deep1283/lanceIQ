'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { AddSourceModal } from '@/components/AddSourceModal';
import { SourcesList } from '@/components/SourcesList';
import Link from 'next/link';
import { canManageWorkspace, isExporter, isLegalHoldManager, isViewer } from '@/lib/roles';
import type { Role } from '@/lib/roles';

interface DashboardClientProps {
  children: React.ReactNode; // The server-rendered certificates list
  workspaceRole?: Role | null;
}

export function DashboardClient({ children, workspaceRole }: DashboardClientProps) {
  const [activeTab, setActiveTab] = useState('certificates');
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const canAddSource = canManageWorkspace(workspaceRole);
  const canGenerate = !workspaceRole || (!isViewer(workspaceRole) && !isExporter(workspaceRole) && !isLegalHoldManager(workspaceRole));

  return (
    <>
      <div className="pt-24 pb-4 px-4 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage your webhook verifications and ingestion sources.
            </p>
          </div>
          
          <div className="flex gap-2">
            {activeTab === 'sources' ? (
              canAddSource ? (
                <Button onClick={() => setIsAddSourceOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Source
                </Button>
              ) : null
            ) : (
              canGenerate ? (
                <Link href="/tool">
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Generate New
                  </Button>
                </Link>
              ) : null
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="certificates">My Certificates</TabsTrigger>
            <TabsTrigger value="sources">Sources & Ingestion</TabsTrigger>
          </TabsList>
          
          <TabsContent value="certificates">
            {children}
          </TabsContent>
          
          <TabsContent value="sources">
            <SourcesList refreshTrigger={refreshTrigger} canManageSources={canAddSource} />
          </TabsContent>
        </Tabs>
      </div>

      <AddSourceModal 
        isOpen={isAddSourceOpen} 
        onClose={() => setIsAddSourceOpen(false)}
        onSuccess={() => setRefreshTrigger(t => t + 1)}
      />
    </>
  );
}
