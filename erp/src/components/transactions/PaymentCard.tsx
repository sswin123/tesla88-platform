'use client';

interface DepositPaymentCardProps {
  depositAmount: string;
  bonusAmount: string;
  creditAmount: string;
  promoName: string | null | undefined;
  receivingBankName: string | null | undefined;
  receivingBankAccountName: string | null | undefined;
  receivingBankAccountNumber: string | null | undefined;
  receivingBankQrMediaId: number | null | undefined;
  paymentBank?: string;
}

interface WithdrawalPaymentCardProps {
  withdrawAmount: string;
  provider: string | undefined;
  gameUsername: string | undefined;
  bankName: string | undefined;
  bankAccount: string | undefined;
  bankHolderName: string | undefined;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

export function DepositPaymentCard({
  depositAmount,
  bonusAmount,
  creditAmount,
  promoName,
  receivingBankName,
  receivingBankAccountName,
  receivingBankAccountNumber,
  receivingBankQrMediaId,
  paymentBank,
}: DepositPaymentCardProps) {
  const bankDisplay = receivingBankName ?? paymentBank ?? '—';

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deposit Details</h2>
      <div className="space-y-2">
        <Row label="Amount">RM {parseFloat(depositAmount ?? '0').toFixed(2)}</Row>
        {parseFloat(bonusAmount ?? '0') > 0 && (
          <Row label="Bonus">
            <span className="text-emerald-600">
              +RM {parseFloat(bonusAmount ?? '0').toFixed(2)}
              {promoName ? ` (${promoName})` : ''}
            </span>
          </Row>
        )}
        <div className="border-t pt-2">
          <Row label="Total Credit">
            <span className="text-emerald-600 font-semibold">
              RM {parseFloat(creditAmount ?? '0').toFixed(2)}
            </span>
          </Row>
        </div>
      </div>

      {(receivingBankName || paymentBank) && (
        <>
          <div className="border-t pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Payment Bank</h3>
            <div className="space-y-1.5">
              <Row label="Bank">{bankDisplay}</Row>
              {receivingBankAccountNumber && (
                <Row label="Account">
                  <span className="font-mono">{receivingBankAccountNumber}</span>
                </Row>
              )}
              {receivingBankAccountName && (
                <Row label="Holder">{receivingBankAccountName}</Row>
              )}
            </div>
          </div>
          {receivingBankQrMediaId && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-2">QR Code</p>
              <img
                src={`/api/public/media/${receivingBankQrMediaId}`}
                alt="QR"
                className="max-h-32 rounded border"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function WithdrawalPaymentCard({
  withdrawAmount,
  provider,
  gameUsername,
  bankName,
  bankAccount,
  bankHolderName,
}: WithdrawalPaymentCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Withdrawal Details</h2>
      <div className="space-y-2">
        <Row label="Amount">
          <span className="font-semibold">RM {parseFloat(withdrawAmount ?? '0').toFixed(2)}</span>
        </Row>
        {provider && <Row label="Provider">{provider}</Row>}
        {gameUsername && <Row label="Game Account"><span className="font-mono">{gameUsername}</span></Row>}
      </div>

      {(bankName || bankAccount) && (
        <div className="border-t pt-3 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Bank Account</p>
          {bankName && <Row label="Bank">{bankName}</Row>}
          {bankAccount && <Row label="Account"><span className="font-mono">{bankAccount}</span></Row>}
          {bankHolderName && <Row label="Holder">{bankHolderName}</Row>}
        </div>
      )}
    </div>
  );
}
