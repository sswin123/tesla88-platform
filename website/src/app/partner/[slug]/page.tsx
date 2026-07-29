import { redirect } from 'next/navigation';

type Props = { params: Promise<{ slug: string }> };

export default async function PartnerAliasPage({ params }: Props) {
  const { slug } = await params;
  redirect(`/p/${slug}`);
}
