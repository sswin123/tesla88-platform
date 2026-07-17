export function normalizeBankAccount(account: string): string {
  return account.replace(/[\s\-\.]/g, '');
}

export const MALAYSIA_BANKS = [
  'Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank',
  'AmBank', 'Bank Islam', 'Bank Rakyat', 'BSN', 'OCBC Bank', 'UOB Bank',
  'HSBC Bank', 'Standard Chartered', 'Alliance Bank', 'Affin Bank', 'Agrobank',
  'MBSB Bank', 'Bank Muamalat', 'Al Rajhi Bank', 'Citibank', 'GXBank',
  'Boost Bank', 'AEON Bank', "Touch 'n Go eWallet", 'ShopeePay', 'BigPay', 'Other',
] as const;

export function validateBankAccount(value: string): string {
  if (!value) return '银行账号为必填项';
  if (!/^\d+$/.test(value)) return '银行账号只能包含数字';
  if (value.length < 6)  return '银行账号最少 6 位数字';
  if (value.length > 20) return '银行账号最多 20 位数字';
  return '';
}

export function stripNonDigits(value: string): string {
  return value.replace(/\D/g, '');
}
