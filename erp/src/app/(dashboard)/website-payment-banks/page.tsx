import { redirect } from 'next/navigation';

// Website Payment Banks has been merged into the unified Bank Manager.
// All bank configuration now lives in ERP → Bank Manager (/banks).
export default function WebsitePaymentBanksRedirect() {
  redirect('/banks');
}
