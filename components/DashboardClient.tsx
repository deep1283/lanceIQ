'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { AddSourceModal } from '@/components/AddSourceModal';
import { SourcesList } from '@/components/SourcesList';
import Link from 'next/link';
import { canManageWorkspace, isExporter, isLegalHoldManager, isViewer } from '@/lib/roles';
import type { Role } from '@/lib/roles';
import type { PlanEntitlements } from '@/lib/plan';

interface DashboardClientProps {
  children: React.ReactNode; // The server-rendered certificates list
  workspaceRole?: Role | null;
  initialTab?: 'certificates' | 'sources';
  entitlements: PlanEntitlements & { isPro: boolean };
}

export function DashboardClient({ children, workspaceRole, initialTab = 'certificates', entitlements }: DashboardClientProps) {
  const [activeTab, setActiveTab] = useState<'certificates' | 'sources'>(initialTab);
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const canAddSource = canManageWorkspace(workspaceRole);
  const canGenerate = !workspaceRole || (!isViewer(workspaceRole) && !isExporter(workspaceRole) && !isLegalHoldManager(workspaceRole));

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <>
      <div className="pt-20 pb-6 px-4 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Dashboard</h1>
            <p className="dashboard-text-muted text-sm mt-1">
              Manage your webhook verifications and ingestion sources.
            </p>
          </div>
          
          <div className="flex gap-2">
            {activeTab === 'sources' ? (
              canAddSource ? (
                <Button onClick={() => setIsAddSourceOpen(true)} className="dashboard-button-primary">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Source
                </Button>
              ) : null
            ) : (
              canGenerate ? (
                <Link href="/tool">
                  <Button className="dashboard-button-primary">
                    <Plus className="w-4 h-4 mr-2" />
                    Generate New
                  </Button>
                </Link>
              ) : null
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="mb-6 dashboard-panel-muted border dashboard-border rounded-full p-1 h-10">
            <TabsTrigger
              value="certificates"
              className="rounded-full px-4 text-[var(--dash-muted)] hover:text-[var(--dash-text)] data-[state=active]:bg-[var(--dash-surface)] data-[state=active]:text-[var(--dash-text)] data-[state=active]:shadow-[0_0_0_1px_var(--dash-border)]"
            >
              My Certificates
            </TabsTrigger>
            <TabsTrigger
              value="sources"
              className="rounded-full px-4 text-[var(--dash-muted)] hover:text-[var(--dash-text)] data-[state=active]:bg-[var(--dash-surface)] data-[state=active]:text-[var(--dash-text)] data-[state=active]:shadow-[0_0_0_1px_var(--dash-border)]"
            >
              Sources & Ingestion
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="certificates">
            {children}
          </TabsContent>
          
          <TabsContent value="sources">
            <SourcesList
              refreshTrigger={refreshTrigger}
              canManageSources={canAddSource}
              workspaceRole={workspaceRole}
              canUseForwarding={entitlements.canUseForwarding}
              canUseReconciliation={entitlements.canUseReconciliation}
            />
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
