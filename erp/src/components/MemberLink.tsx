import Link from 'next/link';
import { cn } from '@/lib/utils';

interface MemberLinkProps {
  userId: number;
  name: string;
  className?: string;
}

export default function MemberLink({ userId, name, className }: MemberLinkProps) {
  return (
    <Link
      href={`/members/${userId}`}
      className={cn('text-blue-600 hover:underline font-medium', className)}
    >
      {name}
    </Link>
  );
}
