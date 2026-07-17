export function normalizeBankAccount(account: string): string {
  return account.replace(/[\s\-\.]/g, '');
}
