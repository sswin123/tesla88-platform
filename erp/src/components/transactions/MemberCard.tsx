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
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{children}</span>
    </div>
  );
}

export default function MemberCard({ userId, firstName, phone, publicId, availableBalance }: MemberCardProps) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Member</h2>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Name</span>
          <MemberLink userId={userId} name={firstName} />
        </div>
        <Row label="Phone">{phone}</Row>
        {publicId && <Row label="ID"><span className="font-mono text-blue-600">{publicId}</span></Row>}
        <div className="border-t pt-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Balance</span>
            <span className="font-semibold text-gray-900">
              RM {parseFloat(availableBalance ?? '0').toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
