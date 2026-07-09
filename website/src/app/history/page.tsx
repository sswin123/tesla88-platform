import TransactionTabs from '@/app/components/TransactionTabs';

/* Middleware handles unauthenticated redirect to /login */
export default function HistoryPage() {
  return (
    <div>
      <h1
        className="text-lg font-bold mb-5"
        style={{ color: 'var(--text-base)' }}
      >
        交易记录
      </h1>
      <TransactionTabs />
    </div>
  );
}
