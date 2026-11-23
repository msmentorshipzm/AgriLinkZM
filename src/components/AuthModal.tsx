import React, { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, MailCheck, ShieldCheck, X } from 'lucide-react';
import { PROVINCE_NAMES, ZAMBIA_PROVINCES } from '../data/zambia.ts';
import type { UserAccount } from '../types/marketplace.ts';

export type AuthModalMode =
  | 'login'
  | 'register_advertiser'
  | 'register_buyer'
  | 'verify_email'
  | 'claim_admin'
  | 'change_password';

interface AuthModalProps {
  isOpen: boolean;
  defaultTab: AuthModalMode;
  defaultTrialDays: number;
  advertiserPaymentRequired: boolean;
  adminNeedsSetup: boolean;
  currentUser: UserAccount | null;
  onClose: () => void;
  onLogin: (payload: { identifier: string; password: string }) => Promise<{
    error?: string;
    requiresVerification?: boolean;
    email?: string;
  }>;
  onRegister: (payload: {
    name: string;
    username?: string;
    businessName?: string;
    email: string;
    phone: string;
    password: string;
    role: 'buyer' | 'advertiser';
    province: string;
    district: string;
    nrcNumber?: string;
    momoAccountName?: string;
  }) => Promise<{
    error?: string;
    email?: string;
    username?: string;
    previewVerificationCode?: string;
    deliveryMode?: string;
    message?: string;
  }>;
  onVerifyEmail: (payload: { identifier: string; code: string }) => Promise<{
    error?: string;
    email?: string;
    username?: string;
    message?: string;
  }>;
  onResendVerification: (identifier: string) => Promise<{
    error?: string;
    previewVerificationCode?: string;
    message?: string;
  }>;
  onClaimAdmin: (password: string) => Promise<string | null>;
  onChangePassword: (payload: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<string | null>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  defaultTab,
  defaultTrialDays,
  advertiserPaymentRequired,
  adminNeedsSetup,
  currentUser,
  onClose,
  onLogin,
  onRegister,
  onVerifyEmail,
  onResendVerification,
  onClaimAdmin,
  onChangePassword,
}) => {
  const [tab, setTab] = useState<AuthModalMode>(defaultTab);
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Registration fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [province, setProvince] = useState('Lusaka');
  const [district, setDistrict] = useState('Lusaka');
  const [nrcNumber, setNrcNumber] = useState('');
  const [momoAccountName, setMomoAccountName] = useState('');

  // Verification fields
  const [verifyIdentifier, setVerifyIdentifier] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [previewVerificationCode, setPreviewVerificationCode] = useState<string | null>(null);
  const [verifiedUsername, setVerifiedUsername] = useState<string | null>(null);

  // Claim Super Admin fields
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');

  // Change Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setTab(defaultTab);
    setError(null);
    setNotice(null);
    setLoginPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
  }, [defaultTab, isOpen]);

  if (!isOpen) return null;

  const districts = ZAMBIA_PROVINCES[province] || [];

  const handleProvinceChange = (nextProv: string) => {
    setProvince(nextProv);
    const nextDistricts = ZAMBIA_PROVINCES[nextProv] || [];
    setDistrict(nextDistricts[0] || '');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!identifier.trim() || !loginPassword) {
      setError('Enter your email, username, or phone AND your password to sign in.');
      return;
    }
    setSubmitting(true);
    const res = await onLogin({
      identifier: identifier.trim(),
      password: loginPassword,
    });
    setSubmitting(false);
    if (res.requiresVerification) {
      setVerifyIdentifier(res.email || identifier.trim());
      setTab('verify_email');
      setError(res.error || 'Please verify your account before logging in.');
      return;
    }
    if (res.error) {
      setError(res.error);
    } else {
      setLoginPassword('');
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const role = tab === 'register_advertiser' ? 'advertiser' : 'buyer';
    if (!name.trim() || !email.trim() || !phone.trim() || !province || !district) {
      setError('Please complete your full name, email, Zambian phone, province, and district.');
      return;
    }
    if (regPassword.length < 8 || !/[a-zA-Z]/.test(regPassword) || !/[0-9]/.test(regPassword)) {
      setError('Password must be at least 8 characters and include at least one letter and one number.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match. Re-enter the same password.');
      return;
    }
    if (role === 'advertiser' && !nrcNumber.trim()) {
      setError('Tier 1 NRC / Passport number is mandatory for Advertiser accounts.');
      return;
    }

    setSubmitting(true);
    const res = await onRegister({
      name: name.trim(),
      username: username.trim() || undefined,
      businessName: businessName.trim() || undefined,
      email: email.trim(),
      phone: phone.trim(),
      password: regPassword,
      role,
      province,
      district,
      nrcNumber: nrcNumber.trim() || undefined,
      momoAccountName: momoAccountName.trim() || undefined,
    });
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }

    setVerifyIdentifier(res.email || email.trim());
    setVerifiedUsername(res.username || null);
    setPreviewVerificationCode(res.previewVerificationCode || null);
    setVerifyCode('');
    setRegPassword('');
    setRegConfirmPassword('');
    setNotice(
      res.message ||
        `Verification code dispatched to ${res.email || email.trim()}. Verify your account before logging in.`
    );
    setTab('verify_email');
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!verifyIdentifier.trim() || !verifyCode.trim()) {
      setError('Enter your registered email/username and 6-digit verification code.');
      return;
    }
    setSubmitting(true);
    const res = await onVerifyEmail({
      identifier: verifyIdentifier.trim(),
      code: verifyCode.trim(),
    });
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }

    setIdentifier(res.email || verifyIdentifier.trim());
    setLoginPassword('');
    setPreviewVerificationCode(null);
    setVerifyCode('');
    setNotice(res.message || 'Account verified! Enter your password below to sign in.');
    setTab('login');
  };

  const handleResendCode = async () => {
    setError(null);
    setNotice(null);
    if (!verifyIdentifier.trim()) {
      setError('Enter your registered email or username first.');
      return;
    }
    setSubmitting(true);
    const res = await onResendVerification(verifyIdentifier.trim());
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.previewVerificationCode) {
      setPreviewVerificationCode(res.previewVerificationCode);
    }
    setNotice(res.message || 'A new 6-digit verification code has been issued.');
  };

  const handleClaimAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (adminPassword.length < 8 || !/[a-zA-Z]/.test(adminPassword) || !/[0-9]/.test(adminPassword)) {
      setError('Password must be at least 8 characters and include at least one letter and one number.');
      return;
    }
    if (adminPassword !== adminConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const err = await onClaimAdmin(adminPassword);
    setSubmitting(false);
    if (err) {
      setError(err);
    } else {
      setAdminPassword('');
      setAdminConfirmPassword('');
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!currentPassword || !newPassword) {
      setError('Enter your current password and new password.');
      return;
    }
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('New password must be at least 8 characters and include at least one letter and one number.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }
    setSubmitting(true);
    const err = await onChangePassword({
      currentPassword,
      newPassword,
    });
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setNotice('Password updated successfully.');
  };

  const showPrimaryTabs =
    tab === 'login' || tab === 'register_advertiser' || tab === 'register_buyer';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-modal-title" className="font-display text-xl font-bold text-[#111827]">
              {tab === 'verify_email'
                ? 'Verify Your Account'
                : tab === 'claim_admin'
                ? 'Super Admin First-Run Setup'
                : tab === 'change_password'
                ? 'Change Account Password'
                : 'AgriLink ZM Account Access'}
            </h2>
            <p className="mt-1 text-xs text-[#4B5563]">
              {tab === 'verify_email'
                ? 'All new accounts require email verification before signing in.'
                : tab === 'claim_admin'
                ? 'Set the initial Super Admin password for agrilinkzm0@gmail.com once.'
                : tab === 'change_password'
                ? `Signed in as ${currentUser?.name || 'Member'} (@${currentUser?.username || currentUser?.email})`
                : 'Password required on every sign-in for Buyers, Advertisers, Staff, and Admin.'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close authentication modal"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#4B5563] hover:bg-[#F3F5F2] hover:text-[#111827]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {showPrimaryTabs && (
          <div className="mt-5 grid grid-cols-3 gap-1.5 rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-1">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError(null);
              }}
              className={`rounded-md px-2.5 py-2 text-xs font-semibold transition-colors ${
                tab === 'login' ? 'bg-[#1B5E20] text-white' : 'text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register_advertiser');
                setError(null);
              }}
              className={`rounded-md px-2.5 py-2 text-xs font-semibold transition-colors ${
                tab === 'register_advertiser'
                  ? 'bg-[#1B5E20] text-white'
                  : 'text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              {advertiserPaymentRequired ? 'Seller Trial' : 'Sell Produce'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register_buyer');
                setError(null);
              }}
              className={`rounded-md px-2.5 py-2 text-xs font-semibold transition-colors ${
                tab === 'register_buyer'
                  ? 'bg-[#1B5E20] text-white'
                  : 'text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              Buyer Sign Up
            </button>
          </div>
        )}

        {notice && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#1B5E20]/30 bg-[#EEF3EC] p-3 text-xs font-medium text-[#1B5E20]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-[#C2410C]/40 bg-[#FFF7ED] p-3 text-xs font-medium text-[#9A3412]">
            {error}
          </div>
        )}

        {/* Mode: Sign In */}
        {tab === 'login' && (
          <div className="mt-5 space-y-5">
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div>
                <label htmlFor="auth-identifier" className="block text-xs font-medium text-[#4B5563]">
                  Email, Username, or Zambian Phone (+260 / 09x)
                </label>
                <input
                  id="auth-identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. name@farm.zm or username"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 text-sm text-[#111827] focus:border-[#1B5E20] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="block text-xs font-medium text-[#4B5563]">
                  Password (Required Every Sign-In)
                </label>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your account password"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 text-sm text-[#111827] focus:border-[#1B5E20] focus:bg-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-[#1B5E20] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#154A19] disabled:opacity-60"
              >
                {submitting ? 'Verifying Credentials...' : 'Sign In with Password'}
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E7EB] pt-4 text-xs">
              <button
                type="button"
                onClick={() => {
                  setVerifyIdentifier(identifier.trim());
                  setError(null);
                  setNotice(null);
                  setTab('verify_email');
                }}
                className="font-semibold text-[#1B5E20] hover:underline"
              >
                Verify a newly registered account
              </button>
              <span className="text-[#6B7280]">Password required on every visit</span>
            </div>

            {adminNeedsSetup && (
              <div className="rounded-lg border border-[#F59E0B]/40 bg-[#FFFBEB] p-3.5 text-xs">
                <div className="font-bold text-[#92400E]">
                  First-Run Super Admin Setup (agrilinkzm0@gmail.com)
                </div>
                <p className="mt-1 text-[#78350F]">
                  No Super Admin password has been claimed yet. Configure the initial Super Admin password once to unlock the Governance Console.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setTab('claim_admin');
                  }}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-[#111827] px-3 py-1.5 font-semibold text-white hover:bg-[#1F2937]"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Set Initial Super Admin Password
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mode: Registration (Buyer / Advertiser) */}
        {(tab === 'register_advertiser' || tab === 'register_buyer') && (
          <form onSubmit={handleRegisterSubmit} className="mt-5 space-y-3.5">
            {tab === 'register_advertiser' && (
              <div className="flex items-start gap-2 rounded-lg border border-[#1B5E20]/25 bg-[#EEF3EC] p-3 text-xs text-[#1B5E20]">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {advertiserPaymentRequired ? (
                    <>
                      Includes an automatic <strong>{defaultTrialDays}-day free trial</strong>. You will verify your account email before logging in.
                    </>
                  ) : (
                    <>
                      List agricultural produce <strong>free at launch</strong>. Account verification and Tier 1 NRC matching protect buyers.
                    </>
                  )}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="reg-name" className="block text-xs font-medium text-[#4B5563]">
                  Full Legal Name *
                </label>
                <input
                  id="reg-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mwila Mulenga"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="reg-phone" className="block text-xs font-medium text-[#4B5563]">
                  Zambian Phone / WhatsApp *
                </label>
                <input
                  id="reg-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0977123456"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="reg-email" className="block text-xs font-medium text-[#4B5563]">
                  Email Address *
                </label>
                <input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mwila@farm.zm"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="reg-username" className="block text-xs font-medium text-[#4B5563]">
                  Username (optional)
                </label>
                <input
                  id="reg-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Auto-generated if blank"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="reg-password" className="block text-xs font-medium text-[#4B5563]">
                  Password (8+ chars, letter + number) *
                </label>
                <input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="reg-password-confirm" className="block text-xs font-medium text-[#4B5563]">
                  Confirm Password *
                </label>
                <input
                  id="reg-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="reg-province" className="block text-xs font-medium text-[#4B5563]">
                  Province *
                </label>
                <select
                  id="reg-province"
                  value={province}
                  onChange={(e) => handleProvinceChange(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                >
                  {PROVINCE_NAMES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="reg-district" className="block text-xs font-medium text-[#4B5563]">
                  District *
                </label>
                <select
                  id="reg-district"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                >
                  {districts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {tab === 'register_advertiser' && (
              <>
                <div>
                  <label htmlFor="reg-biz" className="block text-xs font-medium text-[#4B5563]">
                    Farm / Cooperative / Agribusiness Name
                  </label>
                  <input
                    id="reg-biz"
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Lusaka West Agro Depot"
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-nrc" className="block text-xs font-medium text-[#4B5563]">
                      NRC Number (Mandatory Tier 1) *
                    </label>
                    <input
                      id="reg-nrc"
                      type="text"
                      value={nrcNumber}
                      onChange={(e) => setNrcNumber(e.target.value)}
                      placeholder="123456/10/1"
                      className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-momo" className="block text-xs font-medium text-[#4B5563]">
                      MoMo Registered Name
                    </label>
                    <input
                      id="reg-momo"
                      type="text"
                      value={momoAccountName}
                      onChange={(e) => setMomoAccountName(e.target.value)}
                      placeholder="Matches NRC legal name"
                      className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-[#1B5E20] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#154A19] disabled:opacity-60"
            >
              {submitting
                ? 'Creating Account & Sending Verification...'
                : tab === 'register_advertiser'
                ? advertiserPaymentRequired
                  ? `Create Seller Account (${defaultTrialDays}-Day Trial)`
                  : 'Create Seller Account'
                : 'Create Buyer Account'}
            </button>
          </form>
        )}

        {/* Mode: Verify Email Code */}
        {tab === 'verify_email' && (
          <div className="mt-5 space-y-4">
            {previewVerificationCode && (
              <div className="rounded-lg border border-[#1B5E20]/30 bg-[#EEF3EC] p-3.5 text-xs text-[#111827]">
                <div className="flex items-center justify-between gap-2 font-bold text-[#1B5E20]">
                  <span className="inline-flex items-center gap-1.5">
                    <MailCheck className="h-4 w-4" />
                    Verification Email Dispatch (From: agrilinkzm0@gmail.com)
                  </span>
                </div>
                <p className="mt-1.5 text-[#374151]">
                  To: <strong>{verifyIdentifier}</strong>
                  {verifiedUsername ? ` (Username: @${verifiedUsername})` : ''}
                </p>
                <div className="mt-2 flex items-center justify-between rounded-md border border-[#1B5E20]/20 bg-white px-3 py-2">
                  <div>
                    <div className="text-[11px] text-[#4B5563]">6-Digit Verification Code</div>
                    <div className="font-mono text-base font-bold tracking-widest text-[#1B5E20]">
                      {previewVerificationCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVerifyCode(previewVerificationCode)}
                    className="rounded-md bg-[#1B5E20] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#154A19]"
                  >
                    Use Code
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleVerifySubmit} className="space-y-3">
              <div>
                <label htmlFor="verify-identifier" className="block text-xs font-medium text-[#4B5563]">
                  Registered Email or Username
                </label>
                <input
                  id="verify-identifier"
                  type="text"
                  value={verifyIdentifier}
                  onChange={(e) => setVerifyIdentifier(e.target.value)}
                  placeholder="your@email.zm or username"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="verify-code" className="block text-xs font-medium text-[#4B5563]">
                  6-Digit Account Verification Code
                </label>
                <input
                  id="verify-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 font-mono text-sm tracking-widest text-[#111827] focus:border-[#1B5E20] focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-[#1B5E20] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#154A19] disabled:opacity-60"
                >
                  {submitting ? 'Verifying...' : 'Verify Account'}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleResendCode}
                  className="rounded-lg border border-[#E5E7EB] px-3.5 py-2.5 text-xs font-semibold text-[#111827] hover:bg-[#F9FAF8]"
                >
                  Resend Code
                </button>
              </div>
            </form>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setTab('login');
              }}
              className="text-xs font-semibold text-[#4B5563] hover:text-[#111827]"
            >
              &larr; Back to Sign In
            </button>
          </div>
        )}

        {/* Mode: First-Run Super Admin Claim */}
        {tab === 'claim_admin' && (
          <form onSubmit={handleClaimAdminSubmit} className="mt-5 space-y-3.5">
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-3 text-xs text-[#374151]">
              <div>
                Super Admin Account: <strong>agrilinkzm0@gmail.com</strong> (<span className="font-mono">@superadmin</span>)
              </div>
              <div className="mt-1 text-[#4B5563]">
                This one-time setup locks immediately once your password is saved.
              </div>
            </div>

            <div>
              <label htmlFor="claim-admin-pass" className="block text-xs font-medium text-[#4B5563]">
                New Super Admin Password (8+ chars, letter + number)
              </label>
              <input
                id="claim-admin-pass"
                type="password"
                autoComplete="new-password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Choose strong Super Admin password"
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="claim-admin-confirm" className="block text-xs font-medium text-[#4B5563]">
                Confirm Super Admin Password
              </label>
              <input
                id="claim-admin-confirm"
                type="password"
                autoComplete="new-password"
                value={adminConfirmPassword}
                onChange={(e) => setAdminConfirmPassword(e.target.value)}
                placeholder="Re-enter Super Admin password"
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-[#1B5E20] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#154A19] disabled:opacity-60"
              >
                {submitting ? 'Saving Password...' : 'Save Super Admin Password & Enter Console'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setTab('login');
                }}
                className="rounded-lg border border-[#E5E7EB] px-3.5 py-2.5 text-xs font-semibold text-[#4B5563]"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Mode: Change Password */}
        {tab === 'change_password' && (
          <form onSubmit={handleChangePasswordSubmit} className="mt-5 space-y-3.5">
            <div>
              <label htmlFor="chg-current-pass" className="block text-xs font-medium text-[#4B5563]">
                Current Password
              </label>
              <input
                id="chg-current-pass"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current or temporary password"
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="chg-new-pass" className="block text-xs font-medium text-[#4B5563]">
                New Password (8+ chars, letter + number)
              </label>
              <input
                id="chg-new-pass"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter your new password"
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="chg-confirm-pass" className="block text-xs font-medium text-[#4B5563]">
                Confirm New Password
              </label>
              <input
                id="chg-confirm-pass"
                type="password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-[#1B5E20] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#154A19] disabled:opacity-60"
            >
              {submitting ? 'Updating Password...' : 'Update Password Immediately'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
