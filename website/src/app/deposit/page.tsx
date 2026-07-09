import DepositForm from '@/app/components/DepositForm';

/* Middleware handles unauthenticated redirect to /login */
export default function DepositPage() {
  return (
    <div className="max-w-lg mx-auto lg:mx-0">
      <h1
        className="text-lg font-bold mb-6"
        style={{ color: 'var(--text-base)' }}
      >
        存款
      </h1>
      <DepositForm />
    </div>
  );
}
