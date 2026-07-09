import WithdrawForm from '@/app/components/WithdrawForm';

/* Middleware handles unauthenticated redirect to /login */
export default function WithdrawPage() {
  return (
    <div className="max-w-lg mx-auto lg:mx-0">
      <h1
        className="text-lg font-bold mb-6"
        style={{ color: 'var(--text-base)' }}
      >
        提款
      </h1>
      <WithdrawForm />
    </div>
  );
}
