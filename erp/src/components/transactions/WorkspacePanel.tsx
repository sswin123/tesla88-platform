'use client';

import WorkspaceSection from './WorkspaceSection';

interface WorkspacePanelProps {
  children?: React.ReactNode;
}

function PlaceholderContent({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-sm text-gray-400">
      {label} will appear here
    </div>
  );
}

export default function WorkspacePanel({ children }: WorkspacePanelProps) {
  return (
    <div className="space-y-4">
      {children ?? (
        <>
          <WorkspaceSection title="Timeline" defaultOpen>
            <PlaceholderContent label="Transaction timeline" />
          </WorkspaceSection>
          <WorkspaceSection title="Internal Notes" defaultOpen>
            <PlaceholderContent label="Internal notes" />
          </WorkspaceSection>
          <WorkspaceSection title="Audit Panel" defaultOpen={false} comingSoon />
          <WorkspaceSection title="Risk Panel" defaultOpen={false} comingSoon />
        </>
      )}
    </div>
  );
}
