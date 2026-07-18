'use client';

import { MemberProvider } from '@/lib/contexts/MemberContext';
import type { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return <MemberProvider>{children}</MemberProvider>;
}
