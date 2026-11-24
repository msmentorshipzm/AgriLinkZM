import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileBarChart2,
  KeyRound,
  Mail,
  MessageSquare,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Snowflake,
  Star,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { PROVINCE_NAMES, VERIFICATION_LABELS, ZAMBIA_PROVINCES } from '../data/zambia.ts';
import type {
  AccountStatus,
  AnalyticsStreamEvent,
  BlacklistRecord,
  ChatConversation,
  ChatMessage,
  EmailNotificationRecord,
  KycSubmission,
  Listing,
  ListingStatus,
  PaymentRecord,
  PlatformConfig,
  Review,
  ScamReport,
  StaffPermission,
  UserAccount,
  UserRole,
  VerificationTier,
} from '../types/marketplace.ts';
import {
  assignSystemId,
  buildCsvExport,
  buildReportedListingsOverview,
  computePortalMetricsReport,
  normalizeSystemIdInput,
} from '../utils/adminReporting.ts';
import {
  DELEGATED_ROLE_TEMPLATES,
  generateStaffUsername,
  getRoleTemplateById,
  resolveDelegatedPermissions,
} from '../utils/authRules.ts';
import { evaluateUserPendingPayment } from '../utils/billingNotifications.ts';
import {
  computeSellerAggregateRating,
  computeTrialStatus,
  formatZMW,
  isBuyerFeeEligible,
} from '../utils/marketplaceRules.ts';

export interface DispatchedStaffEmail {
  id: string;
  fromEmail: string;
  toEmail: string;
  toName: string;
  username: string;
  tempPassword: string;
  roleTitle: string;
  grantedPermissions: StaffPermission[];
  subject: string;
  body: string;
  deliveryMode: 'email_and_inbox' | 'in_app_dispatch';
  createdAt: number;
}

interface AdminPortalProps {
  currentUser: UserAccount;
  config: PlatformConfig;
  users: UserAccount[];
  listings: Listing[];
  reviews: Review[];
  payments: PaymentRecord[];
  kycSubmissions: KycSubmission[];
  scamReports: ScamReport[];
  blacklist: BlacklistRecord[];
  conversations: ChatConversation[];
  messages: ChatMessage[];
  recentEvents: AnalyticsStreamEvent[];
  emailNotifications: EmailNotificationRecord[];
  onlineCount: number;
  onInspectListing?: (listing: Listing) => void;
  onUpdateConfig: (updates: Partial<PlatformConfig>) => Promise<string | null>;
  onPaymentDecision: (paymentId: string, decision: 'approved' | 'rejected') => Promise<string | null>;
  onKycDecision: (kycId: string, decision: 'approved' | 'rejected') => Promise<string | null>;
  onScamDecision: (
    reportId: string,
    action: 'dismiss' | 'freeze_listing' | 'ban_blacklist'
  ) => Promise<string | null>;
  onDormancyScan: (deactivateFlagged: boolean) => Promise<{
    flaggedCount?: number;
    error?: string;
  }>;
  onUpdateUserStatus: (
    userId: string,
    accountStatus: UserAccount['accountStatus']
  ) => Promise<string | null>;
  onUpdateUser: (
    userId: string,
    updates: Partial<
      Pick<
        UserAccount,
        | 'name'
        | 'systemId'
        | 'businessName'
        | 'email'
        | 'phone'
        | 'province'
        | 'district'
        | 'verificationTier'
        | 'accountStatus'
        | 'role'
        | 'adminNote'
      >
    >
  ) => Promise<string | null>;
  onDeleteUser: (userId: string) => Promise<string | null>;
  onUpdateListingStatus: (listingId: string, status: ListingStatus) => Promise<string | null>;
  onDeleteListing: (listingId: string) => Promise<string | null>;
  onCreateStaff: (payload: {
    name: string;
    username?: string;
    email: string;
    phone: string;
    roleTemplateId: string;
    permissions: StaffPermission[];
  }) => Promise<{
    error?: string;
    staff?: UserAccount;
    dispatchedEmail?: DispatchedStaffEmail | null;
  }>;
  onUpdateStaffPermissions: (
    staffId: string,
    permissions: StaffPermission[]
  ) => Promise<string | null>;
  onSendBillingReminder: (
    userId: string,
    channel: 'SMS' | 'WhatsApp' | 'In-App'
  ) => Promise<string | null>;
  onChangePassword: (payload: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<string | null>;
  hasSeededData: boolean;
  onClearDemoData: () => Promise<{
    error?: string;
    remainingUsers?: number;
    remainingListings?: number;
  }>;
}

const ALL_PERMISSIONS: { id: StaffPermission; label: string }[] = [
  { id: 'verify_payments', label: 'Payment Verification' },
  { id: 'verify_kyc', label: 'KYC Verification' },
  { id: 'billing_followup', label: 'Billing Follow-Up' },
  { id: 'moderate_trust', label: 'Trust & Scam Moderation' },
];

const STATUS_BADGE_MAP: Record<AccountStatus, { label: string; classes: string }> = {
  trial_active: { label: 'Trial Active', classes: 'bg-[#EEF3EC] text-[#1B5E20] border-[#1B5E20]/25' },
  active_paid: { label: 'Active Paid', classes: 'bg-[#EEF3EC] text-[#1B5E20] border-[#1B5E20]/40' },
  payment_required: { label: 'Payment Due', classes: 'bg-[#FFFBEB] text-[#92400E] border-[#F59E0B]/40' },
  under_investigation: { label: 'Investigating', classes: 'bg-[#FFFBEB] text-[#B45309] border-[#F59E0B]' },
  frozen: { label: 'Frozen', classes: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#93C5FD]' },
  dormant: { label: 'Dormant', classes: 'bg-[#F3F4F6] text-[#4B5563] border-[#D1D5DB]' },
  suspended: { label: 'Suspended', classes: 'bg-[#FFF7ED] text-[#C2410C] border-[#FDBA74]' },
  banned: { label: 'Banned', classes: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FCA5A5]' },
};

function triggerCsvDownload(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  currentUser,
  config,
  users,
  listings,
  reviews,
  payments,
  kycSubmissions,
  scamReports,
  blacklist,
  conversations,
  messages,
  recentEvents,
  emailNotifications,
  onlineCount,
  onInspectListing,
  onUpdateConfig,
  onPaymentDecision,
  onKycDecision,
  onScamDecision,
  onDormancyScan,
  onUpdateUserStatus,
  onUpdateUser,
  onDeleteUser,
  onUpdateListingStatus,
  onDeleteListing,
  onCreateStaff,
  onUpdateStaffPermissions,
  onSendBillingReminder,
  onChangePassword,
  hasSeededData,
  onClearDemoData,
}) => {
  const isSuperAdmin = currentUser.role === 'super_admin';
  const hasPerm = (perm: StaffPermission) =>
    isSuperAdmin || currentUser.staffPermissions.includes(perm);

  const [tab, setTab] = useState<
    'analytics' | 'users' | 'monetization' | 'payments' | 'kyc' | 'trust' | 'lifecycle'
  >('analytics');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // User Directory & Action State
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('all');
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [confirmDeleteListingId, setConfirmDeleteListingId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [editSystemId, setEditSystemId] = useState('');
  const [editName, setEditName] = useState('');
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editProvince, setEditProvince] = useState('Lusaka');
  const [editDistrict, setEditDistrict] = useState('Lusaka');
  const [editRole, setEditRole] = useState<UserRole>('advertiser');
  const [editTier, setEditTier] = useState<VerificationTier>('tier1_id');
  const [editStatus, setEditStatus] = useState<AccountStatus>('trial_active');
  const [editAdminNote, setEditAdminNote] = useState('');
  const [savingUserEdit, setSavingUserEdit] = useState(false);

  // Config drafts
  const [trialDaysDraft, setTrialDaysDraft] = useState(String(config.defaultTrialDays));
  const [advFeeDraft, setAdvFeeDraft] = useState(String(config.advertiserMonthlyFeeZmw));
  const [buyerFeeDraft, setBuyerFeeDraft] = useState(String(config.buyerFeeAmountZmw));
  const [dormancyDraft, setDormancyDraft] = useState(String(config.dormancyThresholdDays));

  // New Staff Delegation Form
  const [staffRoleTemplateId, setStaffRoleTemplateId] = useState<string>('payment_officer');
  const [staffName, setStaffName] = useState('');
  const [staffUsername, setStaffUsername] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffPerms, setStaffPerms] = useState<StaffPermission[]>(
    resolveDelegatedPermissions('payment_officer').permissions
  );
  const [dispatchedEmail, setDispatchedEmail] = useState<DispatchedStaffEmail | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Immediate temporary password change form
  const [tempCurrentPass, setTempCurrentPass] = useState('');
  const [tempNewPass, setTempNewPass] = useState('');
  const [tempConfirmPass, setTempConfirmPass] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  const clearAlerts = () => {
    setFeedback(null);
    setErrorMsg(null);
  };

  const report = useMemo(
    () =>
      computePortalMetricsReport({
        users,
        listings,
        payments,
        kycSubmissions,
        scamReports,
        blacklist,
        conversations,
        messages,
      }),
    [users, listings, payments, kycSubmissions, scamReports, blacklist, conversations, messages]
  );

  const reportedListings = useMemo(
    () =>
      buildReportedListingsOverview({
        scamReports,
        listings,
        users,
        reviews,
      }),
    [scamReports, listings, users, reviews]
  );

  const usersById = useMemo(() => {
    const map: Record<string, UserAccount> = {};
    for (const u of users) map[u.id] = u;
    return map;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && u.accountStatus !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        u.systemId || '',
        u.name,
        u.username || '',
        u.businessName || '',
        u.email,
        u.phone,
        u.province,
        u.district,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [users, userSearch, roleFilter, statusFilter]);

  const openEditUserModal = (user: UserAccount) => {
    clearAlerts();
    setEditingUser(user);
    setEditSystemId(
      user.systemId ||
        assignSystemId(
          user.role,
          users.map((u) => u.systemId)
        )
    );
    setEditName(user.name);
    setEditBusinessName(user.businessName || '');
    setEditEmail(user.email);
    setEditPhone(user.phone);
    setEditProvince(user.province || 'Lusaka');
    setEditDistrict(user.district || ZAMBIA_PROVINCES[user.province || 'Lusaka']?.[0] || 'Lusaka');
    setEditRole(user.role);
    setEditTier(user.verificationTier);
    setEditStatus(user.accountStatus);
    setEditAdminNote(user.adminNote || '');
  };

  const handleSaveEditedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    clearAlerts();
    setSavingUserEdit(true);
    const err = await onUpdateUser(editingUser.id, {
      name: editName.trim(),
      systemId: isSuperAdmin ? normalizeSystemIdInput(editSystemId) : undefined,
      businessName: editBusinessName.trim(),
      email: editEmail.trim(),
      phone: editPhone.trim(),
      province: editProvince,
      district: editDistrict,
      verificationTier: editTier,
      accountStatus: editStatus,
      role: isSuperAdmin ? editRole : undefined,
      adminNote: editAdminNote.trim(),
    });
    setSavingUserEdit(false);
    if (err) {
      setErrorMsg(err);
    } else {
      setFeedback(`Updated user record & System ID for ${editName.trim()}.`);
      setEditingUser(null);
    }
  };

  const handleExportUsersCsv = () => {
    const csv = buildCsvExport(
      [
        'System ID',
        'Full Name',
        'Username',
        'Role',
        'Status',
        'Verification Tier',
        'Email',
        'Phone',
        'Province',
        'District',
        'Business Name',
        'Last Active',
      ],
      filteredUsers.map((u) => [
        u.systemId || 'UNASSIGNED',
        u.name,
        u.username || '',
        u.role,
        u.accountStatus,
        u.verificationTier,
        u.email,
        u.phone,
        u.province,
        u.district,
        u.businessName || '',
        new Date(u.lastActiveAt).toISOString(),
      ])
    );
    triggerCsvDownload(`agrilink-zm-users-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const handleExportFinancialCsv = () => {
    const csv = buildCsvExport(
      [
        'Reference',
        'Date',
        'Payer Name',
        'Phone',
        'Type',
        'Method',
        'Network',
        'Amount (ZMW)',
        'Status',
        'Transaction ID',
        'Reviewed By',
      ],
      payments.map((p) => [
        p.referenceCode,
        new Date(p.createdAt).toISOString(),
        p.userName,
        p.userPhone,
        p.paymentType,
        p.method,
        p.network,
        p.amountZmw.toFixed(2),
        p.status,
        p.transactionId,
        p.reviewedBy || '',
      ])
    );
    triggerCsvDownload(`agrilink-zm-money-collected-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const handleExportPortalSummaryCsv = () => {
    const csv = buildCsvExport(
      [
        'Province',
        'Total Users',
        'Advertisers',
        'Buyers',
        'Active Listings',
        'Impressions',
        'Buyer Contact Reveals',
      ],
      report.provincialBreakdown.map((row) => [
        row.province,
        row.usersCount,
        row.advertisersCount,
        row.buyersCount,
        row.activeListingsCount,
        row.impressions,
        row.contactReveals,
      ])
    );
    triggerCsvDownload(`agrilink-zm-portal-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const pendingPayments = payments.filter((p) => p.status === 'pending');
  const pendingKyc = kycSubmissions.filter((k) => k.status === 'pending');
  const openScamReports = scamReports.filter((s) => s.status === 'open');
  const advertisers = users.filter((u) => u.role === 'advertiser');
  const staffMembers = users.filter((u) => u.role === 'staff');
  const selectedTemplate = getRoleTemplateById(staffRoleTemplateId) || DELEGATED_ROLE_TEMPLATES[0];
  const existingUsernames = users
    .map((u) => u.username)
    .filter((un): un is string => Boolean(un));
  const autoUsernamePreview = staffName.trim()
    ? generateStaffUsername(staffName, existingUsernames)
    : 'auto.generated';

  const handleSaveMonetizationNumbers = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    const err = await onUpdateConfig({
      defaultTrialDays: Number(trialDaysDraft),
      advertiserMonthlyFeeZmw: Number(advFeeDraft),
      buyerFeeAmountZmw: Number(buyerFeeDraft),
      dormancyThresholdDays: Number(dormancyDraft),
    });
    if (err) setErrorMsg(err);
    else setFeedback('Platform trial durations, ZMW fees, and dormancy thresholds updated.');
  };

  const handleToggleSwitch = async (updates: Partial<PlatformConfig>, successLabel: string) => {
    clearAlerts();
    const err = await onUpdateConfig(updates);
    if (err) setErrorMsg(err);
    else setFeedback(successLabel);
  };

  const handleTemplateSelect = (templateId: string) => {
    setStaffRoleTemplateId(templateId);
    if (templateId !== 'custom') {
      setStaffPerms(resolveDelegatedPermissions(templateId).permissions);
    }
  };

  const handleStaffCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    setDispatchedEmail(null);
    setCopiedCreds(false);
    const res = await onCreateStaff({
      name: staffName.trim(),
      username: staffUsername.trim() || undefined,
      email: staffEmail.trim(),
      phone: staffPhone.trim(),
      roleTemplateId: staffRoleTemplateId,
      permissions: staffPerms,
    });
    if (res.error) {
      setErrorMsg(res.error);
      return;
    }
    setStaffName('');
    setStaffUsername('');
    setStaffEmail('');
    setStaffPhone('');
    if (res.dispatchedEmail) {
      setDispatchedEmail(res.dispatchedEmail);
    }
    setFeedback(
      `Delegated Staff account created (${res.staff?.delegatedRoleTitle || selectedTemplate.title}) with automatic access granted and credential email notification dispatched.`
    );
  };

  const handleImmediatePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    if (!tempCurrentPass || !tempNewPass) {
      setErrorMsg('Enter your temporary password and your new password.');
      return;
    }
    if (tempNewPass !== tempConfirmPass) {
      setErrorMsg('New passwords do not match.');
      return;
    }
    setChangingPass(true);
    const err = await onChangePassword({
      currentPassword: tempCurrentPass,
      newPassword: tempNewPass,
    });
    setChangingPass(false);
    if (err) {
      setErrorMsg(err);
    } else {
      setTempCurrentPass('');
      setTempNewPass('');
      setTempConfirmPass('');
      setFeedback('Your personal password is now active. You will use it on your next sign-in.');
    }
  };

  const buyerEligible = isBuyerFeeEligible(config);

  return (
    <main className="mx-auto max-w-7xl px-4 pt-8 pb-24 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 border-b border-[#E5E7EB] pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-semibold text-[#1B5E20]">
            {isSuperAdmin
              ? 'Super Admin Unrestricted Command Center'
              : `Delegated Staff Desk · ${currentUser.delegatedRoleTitle || 'Assigned Role'}`}{' '}
            · {onlineCount} Live Connected Sessions
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#111827]">
            AgriLink ZM Governance &amp; Master Analytics
          </h1>
        </div>
        <div className="font-mono text-xs text-[#4B5563]">
          Signed in as: <strong className="text-[#111827]">{currentUser.name}</strong>{' '}
          {currentUser.username ? `(@${currentUser.username})` : ''}
        </div>
      </div>

      {currentUser.mustChangePassword && (
        <div className="mt-5 rounded-xl border border-[#F59E0B] bg-[#FFFBEB] p-5">
          <div className="flex items-start gap-2.5">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-[#B45309]" />
            <div className="flex-1">
              <div className="text-sm font-bold text-[#92400E]">
                Temporary Password Active — Change Your Password Immediately
              </div>
              <p className="mt-1 text-xs text-[#78350F]">
                You signed in with an admin-issued temporary password. Set your private password right away below (min 8 characters with letters and numbers).
              </p>
              <form
                onSubmit={handleImmediatePasswordChange}
                className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-4"
              >
                <input
                  type="password"
                  value={tempCurrentPass}
                  onChange={(e) => setTempCurrentPass(e.target.value)}
                  placeholder="Temporary password"
                  aria-label="Current temporary password"
                  className="rounded-lg border border-[#F59E0B]/50 bg-white px-3 py-2 text-xs text-[#111827]"
                />
                <input
                  type="password"
                  value={tempNewPass}
                  onChange={(e) => setTempNewPass(e.target.value)}
                  placeholder="New private password"
                  aria-label="New private password"
                  className="rounded-lg border border-[#F59E0B]/50 bg-white px-3 py-2 text-xs text-[#111827]"
                />
                <input
                  type="password"
                  value={tempConfirmPass}
                  onChange={(e) => setTempConfirmPass(e.target.value)}
                  placeholder="Confirm new password"
                  aria-label="Confirm new password"
                  className="rounded-lg border border-[#F59E0B]/50 bg-white px-3 py-2 text-xs text-[#111827]"
                />
                <button
                  type="submit"
                  disabled={changingPass}
                  className="rounded-lg bg-[#1B5E20] px-4 py-2 text-xs font-semibold text-white hover:bg-[#154A19] disabled:opacity-60"
                >
                  {changingPass ? 'Updating...' : 'Update Password Now'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div className="mt-5 rounded-lg border border-[#1B5E20]/30 bg-[#EEF3EC] px-4 py-3 text-xs font-medium text-[#1B5E20]">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="mt-5 rounded-lg border border-[#C2410C]/40 bg-[#FFF7ED] px-4 py-3 text-xs font-medium text-[#9A3412]">
          {errorMsg}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-[#E5E7EB] pb-3">
        <button
          type="button"
          onClick={() => setTab('analytics')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
            tab === 'analytics'
              ? 'bg-[#1B5E20] text-white'
              : 'border border-[#E5E7EB] bg-white text-[#4B5563]'
          }`}
        >
          <FileBarChart2 className="h-3.5 w-3.5" />
          Executive Reports
        </button>

        {(isSuperAdmin || hasPerm('moderate_trust')) && (
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              tab === 'users'
                ? 'bg-[#1B5E20] text-white'
                : 'border border-[#E5E7EB] bg-white text-[#4B5563]'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            System Users &amp; IDs ({users.length})
          </button>
        )}

        <button
          type="button"
          onClick={() => setTab('monetization')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
            tab === 'monetization'
              ? 'bg-[#1B5E20] text-white'
              : 'border border-[#E5E7EB] bg-white text-[#4B5563]'
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          Monetization &amp; Trials
        </button>

        {hasPerm('verify_payments') && (
          <button
            type="button"
            onClick={() => setTab('payments')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              tab === 'payments'
                ? 'bg-[#1B5E20] text-white'
                : 'border border-[#E5E7EB] bg-white text-[#4B5563]'
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            Payments Queue ({pendingPayments.length})
          </button>
        )}

        {hasPerm('verify_kyc') && (
          <button
            type="button"
            onClick={() => setTab('kyc')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              tab === 'kyc'
                ? 'bg-[#1B5E20] text-white'
                : 'border border-[#E5E7EB] bg-white text-[#4B5563]'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            KYC Queue ({pendingKyc.length})
          </button>
        )}

        {hasPerm('moderate_trust') && (
          <button
            type="button"
            onClick={() => setTab('trust')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              tab === 'trust'
                ? 'bg-[#1B5E20] text-white'
                : 'border border-[#E5E7EB] bg-white text-[#4B5563]'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Trust &amp; Blacklist ({openScamReports.length})
          </button>
        )}

        {(isSuperAdmin || hasPerm('moderate_trust')) && (
          <button
            type="button"
            onClick={() => setTab('lifecycle')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              tab === 'lifecycle'
                ? 'bg-[#1B5E20] text-white'
                : 'border border-[#E5E7EB] bg-white text-[#4B5563]'
          }`}
          >
            <Activity className="h-3.5 w-3.5" />
            Lifecycle &amp; Staff
          </button>
        )}
      </div>

      {/* Tab 1: Executive Financial & Portal Reporting Dashboard */}
      {tab === 'analytics' && (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white px-5 py-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#111827]">
                Financial &amp; Portal Operations Report
              </h2>
              <p className="text-xs text-[#4B5563]">
                Live summary of ZMW money collected, Mobile Money channel totals, account health, and provincial activity.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportFinancialCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#1B5E20] px-3 py-1.5 text-xs font-semibold text-[#1B5E20] hover:bg-[#EEF3EC]"
              >
                <Download className="h-3.5 w-3.5" />
                Export Money Collected CSV
              </button>
              <button
                type="button"
                onClick={handleExportPortalSummaryCsv}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B5E20] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#154A19]"
              >
                <Download className="h-3.5 w-3.5" />
                Export Portal Report CSV
              </button>
            </div>
          </div>

          {/* Money Collected KPI Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[#1B5E20]/30 bg-white p-5">
              <div className="text-xs font-medium text-[#4B5563]">Total Money Collected (Approved)</div>
              <div className="mt-2 font-mono text-2xl font-bold text-[#1B5E20] tabular-nums">
                {formatZMW(report.financial.totalCollectedZmw)}
              </div>
              <div className="mt-1 text-xs text-[#4B5563] tabular-nums">
                {report.financial.approvedCount} verified payment(s)
              </div>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <div className="text-xs font-medium text-[#4B5563]">Pending MoMo Verification</div>
              <div className="mt-2 font-mono text-2xl font-bold text-[#B45309] tabular-nums">
                {formatZMW(report.financial.pendingZmw)}
              </div>
              <div className="mt-1 text-xs text-[#4B5563] tabular-nums">
                {report.financial.pendingCount} awaiting approval · {formatZMW(report.financial.rejectedZmw)} rejected
              </div>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <div className="text-xs font-medium text-[#4B5563]">Revenue by Plan Type</div>
              <div className="mt-2 font-mono text-lg font-bold text-[#111827] tabular-nums">
                Sellers: {formatZMW(report.financial.advertiserCollectedZmw)}
              </div>
              <div className="mt-1 font-mono text-xs text-[#4B5563] tabular-nums">
                Buyers: {formatZMW(report.financial.buyerFeeCollectedZmw)}
              </div>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <div className="text-xs font-medium text-[#4B5563]">Collection Method Split</div>
              <div className="mt-2 font-mono text-sm font-bold text-[#111827] tabular-nums">
                Flutterwave USSD: {formatZMW(report.financial.byMethod.flutterwaveUssdZmw)}
              </div>
              <div className="mt-1 font-mono text-xs text-[#4B5563] tabular-nums">
                Manual PoP: {formatZMW(report.financial.byMethod.manualPopZmw)} ({report.financial.byMethod.manualPopCount})
              </div>
            </div>
          </div>

          {/* Portal Activity & User Base KPI Row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <div className="text-xs font-medium text-[#4B5563]">System Users &amp; Assigned IDs</div>
              <div className="mt-2 font-mono text-2xl font-bold text-[#111827] tabular-nums">
                {report.users.total}
              </div>
              <div className="mt-1 text-xs text-[#4B5563] tabular-nums">
                {report.users.advertisers} sellers · {report.users.buyers} buyers · {report.users.staff} staff
              </div>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <div className="text-xs font-medium text-[#4B5563]">Account Governance Health</div>
              <div className="mt-2 font-mono text-2xl font-bold text-[#111827] tabular-nums">
                {report.users.byStatus.activeOrTrial} Active
              </div>
              <div className="mt-1 text-xs text-[#C2410C] tabular-nums">
                {report.users.byStatus.underInvestigation + report.users.byStatus.frozen} investigating/frozen ·{' '}
                {report.users.byStatus.suspended + report.users.byStatus.banned} suspended/banned
              </div>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <div className="text-xs font-medium text-[#4B5563]">Produce Ads &amp; Engagement</div>
              <div className="mt-2 font-mono text-2xl font-bold text-[#111827] tabular-nums">
                {report.portalActivity.activeListings} / {report.portalActivity.totalListings}
              </div>
              <div className="mt-1 text-xs text-[#4B5563] tabular-nums">
                {report.portalActivity.totalImpressions.toLocaleString()} impressions ·{' '}
                {report.portalActivity.totalContactReveals} reveals ({report.portalActivity.contactConversionPct}%)
              </div>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <div className="text-xs font-medium text-[#4B5563]">Trust, KYC &amp; Chat Volume</div>
              <div className="mt-2 font-mono text-2xl font-bold text-[#111827] tabular-nums">
                {report.portalActivity.messagesCount} Msgs
              </div>
              <div className="mt-1 text-xs text-[#4B5563] tabular-nums">
                {report.portalActivity.conversationsCount} chats · {report.portalActivity.pendingKycCount} KYC ·{' '}
                {report.portalActivity.openScamReportsCount} reports
              </div>
            </div>
          </div>

          {/* Money Collected by Mobile Money Network + Verification Tiers */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white lg:col-span-6">
              <div className="border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
                Money Collected by Zambian Mobile Money Network
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#E5E7EB] bg-[#F9FAF8] text-[#4B5563]">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Network</th>
                      <th className="px-4 py-2.5 font-semibold">Collected (ZMW)</th>
                      <th className="px-4 py-2.5 font-semibold">Approved Txns</th>
                      <th className="px-4 py-2.5 font-semibold">Pending PoP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {report.financial.byNetwork.map((row) => (
                      <tr key={row.network}>
                        <td className="px-4 py-3 font-semibold text-[#111827]">{row.network}</td>
                        <td className="px-4 py-3 font-mono font-bold text-[#1B5E20] tabular-nums">
                          {formatZMW(row.collectedZmw)}
                        </td>
                        <td className="px-4 py-3 font-mono text-[#374151] tabular-nums">
                          {row.approvedCount}
                        </td>
                        <td className="px-4 py-3 font-mono text-[#B45309] tabular-nums">
                          {formatZMW(row.pendingZmw)} ({row.pendingCount})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white lg:col-span-6">
              <div className="border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
                System Verification &amp; Account Breakdown
              </div>
              <div className="grid grid-cols-2 gap-3 p-5 text-xs">
                <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-3">
                  <div className="text-[#4B5563]">Tier 3 Site-Verified</div>
                  <div className="mt-1 font-mono text-lg font-bold text-[#1B5E20]">
                    {report.users.byTier.tier3_site}
                  </div>
                </div>
                <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-3">
                  <div className="text-[#4B5563]">Tier 2 PACRA/ZRA Business</div>
                  <div className="mt-1 font-mono text-lg font-bold text-[#111827]">
                    {report.users.byTier.tier2_business}
                  </div>
                </div>
                <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-3">
                  <div className="text-[#4B5563]">Tier 1 ID Verified</div>
                  <div className="mt-1 font-mono text-lg font-bold text-[#111827]">
                    {report.users.byTier.tier1_id}
                  </div>
                </div>
                <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-3">
                  <div className="text-[#4B5563]">Verified vs Pending Emails</div>
                  <div className="mt-1 font-mono text-lg font-bold text-[#111827]">
                    {report.users.verifiedEmails} / {report.users.unverifiedEmails} unverified
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Provincial Breakdown Table */}
          <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
            <div className="border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
              All 10 Zambian Provinces — Portal Adoption &amp; Lead Report
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E5E7EB] bg-[#F9FAF8] text-[#4B5563]">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Province</th>
                    <th className="px-4 py-2.5 font-semibold">Users</th>
                    <th className="px-4 py-2.5 font-semibold">Sellers</th>
                    <th className="px-4 py-2.5 font-semibold">Buyers</th>
                    <th className="px-4 py-2.5 font-semibold">Active Ads</th>
                    <th className="px-4 py-2.5 font-semibold">Impressions</th>
                    <th className="px-4 py-2.5 font-semibold">Contact Reveals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {report.provincialBreakdown.map((row) => (
                    <tr key={row.province}>
                      <td className="px-4 py-2.5 font-semibold text-[#111827]">{row.province}</td>
                      <td className="px-4 py-2.5 font-mono tabular-nums">{row.usersCount}</td>
                      <td className="px-4 py-2.5 font-mono tabular-nums">{row.advertisersCount}</td>
                      <td className="px-4 py-2.5 font-mono tabular-nums">{row.buyersCount}</td>
                      <td className="px-4 py-2.5 font-mono tabular-nums">{row.activeListingsCount}</td>
                      <td className="px-4 py-2.5 font-mono tabular-nums">{row.impressions.toLocaleString()}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-[#1B5E20] tabular-nums">
                        {row.contactReveals}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Telemetry Stream */}
          <div className="rounded-xl border border-[#E5E7EB] bg-white">
            <div className="border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
              Real-Time SSE Platform Telemetry Feed
            </div>
            <div className="max-h-80 divide-y divide-[#E5E7EB] overflow-y-auto">
              {recentEvents.map((evt) => (
                <div key={evt.id} className="flex items-center justify-between gap-4 px-5 py-3 text-xs">
                  <div>
                    <span className="font-mono font-semibold text-[#1B5E20] uppercase">
                      {evt.type.replace('_', ' ')}
                    </span>
                    <span className="mx-2 text-[#9CA3AF]">·</span>
                    <span className="text-[#111827]">{evt.message}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[#6B7280] tabular-nums">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 1B: System Users Directory, ID Assignment & Moderation Controls */}
      {tab === 'users' && (isSuperAdmin || hasPerm('moderate_trust')) && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-[#111827]">
                  Active System Users &amp; Assigned System IDs ({filteredUsers.length} of {users.length})
                </h2>
                <p className="text-xs text-[#4B5563]">
                  Inspect every account on the portal, edit or reassign unique System ID numbers, investigate, freeze, suspend, reactivate, or delete records.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportUsersCsv}
                className="inline-flex items-center gap-1.5 self-start rounded-lg border border-[#1B5E20] px-3 py-1.5 text-xs font-semibold text-[#1B5E20] hover:bg-[#EEF3EC]"
              >
                <Download className="h-3.5 w-3.5" />
                Export Users &amp; IDs CSV
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[#6B7280]" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search name, AZM ID, email, phone..."
                  aria-label="Search system users"
                  className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] py-2 pr-3 pl-9 text-xs text-[#111827] focus:border-[#1B5E20] focus:bg-white focus:outline-none"
                />
              </div>
              <select
                aria-label="Filter users by role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
                className="rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs font-medium text-[#111827]"
              >
                <option value="all">All Roles ({users.length})</option>
                <option value="advertiser">Advertisers / Sellers</option>
                <option value="buyer">Buyers</option>
                <option value="staff">Delegated Staff</option>
                <option value="super_admin">Super Admin</option>
              </select>
              <select
                aria-label="Filter users by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as AccountStatus | 'all')}
                className="rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs font-medium text-[#111827]"
              >
                <option value="all">All Account Statuses</option>
                <option value="trial_active">Trial Active</option>
                <option value="active_paid">Active Paid</option>
                <option value="under_investigation">Under Investigation</option>
                <option value="frozen">Frozen</option>
                <option value="suspended">Suspended</option>
                <option value="dormant">Dormant</option>
                <option value="banned">Banned</option>
                <option value="payment_required">Payment Required</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
            <div className="divide-y divide-[#E5E7EB]">
              {filteredUsers.map((u) => {
                const statusBadge = STATUS_BADGE_MAP[u.accountStatus] || STATUS_BADGE_MAP.trial_active;
                const userListingsCount = listings.filter((l) => l.sellerId === u.id).length;
                const isProtectedAdmin = u.id === 'usr-admin-1' || u.id === currentUser.id;

                return (
                  <div
                    key={u.id}
                    className="flex flex-col justify-between gap-4 p-4 lg:flex-row lg:items-center"
                  >
                    <div className="space-y-1 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded border border-[#1B5E20]/30 bg-[#EEF3EC] px-2 py-0.5 font-mono text-[11px] font-bold text-[#1B5E20]">
                          {u.systemId || 'UNASSIGNED'}
                        </span>
                        <span className="font-bold text-[#111827]">
                          {u.name}
                          {u.businessName ? ` · ${u.businessName}` : ''}
                        </span>
                        <span className="rounded bg-[#F3F5F2] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-[#374151]">
                          {u.role.replace('_', ' ')}
                        </span>
                        <span
                          className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${statusBadge.classes}`}
                        >
                          {statusBadge.label}
                        </span>
                        {u.emailVerified === false && (
                          <span className="rounded border border-[#F59E0B] bg-[#FFFBEB] px-2 py-0.5 text-[11px] font-semibold text-[#92400E]">
                            Email Unverified
                          </span>
                        )}
                      </div>

                      <div className="text-[#4B5563]">
                        {u.username ? `@${u.username} · ` : ''}
                        {u.email} · {u.phone} · {u.province}, {u.district} ·{' '}
                        {VERIFICATION_LABELS[u.verificationTier]} · {userListingsCount} ad(s)
                      </div>

                      <div className="text-[11px] text-[#6B7280]">
                        Last active: {new Date(u.lastActiveAt).toLocaleString()}
                        {u.adminNote ? ` · Governance Note: ${u.adminNote}` : ''}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        aria-label={`Edit / Assign ID for ${u.name}`}
                        onClick={() => openEditUserModal(u)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#111827] hover:border-[#1B5E20]"
                      >
                        <Edit3 className="h-3 w-3" />
                        Edit / Assign ID
                      </button>

                      {!isProtectedAdmin && (
                        <>
                          <button
                            type="button"
                            aria-label={`Investigate ${u.name}`}
                            onClick={async () => {
                              clearAlerts();
                              const err = await onUpdateUserStatus(u.id, 'under_investigation');
                              if (err) setErrorMsg(err);
                              else setFeedback(`${u.name} (${u.systemId}) placed under investigation.`);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-2.5 py-1.5 text-[11px] font-semibold text-[#92400E]"
                          >
                            <ShieldAlert className="h-3 w-3" />
                            Investigate
                          </button>

                          <button
                            type="button"
                            aria-label={`Freeze ${u.name}`}
                            onClick={async () => {
                              clearAlerts();
                              const err = await onUpdateUserStatus(u.id, 'frozen');
                              if (err) setErrorMsg(err);
                              else setFeedback(`${u.name} (${u.systemId}) account and ads frozen.`);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#93C5FD] bg-[#EFF6FF] px-2.5 py-1.5 text-[11px] font-semibold text-[#1D4ED8]"
                          >
                            <Snowflake className="h-3 w-3" />
                            Freeze
                          </button>

                          <button
                            type="button"
                            aria-label={`Suspend ${u.name}`}
                            onClick={async () => {
                              clearAlerts();
                              const err = await onUpdateUserStatus(u.id, 'suspended');
                              if (err) setErrorMsg(err);
                              else setFeedback(`${u.name} (${u.systemId}) suspended.`);
                            }}
                            className="rounded-lg border border-[#FDBA74] bg-[#FFF7ED] px-2.5 py-1.5 text-[11px] font-semibold text-[#C2410C]"
                          >
                            Suspend
                          </button>

                          {(u.accountStatus === 'frozen' ||
                            u.accountStatus === 'under_investigation' ||
                            u.accountStatus === 'suspended' ||
                            u.accountStatus === 'dormant' ||
                            u.accountStatus === 'banned') && (
                            <button
                              type="button"
                              aria-label={`Reactivate ${u.name}`}
                              onClick={async () => {
                                clearAlerts();
                                const err = await onUpdateUserStatus(u.id, 'trial_active');
                                if (err) setErrorMsg(err);
                                else setFeedback(`${u.name} (${u.systemId}) reactivated.`);
                              }}
                              className="rounded-lg bg-[#1B5E20] px-2.5 py-1.5 text-[11px] font-semibold text-white"
                            >
                              Reactivate
                            </button>
                          )}

                          {isSuperAdmin &&
                            (confirmDeleteUserId === u.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  aria-label={`Confirm Delete ${u.name}`}
                                  onClick={async () => {
                                    clearAlerts();
                                    const err = await onDeleteUser(u.id);
                                    setConfirmDeleteUserId(null);
                                    if (err) setErrorMsg(err);
                                    else setFeedback(`Permanently deleted ${u.name} (${u.systemId}).`);
                                  }}
                                  className="rounded-lg bg-[#B91C1C] px-2.5 py-1.5 text-[11px] font-semibold text-white"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteUserId(null)}
                                  className="rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-[11px] font-semibold text-[#4B5563]"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Delete ${u.name}`}
                                onClick={() => setConfirmDeleteUserId(u.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#FCA5A5] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2]"
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </button>
                            ))}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Produce Listings Direct Governance Controls */}
          <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
            <div className="border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5">
              <h3 className="text-sm font-bold text-[#111827]">
                Produce Listings Moderation ({listings.length})
              </h3>
              <p className="text-xs text-[#4B5563]">
                Investigate, freeze, restore active, or delete individual marketplace advertisements.
              </p>
            </div>
            <div className="divide-y divide-[#E5E7EB]">
              {listings.map((item) => {
                const seller = usersById[item.sellerId];
                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between gap-3 p-4 lg:flex-row lg:items-center"
                  >
                    <div className="space-y-1 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[#111827]">{item.title}</span>
                        <span className="font-mono font-semibold text-[#1B5E20]">
                          {formatZMW(item.priceZmw)}
                        </span>
                        <span className="rounded border border-[#E5E7EB] bg-[#F9FAF8] px-2 py-0.5 font-mono text-[11px] uppercase text-[#374151]">
                          {item.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-[#4B5563]">
                        Seller: {seller?.name || item.sellerId} ({seller?.systemId || 'N/A'}) ·{' '}
                        {item.province}, {item.district} · {item.impressions} impressions ·{' '}
                        {item.contactReveals} reveals
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {item.status !== 'under_investigation' && (
                        <button
                          type="button"
                          aria-label={`Investigate and freeze listing ${item.title}`}
                          onClick={async () => {
                            clearAlerts();
                            const err = await onUpdateListingStatus(item.id, 'under_investigation');
                            if (err) setErrorMsg(err);
                            else setFeedback(`Listing "${item.title}" frozen under investigation.`);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-2.5 py-1.5 text-[11px] font-semibold text-[#92400E]"
                        >
                          <Snowflake className="h-3 w-3" />
                          Investigate &amp; Freeze
                        </button>
                      )}
                      {item.status !== 'active' && (
                        <button
                          type="button"
                          aria-label={`Restore active listing ${item.title}`}
                          onClick={async () => {
                            clearAlerts();
                            const err = await onUpdateListingStatus(item.id, 'active');
                            if (err) setErrorMsg(err);
                            else setFeedback(`Listing "${item.title}" restored to active.`);
                          }}
                          className="rounded-lg bg-[#1B5E20] px-2.5 py-1.5 text-[11px] font-semibold text-white"
                        >
                          Restore Active
                        </button>
                      )}
                      {confirmDeleteListingId === item.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`Confirm delete listing ${item.title}`}
                            onClick={async () => {
                              clearAlerts();
                              const err = await onDeleteListing(item.id);
                              setConfirmDeleteListingId(null);
                              if (err) setErrorMsg(err);
                              else setFeedback(`Deleted listing "${item.title}".`);
                            }}
                            className="rounded-lg bg-[#B91C1C] px-2.5 py-1.5 text-[11px] font-semibold text-white"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteListingId(null)}
                            className="rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-[11px] font-semibold text-[#4B5563]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Delete listing ${item.title}`}
                          onClick={() => setConfirmDeleteListingId(item.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#FCA5A5] px-2.5 py-1.5 text-[11px] font-semibold text-[#B91C1C]"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Monetization & Trial Switches */}
      {tab === 'monetization' && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-5 rounded-xl border border-[#E5E7EB] bg-white p-6 lg:col-span-6">
            <h2 className="font-display text-lg font-bold text-[#111827]">
              Global Payment &amp; Trial Switches
            </h2>
            <div className="rounded-lg border border-[#1B5E20]/25 bg-[#EEF3EC] p-3 text-xs text-[#1B5E20]">
              {!config.advertiserPaymentRequired && !config.buyerFeeEnabled
                ? 'Launch Mode (Free): Both payment switches are OFF, so all pricing sections, trial fee banners, and Mobile Money prompts are completely hidden from buyers and sellers.'
                : 'Monetization Active: Public pricing, trial notifications, and Mobile Money checkout prompts are visible for all enabled switches.'}
            </div>
            {!isSuperAdmin && (
              <div className="rounded-lg border border-[#F59E0B]/40 bg-[#FFFBEB] p-3 text-xs text-[#78350F]">
                Delegated Staff have read-only visibility here. Master billing switches are restricted to Super Admin.
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-4">
                <div>
                  <div className="text-sm font-bold text-[#111827]">
                    Advertiser Paid Billing Gate
                  </div>
                  <div className="text-xs text-[#4B5563]">
                    When ON, expired trials auto-pause listings until ZMW {config.advertiserMonthlyFeeZmw.toFixed(2)}/mo is paid.
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!isSuperAdmin}
                  onClick={() =>
                    handleToggleSwitch(
                      { advertiserPaymentRequired: !config.advertiserPaymentRequired },
                      `Advertiser payment gate turned ${!config.advertiserPaymentRequired ? 'ON' : 'OFF'}.`
                    )
                  }
                  className={`rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${
                    config.advertiserPaymentRequired ? 'bg-[#1B5E20]' : 'bg-[#4B5563]'
                  }`}
                >
                  {config.advertiserPaymentRequired ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="space-y-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-bold text-[#111827]">
                      Buyer K{config.buyerFeeAmountZmw.toFixed(2)} Monthly Access Fee
                    </div>
                    <div className="text-xs text-[#4B5563]">
                      Requires 3+ months platform traction (90+ days since launch or manual override).
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!isSuperAdmin}
                    onClick={() =>
                      handleToggleSwitch(
                        { buyerFeeEnabled: !config.buyerFeeEnabled },
                        `Buyer micro-fee turned ${!config.buyerFeeEnabled ? 'ON' : 'OFF'}.`
                      )
                    }
                    className={`rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${
                      config.buyerFeeEnabled ? 'bg-[#C2410C]' : 'bg-[#4B5563]'
                    }`}
                  >
                    {config.buyerFeeEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                <label className="flex items-center gap-2 text-xs text-[#374151]">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    checked={config.buyerTractionMonthsOverride}
                    onChange={(e) =>
                      handleToggleSwitch(
                        { buyerTractionMonthsOverride: e.target.checked },
                        'Updated 3-month buyer fee traction override.'
                      )
                    }
                    className="h-4 w-4 accent-[#1B5E20]"
                  />
                  <span>
                    Override 3-month traction lock ({buyerEligible ? 'Eligible now' : 'Locked < 90 days'})
                  </span>
                </label>
              </div>
            </div>

            <form onSubmit={handleSaveMonetizationNumbers} className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label htmlFor="cfg-trial" className="block text-xs font-medium text-[#4B5563]">
                  Free Trial Days (New Sellers)
                </label>
                <input
                  id="cfg-trial"
                  type="number"
                  disabled={!isSuperAdmin}
                  value={trialDaysDraft}
                  onChange={(e) => setTrialDaysDraft(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label htmlFor="cfg-adv-fee" className="block text-xs font-medium text-[#4B5563]">
                  Advertiser Fee (ZMW/mo)
                </label>
                <input
                  id="cfg-adv-fee"
                  type="number"
                  disabled={!isSuperAdmin}
                  value={advFeeDraft}
                  onChange={(e) => setAdvFeeDraft(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label htmlFor="cfg-buy-fee" className="block text-xs font-medium text-[#4B5563]">
                  Buyer Micro-Fee (ZMW/mo)
                </label>
                <input
                  id="cfg-buy-fee"
                  type="number"
                  step="0.5"
                  disabled={!isSuperAdmin}
                  value={buyerFeeDraft}
                  onChange={(e) => setBuyerFeeDraft(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label htmlFor="cfg-dormancy" className="block text-xs font-medium text-[#4B5563]">
                  Dormancy Threshold (Days)
                </label>
                <input
                  id="cfg-dormancy"
                  type="number"
                  disabled={!isSuperAdmin}
                  value={dormancyDraft}
                  onChange={(e) => setDormancyDraft(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 font-mono text-sm"
                />
              </div>
              {isSuperAdmin && (
                <div className="col-span-2 pt-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-[#1B5E20] px-4 py-2 text-xs font-semibold text-white hover:bg-[#154A19]"
                  >
                    Save Configuration Parameters
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Billing Follow-up Table */}
          <div className="rounded-xl border border-[#E5E7EB] bg-white lg:col-span-6">
            <div className="border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
              Trial Expiry, Unpaid Users &amp; Billing Follow-Up
            </div>
            <div className="max-h-[520px] divide-y divide-[#E5E7EB] overflow-y-auto">
              {users
                .filter(
                  (u) =>
                    u.role === 'advertiser' || (config.buyerFeeEnabled && u.role === 'buyer')
                )
                .map((member) => {
                  const evalRes =
                    member.role === 'advertiser' ? computeTrialStatus(member, config) : null;
                  const pendingEval = evaluateUserPendingPayment(member, config, payments);
                  return (
                    <div
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2 font-bold text-[#111827]">
                          <span>{member.businessName || member.name}</span>
                          {member.systemId && (
                            <span className="font-mono text-[11px] font-normal text-[#4B5563]">
                              {member.systemId}
                            </span>
                          )}
                          <span className="rounded border border-[#E5E7EB] bg-[#F9FAF8] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#4B5563]">
                            {member.role}
                          </span>
                          {pendingEval && (
                            <span className="rounded border border-[#F59E0B]/50 bg-[#FFFBEB] px-1.5 py-0.5 text-[10px] font-semibold text-[#92400E]">
                              {pendingEval.hasPendingManualPop
                                ? 'PoP Pending'
                                : `Unpaid · ${formatZMW(pendingEval.amountZmw)}`}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[#4B5563]">
                          {member.phone} · Status:{' '}
                          <strong>
                            {evalRes ? evalRes.effectiveAccountStatus : member.accountStatus}
                          </strong>
                          {evalRes ? ` (${evalRes.daysRemaining}d left)` : ''}
                        </div>
                      </div>
                      {hasPerm('billing_followup') && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              clearAlerts();
                              const err = await onSendBillingReminder(member.id, 'In-App');
                              if (err) setErrorMsg(err);
                              else
                                setFeedback(
                                  `Automatic In-App Chat payment message sent to ${member.name}.`
                                );
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#1B5E20] px-2.5 py-1.5 font-semibold text-white hover:bg-[#154A19]"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            In-App Chat Notice
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              clearAlerts();
                              const err = await onSendBillingReminder(member.id, 'WhatsApp');
                              if (err) setErrorMsg(err);
                              else
                                setFeedback(
                                  `WhatsApp billing reminder queued for ${member.name}.`
                                );
                            }}
                            className="rounded-lg border border-[#1B5E20] px-2.5 py-1.5 font-semibold text-[#1B5E20] hover:bg-[#EEF3EC]"
                          >
                            WhatsApp Notice
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Payments Queue */}
      {tab === 'payments' && hasPerm('verify_payments') && (
        <div className="mt-6 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
          <div className="border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
            Mobile Money Proof-of-Payment &amp; Flutterwave Ledger
          </div>
          <div className="divide-y divide-[#E5E7EB]">
            {payments.map((pay) => (
              <div key={pay.id} className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                <div className="text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#111827]">{pay.userName}</span>
                    <span className="font-mono text-[#1B5E20]">{formatZMW(pay.amountZmw)}</span>
                    <span className="font-mono text-[#4B5563]">{pay.network}</span>
                    <span className="font-semibold uppercase text-[#C2410C]">{pay.status}</span>
                  </div>
                  <div className="mt-1 font-mono text-[#4B5563]">
                    Ref: {pay.referenceCode} · TxID: {pay.transactionId} · Method: {pay.method}
                  </div>
                </div>
                {pay.status === 'pending' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        clearAlerts();
                        const err = await onPaymentDecision(pay.id, 'approved');
                        if (err) setErrorMsg(err);
                        else setFeedback(`Approved payment ${pay.referenceCode}.`);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#1B5E20] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        clearAlerts();
                        const err = await onPaymentDecision(pay.id, 'rejected');
                        if (err) setErrorMsg(err);
                        else setFeedback(`Rejected payment ${pay.referenceCode}.`);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#C2410C] px-3 py-1.5 text-xs font-semibold text-[#C2410C]"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: KYC Queue */}
      {tab === 'kyc' && hasPerm('verify_kyc') && (
        <div className="mt-6 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
          <div className="border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
            Tier 1–3 Seller KYC Verification Queue
          </div>
          <div className="divide-y divide-[#E5E7EB]">
            {kycSubmissions.map((kyc) => (
              <div key={kyc.id} className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                <div className="text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#111827]">{kyc.userName}</span>
                    <span className="font-semibold text-[#1B5E20]">
                      Requests {VERIFICATION_LABELS[kyc.requestedTier]}
                    </span>
                    <span className="uppercase text-[#4B5563]">Status: {kyc.status}</span>
                  </div>
                  <div className="mt-1 font-mono text-[#4B5563]">
                    NRC: {kyc.nrcNumber || 'N/A'} · PACRA: {kyc.pacraNumber || 'N/A'} · ZRA TPIN:{' '}
                    {kyc.zraTpin || 'N/A'} {kyc.siteGpsPin ? `· GPS: ${kyc.siteGpsPin}` : ''}
                  </div>
                </div>
                {kyc.status === 'pending' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        clearAlerts();
                        const err = await onKycDecision(kyc.id, 'approved');
                        if (err) setErrorMsg(err);
                        else setFeedback(`Approved ${kyc.userName} for ${VERIFICATION_LABELS[kyc.requestedTier]}.`);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#1B5E20] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Approve KYC
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        clearAlerts();
                        const err = await onKycDecision(kyc.id, 'rejected');
                        if (err) setErrorMsg(err);
                        else setFeedback(`Rejected KYC submission for ${kyc.userName}.`);
                      }}
                      className="rounded-lg border border-[#C2410C] px-3 py-1.5 text-xs font-semibold text-[#C2410C]"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: Trust & Blacklist */}
      {tab === 'trust' && hasPerm('moderate_trust') && (
        <div className="mt-6 space-y-6">
          {/* Reported Listings & Reported Advertiser Ratings */}
          <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5">
              <div>
                <div className="text-sm font-bold text-[#111827]">
                  Reported Listings &amp; Reported Advertiser Ratings ({reportedListings.length})
                </div>
                <p className="text-xs text-[#4B5563]">
                  Inspect every reported produce listing alongside the reported advertiser&apos;s verified star rating, review breakdown, and moderation status.
                </p>
              </div>
              <span className="font-mono text-xs text-[#4B5563] tabular-nums">
                {openScamReports.length} open report(s)
              </span>
            </div>

            {reportedListings.length === 0 ? (
              <div className="p-6 text-xs text-[#4B5563]">
                No listings have been reported yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-xs">
                  <thead className="border-b border-[#E5E7EB] bg-[#F9FAF8] text-[11px] font-semibold uppercase tracking-wide text-[#4B5563]">
                    <tr>
                      <th className="px-4 py-3">Reported Listing</th>
                      <th className="px-4 py-3">Reported Advertiser</th>
                      <th className="px-4 py-3">Advertiser Rating</th>
                      <th className="px-4 py-3">Reports &amp; Reasons</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {reportedListings.map((row) => {
                      const advStatusStyle = STATUS_BADGE_MAP[row.sellerAccountStatus];
                      return (
                        <tr key={row.listingId} className="align-top hover:bg-[#F9FAF8]/60">
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-[#111827]">{row.listingTitle}</div>
                            <div className="mt-0.5 text-[11px] text-[#4B5563]">
                              {row.listingCategory} ·{' '}
                              <span className="font-mono font-semibold text-[#1B5E20] tabular-nums">
                                {formatZMW(row.listingPriceZmw)}
                              </span>{' '}
                              · {row.listingDistrict}, {row.listingProvince}
                            </div>
                            <div className="mt-1.5 inline-flex items-center rounded border border-[#E5E7EB] bg-[#F9FAF8] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-[#111827]">
                              Listing: {row.listingStatus}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-[#111827]">
                              {row.sellerBusinessName || row.sellerName}
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] text-[#4B5563]">
                              {row.sellerSystemId || row.sellerId} ·{' '}
                              {VERIFICATION_LABELS[row.sellerVerificationTier]}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold ${advStatusStyle.classes}`}
                              >
                                {advStatusStyle.label}
                              </span>
                              <span className="font-mono text-[11px] text-[#4B5563] tabular-nums">
                                {row.sellerTotalReportsCount} total report(s)
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <Star className="h-4 w-4 fill-[#F59E0B] text-[#F59E0B]" />
                              <span className="font-mono text-sm font-bold text-[#111827] tabular-nums">
                                {row.sellerRating.reviewCount > 0
                                  ? `${row.sellerRating.averageRating.toFixed(1)} / 5.0`
                                  : 'No rating'}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-[#4B5563] tabular-nums">
                              {row.sellerRating.reviewCount}{' '}
                              {row.sellerRating.reviewCount === 1 ? 'review' : 'reviews'}
                            </div>
                            {row.sellerRating.reviewCount > 0 && (
                              <div className="mt-1 font-mono text-[11px] text-[#4B5563] tabular-nums">
                                Quality {row.sellerRating.productQualityAvg.toFixed(1)} · Comm{' '}
                                {row.sellerRating.communicationAvg.toFixed(1)} · Price{' '}
                                {row.sellerRating.pricingHonestyAvg.toFixed(1)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-mono font-semibold text-[#C2410C] tabular-nums">
                              {row.openReportsCount} open / {row.totalReportsCount} total
                            </div>
                            <div className="mt-1 text-[11px] text-[#374151]">
                              {row.reasons.join(', ')}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              {row.listing && onInspectListing && (
                                <button
                                  type="button"
                                  onClick={() => onInspectListing(row.listing!)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[#1B5E20] px-2.5 py-1.5 text-[11px] font-semibold text-[#1B5E20] hover:bg-[#EEF3EC]"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  View Reported Listing
                                </button>
                              )}
                              {row.listing && row.listing.status !== 'under_investigation' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    clearAlerts();
                                    const err = await onUpdateListingStatus(
                                      row.listingId,
                                      'under_investigation'
                                    );
                                    if (err) setErrorMsg(err);
                                    else
                                      setFeedback(
                                        `Listing "${row.listingTitle}" placed under investigation.`
                                      );
                                  }}
                                  className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-2.5 py-1.5 text-[11px] font-semibold text-[#92400E]"
                                >
                                  Freeze Listing
                                </button>
                              )}
                              {row.listing && row.listing.status !== 'active' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    clearAlerts();
                                    const err = await onUpdateListingStatus(row.listingId, 'active');
                                    if (err) setErrorMsg(err);
                                    else
                                      setFeedback(
                                        `Listing "${row.listingTitle}" restored to active.`
                                      );
                                  }}
                                  className="rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 text-[11px] font-semibold text-[#111827] hover:bg-[#F9FAF8]"
                                >
                                  Restore Active
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white lg:col-span-8">
              <div className="border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
                Community Scam Reports &amp; Auto-Freeze Moderation
              </div>
              <div className="divide-y divide-[#E5E7EB]">
                {scamReports.map((sr) => {
                  const targetListing = listings.find((l) => l.id === sr.listingId);
                  const reportedSeller = usersById[targetListing?.sellerId || sr.sellerId];
                  const sellerRating = computeSellerAggregateRating(
                    reviews,
                    targetListing?.sellerId || sr.sellerId
                  );
                  return (
                    <div key={sr.id} className="space-y-2 p-5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-[#111827]">
                            {targetListing?.title || sr.listingId}
                          </span>
                          <span className="ml-2 text-[11px] text-[#4B5563]">
                            Advertiser:{' '}
                            <strong className="text-[#111827]">
                              {reportedSeller?.businessName || reportedSeller?.name || sr.sellerId}
                            </strong>
                            {reportedSeller?.systemId ? ` (${reportedSeller.systemId})` : ''} ·
                            Rating:{' '}
                            <span className="font-mono font-semibold text-[#111827] tabular-nums">
                              {sellerRating.reviewCount > 0
                                ? `${sellerRating.averageRating.toFixed(1)}★ (${sellerRating.reviewCount})`
                                : 'No reviews (0)'}
                            </span>
                          </span>
                        </div>
                        <span className="font-mono font-semibold uppercase text-[#C2410C]">
                          Report: {sr.status} · Listing: {targetListing?.status || 'removed'}
                        </span>
                      </div>
                      <div className="text-[#4B5563]">
                        <strong>{sr.reason}:</strong> {sr.details} (Reported by {sr.reporterName})
                      </div>
                      {sr.evidenceDataUrl && (
                        <div>
                          <a
                            href={sr.evidenceDataUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#1B5E20] underline"
                          >
                            View Attached Report Evidence
                          </a>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {targetListing && onInspectListing && (
                          <button
                            type="button"
                            onClick={() => onInspectListing(targetListing)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#1B5E20] px-3 py-1.5 font-semibold text-[#1B5E20] hover:bg-[#EEF3EC]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View Listing
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            clearAlerts();
                            const err = await onScamDecision(sr.id, 'dismiss');
                            if (err) setErrorMsg(err);
                            else setFeedback('Report dismissed and listing cleared if below threshold.');
                          }}
                          className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 font-semibold text-[#111827]"
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            clearAlerts();
                            const err = await onScamDecision(sr.id, 'freeze_listing');
                            if (err) setErrorMsg(err);
                            else setFeedback('Listing frozen under investigation.');
                          }}
                          className="rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-3 py-1.5 font-semibold text-[#92400E]"
                        >
                          Freeze Listing
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            clearAlerts();
                            const err = await onScamDecision(sr.id, 'ban_blacklist');
                            if (err) setErrorMsg(err);
                            else
                              setFeedback(
                                'Seller banned and NRC/Phone/MoMo identifiers permanently hashed into Blacklist.'
                              );
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#C2410C] px-3 py-1.5 font-semibold text-white"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          Ban &amp; Hash Blacklist
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-white lg:col-span-4">
              <div className="border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
                Permanent Hashed Blacklist ({blacklist.length})
              </div>
              <div className="divide-y divide-[#E5E7EB] p-4 text-xs">
                {blacklist.length === 0 ? (
                  <p className="text-[#4B5563]">
                    No permanently blacklisted NRC, phone, or Mobile Money wallets yet.
                  </p>
                ) : (
                  blacklist.map((b) => (
                    <div key={b.id} className="py-2.5 font-mono">
                      <div className="font-sans font-bold text-[#C2410C]">{b.reason}</div>
                      <div className="mt-1 text-[11px] text-[#4B5563]">
                        Phone SHA: {b.phoneHash}
                      </div>
                      {b.nrcHash && (
                        <div className="text-[11px] text-[#4B5563]">NRC SHA: {b.nrcHash}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Lifecycle & Staff RBAC */}
      {tab === 'lifecycle' && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 rounded-xl border border-[#E5E7EB] bg-white p-6 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-[#111827]">
                  Account Dormancy &amp; Lifecycle Control
                </h2>
                <p className="text-xs text-[#4B5563]">
                  Detects accounts inactive &ge; {config.dormancyThresholdDays} days (e.g. Chipata Cooperative Growers).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    clearAlerts();
                    const res = await onDormancyScan(false);
                    if (res.error) setErrorMsg(res.error);
                    else setFeedback(`Dormancy Scan: ${res.flaggedCount} inactive account(s) flagged.`);
                  }}
                  className="rounded-lg border border-[#1B5E20] px-3 py-1.5 text-xs font-semibold text-[#1B5E20]"
                >
                  Scan Inactive
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    clearAlerts();
                    const res = await onDormancyScan(true);
                    if (res.error) setErrorMsg(res.error);
                    else setFeedback(`Deactivated ${res.flaggedCount} dormant account(s) and archived their listings.`);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Deactivate Dormant
                </button>
              </div>
            </div>

            {isSuperAdmin && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-4">
                <div>
                  <div className="text-xs font-bold text-[#111827]">
                    Live Launch Data Control ({hasSeededData ? 'Sample Preview Data Active' : 'Clean Live Data Only'})
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#4B5563]">
                    {hasSeededData
                      ? 'Sample farmers, buyers, and produce ads are currently loaded for preview. Remove them anytime to launch with real registered accounts only.'
                      : 'All sample preview accounts and listings have been removed. Only real accounts appear.'}
                  </p>
                </div>
                {hasSeededData && (
                  <button
                    type="button"
                    onClick={async () => {
                      clearAlerts();
                      const res = await onClearDemoData();
                      if (res.error) setErrorMsg(res.error);
                      else
                        setFeedback(
                          `Sample preview data removed for clean live launch (${res.remainingUsers ?? 1} real account(s), ${res.remainingListings ?? 0} listing(s) kept).`
                        );
                    }}
                    className="rounded-lg bg-[#111827] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1F2937]"
                  >
                    Clear Sample Data (Go Live Clean)
                  </button>
                )}
              </div>
            )}

            <div className="divide-y divide-[#E5E7EB] border-t border-[#E5E7EB]">
              {users
                .filter((u) => u.role === 'advertiser' || u.role === 'buyer')
                .map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                    <div>
                      <div className="font-bold text-[#111827]">
                        {u.businessName || u.name}{' '}
                        <span className="font-normal text-[#4B5563]">({u.role})</span>
                      </div>
                      <div className="text-[#4B5563]">
                        Status: <strong>{u.accountStatus}</strong> · Last active:{' '}
                        {new Date(u.lastActiveAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onUpdateUserStatus(u.id, 'trial_active')}
                        className="rounded border border-[#E5E7EB] px-2.5 py-1 font-semibold text-[#1B5E20]"
                      >
                        Reactivate
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateUserStatus(u.id, 'suspended')}
                        className="rounded border border-[#E5E7EB] px-2.5 py-1 font-semibold text-[#C2410C]"
                      >
                        Suspend
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Delegated Staff RBAC & Sample Roles */}
          <div className="space-y-5 rounded-xl border border-[#E5E7EB] bg-white p-6 lg:col-span-5">
            <h2 className="font-display text-lg font-bold text-[#111827]">
              Delegated Staff Roles &amp; Automatic Access
            </h2>

            {dispatchedEmail && (
              <div className="rounded-lg border border-[#1B5E20] bg-[#EEF3EC] p-4 text-xs text-[#111827]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-[#1B5E20]">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span>Credential Email Notification Dispatched</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const creds = `AgriLink ZM Staff Login\nRole: ${dispatchedEmail.roleTitle}\nUsername: ${dispatchedEmail.username}\nEmail: ${dispatchedEmail.toEmail}\nTemporary Password: ${dispatchedEmail.tempPassword}`;
                      void navigator.clipboard?.writeText(creds);
                      setCopiedCreds(true);
                    }}
                    className="inline-flex items-center gap-1 rounded border border-[#1B5E20] bg-white px-2 py-1 text-[11px] font-semibold text-[#1B5E20]"
                  >
                    {copiedCreds ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedCreds ? 'Copied' : 'Copy Credentials'}
                  </button>
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-[#374151]">
                  <div>
                    <strong>From:</strong> {dispatchedEmail.fromEmail} &rarr; <strong>To:</strong>{' '}
                    {dispatchedEmail.toEmail}
                  </div>
                  <div>
                    <strong>Role:</strong> {dispatchedEmail.roleTitle}
                  </div>
                  <div>
                    <strong>Automatically Granted Access:</strong>{' '}
                    <span className="font-mono">{dispatchedEmail.grantedPermissions.join(', ')}</span>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-md border border-[#1B5E20]/25 bg-white p-2.5 font-mono text-[11px]">
                  <div>
                    <div className="text-[#4B5563]">Username</div>
                    <div className="font-bold text-[#111827]">{dispatchedEmail.username}</div>
                  </div>
                  <div>
                    <div className="text-[#4B5563]">Temporary Password</div>
                    <div className="font-bold text-[#1B5E20]">{dispatchedEmail.tempPassword}</div>
                  </div>
                </div>
                <pre className="mt-2.5 max-h-36 overflow-y-auto whitespace-pre-wrap rounded border border-[#E5E7EB] bg-white p-2 font-sans text-[11px] text-[#374151]">
                  {dispatchedEmail.body}
                </pre>
              </div>
            )}

            <div className="space-y-3">
              {staffMembers.map((st) => (
                <div key={st.id} className="rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-3.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-[#111827]">{st.name}</div>
                    {st.username && (
                      <span className="font-mono text-[11px] font-semibold text-[#1B5E20]">
                        @{st.username}
                      </span>
                    )}
                  </div>
                  {st.delegatedRoleTitle && (
                    <div className="mt-0.5 text-[11px] font-semibold text-[#374151]">
                      {st.delegatedRoleTitle}
                    </div>
                  )}
                  <div className="text-[#4B5563]">
                    {st.email} · {st.phone}
                  </div>
                  <div className="mt-2.5 grid grid-cols-1 gap-1.5">
                    {ALL_PERMISSIONS.map((perm) => {
                      const checked = st.staffPermissions.includes(perm.id);
                      return (
                        <label key={perm.id} className="flex items-center gap-2 text-[#111827]">
                          <input
                            type="checkbox"
                            disabled={!isSuperAdmin}
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...st.staffPermissions, perm.id]
                                : st.staffPermissions.filter((p) => p !== perm.id);
                              void onUpdateStaffPermissions(st.id, next);
                            }}
                            className="h-3.5 w-3.5 accent-[#1B5E20]"
                          />
                          <span>{perm.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {isSuperAdmin && (
              <form onSubmit={handleStaffCreate} className="space-y-3 border-t border-[#E5E7EB] pt-4">
                <div className="text-xs font-bold text-[#111827]">
                  Delegate Role &amp; Auto-Grant Access
                </div>

                <div>
                  <label htmlFor="staff-role-template" className="block text-[11px] font-semibold text-[#4B5563]">
                    Sample Role Template (Auto-selects access)
                  </label>
                  <select
                    id="staff-role-template"
                    value={staffRoleTemplateId}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs font-semibold text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                  >
                    {DELEGATED_ROLE_TEMPLATES.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.title}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-[#4B5563]">
                    {selectedTemplate.description}
                  </p>
                </div>

                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="Full Name (e.g. Natasha Banda)"
                  className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs"
                />

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={staffUsername}
                    onChange={(e) => setStaffUsername(e.target.value)}
                    placeholder={`Username (auto: ${autoUsernamePreview})`}
                    className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs"
                  />
                  <input
                    type="tel"
                    value={staffPhone}
                    onChange={(e) => setStaffPhone(e.target.value)}
                    placeholder="+26097..."
                    className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs"
                  />
                </div>

                <input
                  type="email"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  placeholder="staff.email@agrilink.zm"
                  className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs"
                />

                <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-3">
                  <div className="text-[11px] font-semibold text-[#1B5E20]">
                    Automatically Granted Specific Access:
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
                    {ALL_PERMISSIONS.map((perm) => (
                      <label key={perm.id} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={staffPerms.includes(perm.id)}
                          onChange={(e) => {
                            setStaffRoleTemplateId('custom');
                            setStaffPerms((prev) =>
                              e.target.checked ? [...prev, perm.id] : prev.filter((p) => p !== perm.id)
                            );
                          }}
                          className="accent-[#1B5E20]"
                        />
                        <span>{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#1B5E20] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#154A19]"
                >
                  Create Staff, Grant Access &amp; Send Credential Email
                </button>
              </form>
            )}

            {/* Dispatched Email Notifications Audit Log */}
            <div className="border-t border-[#E5E7EB] pt-4">
              <div className="text-xs font-bold text-[#111827]">
                Sent Credential &amp; Verification Emails ({emailNotifications.length})
              </div>
              <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">
                {emailNotifications.length === 0 ? (
                  <p className="text-[11px] text-[#4B5563]">
                    No verification or role delegation emails dispatched in this session yet.
                  </p>
                ) : (
                  emailNotifications.slice(0, 12).map((mail) => (
                    <div key={mail.id} className="rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-2.5 text-[11px]">
                      <div className="flex items-center justify-between gap-2 font-semibold text-[#111827]">
                        <span className="truncate">{mail.subject}</span>
                        <span className="shrink-0 font-mono text-[10px] text-[#6B7280]">
                          {new Date(mail.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[#4B5563]">
                        To: <strong>{mail.toEmail}</strong> ({mail.toName})
                      </div>
                      <div className="mt-1 text-[#374151]">{mail.body}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Edit User & Assign System ID Modal */}
      {editingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] pb-4">
              <div>
                <h2 id="edit-user-modal-title" className="font-display text-lg font-bold text-[#111827]">
                  Edit User &amp; Assign System ID
                </h2>
                <p className="text-xs text-[#4B5563]">
                  Update account details, governance status, verification tier, or assign a unique System ID number.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close edit user modal"
                onClick={() => setEditingUser(null)}
                className="rounded-lg border border-[#E5E7EB] p-1.5 text-[#4B5563] hover:bg-[#F9FAF8]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedUser} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-system-id" className="block text-xs font-semibold text-[#374151]">
                    System ID Number
                  </label>
                  <input
                    id="edit-system-id"
                    type="text"
                    disabled={!isSuperAdmin}
                    value={editSystemId}
                    onChange={(e) => setEditSystemId(e.target.value)}
                    placeholder="e.g. AZM-ADV-0001"
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 font-mono text-xs font-bold text-[#1B5E20] disabled:opacity-60 focus:border-[#1B5E20] focus:bg-white focus:outline-none"
                  />
                  {!isSuperAdmin && (
                    <p className="mt-1 text-[11px] text-[#6B7280]">
                      Only the Super Admin can reassign System ID numbers.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="edit-user-role" className="block text-xs font-semibold text-[#374151]">
                    System Role
                  </label>
                  <select
                    id="edit-user-role"
                    disabled={!isSuperAdmin || editingUser.id === 'usr-admin-1'}
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs font-medium text-[#111827] disabled:opacity-60"
                  >
                    <option value="advertiser">Advertiser / Seller</option>
                    <option value="buyer">Buyer</option>
                    <option value="staff">Delegated Staff</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-user-name" className="block text-xs font-semibold text-[#374151]">
                    Full Name
                  </label>
                  <input
                    id="edit-user-name"
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>

                <div>
                  <label htmlFor="edit-user-business" className="block text-xs font-semibold text-[#374151]">
                    Farm / Business Name
                  </label>
                  <input
                    id="edit-user-business"
                    type="text"
                    value={editBusinessName}
                    onChange={(e) => setEditBusinessName(e.target.value)}
                    placeholder="Optional farm or trading entity"
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>

                <div>
                  <label htmlFor="edit-user-email" className="block text-xs font-semibold text-[#374151]">
                    Email Address
                  </label>
                  <input
                    id="edit-user-email"
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>

                <div>
                  <label htmlFor="edit-user-phone" className="block text-xs font-semibold text-[#374151]">
                    Phone Number
                  </label>
                  <input
                    id="edit-user-phone"
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs text-[#111827]"
                  />
                </div>

                <div>
                  <label htmlFor="edit-user-province" className="block text-xs font-semibold text-[#374151]">
                    Province
                  </label>
                  <select
                    id="edit-user-province"
                    value={editProvince}
                    onChange={(e) => {
                      const nextProv = e.target.value;
                      setEditProvince(nextProv);
                      setEditDistrict(ZAMBIA_PROVINCES[nextProv]?.[0] || '');
                    }}
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs text-[#111827]"
                  >
                    {PROVINCE_NAMES.map((prov) => (
                      <option key={prov} value={prov}>
                        {prov}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-user-district" className="block text-xs font-semibold text-[#374151]">
                    District
                  </label>
                  <select
                    id="edit-user-district"
                    value={editDistrict}
                    onChange={(e) => setEditDistrict(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs text-[#111827]"
                  >
                    {(ZAMBIA_PROVINCES[editProvince] || [editDistrict]).map((dist) => (
                      <option key={dist} value={dist}>
                        {dist}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-user-tier" className="block text-xs font-semibold text-[#374151]">
                    KYC Verification Tier
                  </label>
                  <select
                    id="edit-user-tier"
                    value={editTier}
                    onChange={(e) => setEditTier(e.target.value as VerificationTier)}
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs text-[#111827]"
                  >
                    <option value="unverified">{VERIFICATION_LABELS.unverified}</option>
                    <option value="tier1_id">{VERIFICATION_LABELS.tier1_id}</option>
                    <option value="tier2_business">{VERIFICATION_LABELS.tier2_business}</option>
                    <option value="tier3_site">{VERIFICATION_LABELS.tier3_site}</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-user-status" className="block text-xs font-semibold text-[#374151]">
                    Account Governance Status
                  </label>
                  <select
                    id="edit-user-status"
                    disabled={editingUser.id === 'usr-admin-1' || editingUser.id === currentUser.id}
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as AccountStatus)}
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs text-[#111827] disabled:opacity-60"
                  >
                    <option value="trial_active">Trial Active</option>
                    <option value="active_paid">Active Paid</option>
                    <option value="payment_required">Payment Required</option>
                    <option value="under_investigation">Under Investigation</option>
                    <option value="frozen">Frozen</option>
                    <option value="suspended">Suspended</option>
                    <option value="dormant">Dormant</option>
                    <option value="banned">Banned</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="edit-user-note" className="block text-xs font-semibold text-[#374151]">
                  Admin Governance Note
                </label>
                <textarea
                  id="edit-user-note"
                  rows={2}
                  value={editAdminNote}
                  onChange={(e) => setEditAdminNote(e.target.value)}
                  placeholder="Optional audit note (e.g. investigation reason, verified depot check)"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs text-[#111827]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[#E5E7EB] pt-4">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-lg border border-[#E5E7EB] px-4 py-2 text-xs font-semibold text-[#4B5563]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUserEdit}
                  className="rounded-lg bg-[#1B5E20] px-5 py-2 text-xs font-semibold text-white hover:bg-[#154A19] disabled:opacity-60"
                >
                  {savingUserEdit ? 'Saving...' : 'Save Changes & System ID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
