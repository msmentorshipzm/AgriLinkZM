import type { StaffPermission } from '../types/marketplace.ts';

export interface DelegatedRoleTemplate {
  id: string;
  title: string;
  description: string;
  permissions: StaffPermission[];
}

export const DELEGATED_ROLE_TEMPLATES: DelegatedRoleTemplate[] = [
  {
    id: 'payment_officer',
    title: 'Payment & MoMo Verification Officer',
    description: 'Automatically grants Payment Verification access to approve or reject MoMo Proof-of-Payment receipts.',
    permissions: ['verify_payments'],
  },
  {
    id: 'kyc_officer',
    title: 'Seller KYC & Site Inspector',
    description: 'Automatically grants KYC Verification access to review NRC, PACRA, ZRA TPIN, and farm GPS submissions.',
    permissions: ['verify_kyc'],
  },
  {
    id: 'trust_moderator',
    title: 'Trust, Safety & Scam Moderator',
    description: 'Automatically grants Trust & Scam Moderation access to investigate reports, freeze ads, and manage blacklists.',
    permissions: ['moderate_trust'],
  },
  {
    id: 'billing_coordinator',
    title: 'Billing & Trial Follow-Up Coordinator',
    description: 'Automatically grants Billing Follow-Up access to dispatch WhatsApp/SMS trial expiry and renewal notices.',
    permissions: ['billing_followup'],
  },
  {
    id: 'operations_lead',
    title: 'Operations & Compliance Lead (All Desk Access)',
    description: 'Automatically grants full delegated staff access across Payments, KYC, Billing Follow-Up, and Trust Moderation.',
    permissions: ['verify_payments', 'verify_kyc', 'billing_followup', 'moderate_trust'],
  },
  {
    id: 'custom',
    title: 'Custom Delegated Role',
    description: 'Manually select specific permissions below.',
    permissions: [],
  },
];

export function getRoleTemplateById(templateId: string): DelegatedRoleTemplate | undefined {
  return DELEGATED_ROLE_TEMPLATES.find((t) => t.id === templateId);
}

export function resolveDelegatedPermissions(
  templateId: string,
  requestedPermissions?: StaffPermission[]
): { roleTitle: string; permissions: StaffPermission[] } {
  const tpl = getRoleTemplateById(templateId);
  if (tpl && tpl.id !== 'custom') {
    return {
      roleTitle: tpl.title,
      permissions: [...tpl.permissions],
    };
  }
  const unique = Array.from(new Set(requestedPermissions || []));
  return {
    roleTitle: tpl ? tpl.title : 'Custom Delegated Role',
    permissions: unique,
  };
}

export function generateStaffUsername(
  fullName: string,
  existingUsernames: string[]
): string {
  const base = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join('.');

  const root = base || 'staff.member';
  const taken = new Set(existingUsernames.map((u) => u.toLowerCase()));
  if (!taken.has(root)) return root;

  let suffix = 2;
  while (taken.has(`${root}${suffix}`)) {
    suffix += 1;
  }
  return `${root}${suffix}`;
}

export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  const raw = password || '';
  if (raw.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (!/[a-zA-Z]/.test(raw) || !/[0-9]/.test(raw)) {
    return {
      valid: false,
      error: 'Password must include at least one letter and one number.',
    };
  }
  return { valid: true };
}
