export interface RoleDef {
  id: string;
  label: string;
  icon: string;
  locked: boolean;
}

export interface PermissionDef {
  key: string;
  label: string;
}

export interface PermissionGroup {
  module: string;
  permissions: PermissionDef[];
}

export const MANAGEABLE_ROLES: RoleDef[] = [
  { id: 'SUPER_ADMIN', label: 'Super Admin',  icon: '👑', locked: true  },
  { id: 'ADMIN',       label: 'Admin',        icon: '🛡',  locked: false },
  { id: 'SUPERVISOR',  label: 'Supervisor',   icon: '📊',  locked: false },
  { id: 'FINANCE',     label: 'Finance',      icon: '💰',  locked: false },
  { id: 'SUPPORT',     label: 'Support',      icon: '💬',  locked: false },
  { id: 'CS',          label: 'CS',           icon: '💬',  locked: false },
];

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    module: 'Dashboard',
    permissions: [
      { key: 'dashboard.view', label: 'View Dashboard' },
    ],
  },
  {
    module: 'Members',
    permissions: [
      { key: 'members.view',      label: 'View Members' },
      { key: 'members.edit',      label: 'Edit Members' },
      { key: 'member.view_phone', label: 'View Phone Numbers' },
      { key: 'member.bank.edit',  label: 'Edit Member Bank Info (with audit log)' },
    ],
  },
  {
    module: 'Finance',
    permissions: [
      { key: 'finance.view',   label: 'Finance Reports' },
      { key: 'analytics.view', label: 'Analytics' },
    ],
  },
  {
    module: 'Deposits',
    permissions: [
      { key: 'deposit.view',   label: 'View Deposits' },
      { key: 'deposit.manage', label: 'Approve Deposits' },
    ],
  },
  {
    module: 'Withdrawals',
    permissions: [
      { key: 'withdraw.view',   label: 'View Withdrawals' },
      { key: 'withdraw.manage', label: 'Approve Withdrawals' },
    ],
  },
  {
    module: 'Live Chat',
    permissions: [
      { key: 'livechat.view',   label: 'View Live Chat' },
      { key: 'livechat.manage', label: 'Manage Sessions' },
    ],
  },
  {
    module: 'Marketing',
    permissions: [
      { key: 'promotions.manage',   label: 'Promotions' },
      { key: 'broadcast.manage',    label: 'Broadcast' },
      { key: 'announcements.manage',label: 'Announcements' },
    ],
  },
  {
    module: 'Bot',
    permissions: [
      { key: 'bot.messages', label: 'Bot Messages' },
      { key: 'bot.settings', label: 'Bot Settings' },
    ],
  },
  {
    module: 'System',
    permissions: [
      { key: 'brand.settings',  label: 'Brand Settings' },
      { key: 'staff.manage',    label: 'Staff Management' },
      { key: 'website.settings',              label: 'Website Settings' },
      { key: 'website.builder.manage',        label: 'Website Builder (Homepage CMS)' },
      { key: 'website.banner.manage',         label: 'Website Banners' },
      { key: 'website.announcement.manage',   label: 'Website Announcements' },
      { key: 'website.game.manage',           label: 'Website Game Providers' },
      { key: 'maintenance.view',label: 'Maintenance' },
      { key: 'audit.view',      label: 'Audit Log' },
    ],
  },
  {
    module: 'Security',
    permissions: [
      { key: 'settings.manage',          label: 'Registration Security Settings' },
      { key: 'security.ratelimit.clear', label: 'Clear Login Rate Limit (Unlock IPs)' },
    ],
  },
  {
    module: 'Wallet Center',
    permissions: [
      { key: 'member.wallet.view',    label: 'View Wallet Summary' },
      { key: 'member.wallet.adjust',  label: 'Wallet Adjustment (Credit / Debit)' },
      { key: 'member.wallet.history', label: 'View Wallet History' },
      { key: 'member.wallet.audit',   label: 'View Wallet Audit Details' },
    ],
  },
  {
    module: 'Activity Log',
    permissions: [
      { key: 'member.activity.view', label: 'View Member Activity Log (Audit Center)' },
    ],
  },
  {
    module: 'Others',
    permissions: [
      { key: 'risk.view',         label: 'Risk Center' },
      { key: 'banks.manage',      label: 'Bank Manager' },
      { key: 'game.manage',       label: 'Game Accounts & Platform Settings (view + status)' },
      { key: 'game.credentials',  label: 'Gaming Platform: Edit Credentials, Reload, Export/Import (SuperAdmin only)' },
      { key: 'media.view',        label: 'Media Library' },
    ],
  },
];
