import type { Metadata } from 'next';
import './globals.css';
import { getBrand } from '@/lib/brand_service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return { title: `${brand.brand_name} — ERP` };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
