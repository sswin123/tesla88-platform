import { getBrand } from '@/lib/brand';
import ChatWindow from '@/app/components/ChatWindow';

export const dynamic = 'force-dynamic';

/* Middleware handles unauthenticated redirect to /login */
export default async function ChatPage() {
  const brand = await getBrand();
  return <ChatWindow brandName={brand.brand_name} />;
}
