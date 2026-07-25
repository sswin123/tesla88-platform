'use client';

import TimelinePanel from './TimelinePanel';
import NotesPanel from './NotesPanel';
import WorkspaceSection from './WorkspaceSection';

interface WorkspacePanelProps {
  type: string;
  id: number;
  children?: React.ReactNode;
}

export default function WorkspacePanel({ type, id, children }: WorkspacePanelProps) {
  return (
    <div className="space-y-4">
      {children ?? (
        <>
          <TimelinePanel type={type} id={id} />
          <NotesPanel type={type} id={id} />
          <WorkspaceSection title="Audit Panel" defaultOpen={false} comingSoon />
          <WorkspaceSection title="Risk Panel"  defaultOpen={false} comingSoon />
        </>
      )}
    </div>
  );
}
