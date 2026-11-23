import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateStaffUsername,
  resolveDelegatedPermissions,
  validatePasswordStrength,
} from './authRules.ts';

test('resolveDelegatedPermissions automatically assigns template permissions for sample roles', () => {
  const paymentOfficer = resolveDelegatedPermissions('payment_officer', []);
  assert.equal(paymentOfficer.roleTitle, 'Payment & MoMo Verification Officer');
  assert.deepEqual(paymentOfficer.permissions, ['verify_payments']);

  const opsLead = resolveDelegatedPermissions('operations_lead', ['verify_payments']);
  assert.deepEqual(opsLead.permissions, [
    'verify_payments',
    'verify_kyc',
    'billing_followup',
    'moderate_trust',
  ]);

  const custom = resolveDelegatedPermissions('custom', ['verify_kyc', 'moderate_trust', 'verify_kyc']);
  assert.deepEqual(custom.permissions, ['verify_kyc', 'moderate_trust']);
});

test('generateStaffUsername generates unique lowercase usernames', () => {
  assert.equal(generateStaffUsername('Mutinta Banda', []), 'mutinta.banda');
  assert.equal(
    generateStaffUsername('Mutinta Banda', ['mutinta.banda', 'mutinta.banda2']),
    'mutinta.banda3'
  );
});

test('validatePasswordStrength enforces minimum length, letter, and digit', () => {
  assert.equal(validatePasswordStrength('short1').valid, false);
  assert.equal(validatePasswordStrength('onlyletters').valid, false);
  assert.equal(validatePasswordStrength('12345678').valid, false);
  assert.equal(validatePasswordStrength('Zambia2026').valid, true);
});
