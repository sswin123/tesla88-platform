'use client';

import MemberLink from '@/components/MemberLink';

interface MemberCardProps {
  userId: number;
  firstName: string;
  phone: string;
  publicId: string | null;
  availableBalance: string;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

export default function MemberCard({ userId, firstName, phone, publicId, availableBalance }: MemberCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Member</h2>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Name</span>
          <MemberLink userId={userId} name={firstName} />
        </div>
        <Row label="Phone">{phone}</Row>
        {publicId && <Row label="ID"><span className="font-mono text-blue-600">{publicId}</span></Row>}
        <div className="border-t pt-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Balance</span>
            <span className="font-semibold text-foreground">
              RM {parseFloat(availableBalance ?? '0').toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
