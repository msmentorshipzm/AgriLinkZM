import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREVO_SEND_ENDPOINT,
  buildBrevoEmailPayload,
  DEFAULT_SENDER_EMAIL,
  DEFAULT_SENDER_NAME,
  hasConfiguredBrevoKey,
  resolveBrevoSender,
} from './emailProvider';

test('hasConfiguredBrevoKey rejects empty or placeholder keys and accepts real keys', () => {
  assert.equal(hasConfiguredBrevoKey(undefined), false);
  assert.equal(hasConfiguredBrevoKey('   '), false);
  assert.equal(hasConfiguredBrevoKey('MY_BREVO_API_KEY'), false);
  assert.equal(hasConfiguredBrevoKey('xkeysib-live-123456'), true);
});

test('resolveBrevoSender falls back to AgriLink ZM defaults and honors overrides', () => {
  assert.deepEqual(resolveBrevoSender({}), {
    email: DEFAULT_SENDER_EMAIL,
    name: DEFAULT_SENDER_NAME,
  });

  assert.deepEqual(
    resolveBrevoSender({
      BREVO_SENDER_EMAIL: 'noreply@agrilink.zm',
      BREVO_SENDER_NAME: 'AgriLink Zambia',
    }),
    {
      email: 'noreply@agrilink.zm',
      name: 'AgriLink Zambia',
    }
  );
});

test('buildBrevoEmailPayload constructs valid Brevo v3 SMTP email request payload', () => {
  assert.equal(BREVO_SEND_ENDPOINT, 'https://api.brevo.com/v3/smtp/email');

  const payload = buildBrevoEmailPayload({
    toEmail: '  farmer@lusaka.zm ',
    toName: ' Kelvin Mwansa ',
    subject: ' Verify your AgriLink ZM account ',
    text: 'Verification Code: 123456',
  });

  assert.deepEqual(payload, {
    sender: {
      name: DEFAULT_SENDER_NAME,
      email: DEFAULT_SENDER_EMAIL,
    },
    to: [{ email: 'farmer@lusaka.zm', name: 'Kelvin Mwansa' }],
    replyTo: {
      name: DEFAULT_SENDER_NAME,
      email: DEFAULT_SENDER_EMAIL,
    },
    subject: 'Verify your AgriLink ZM account',
    textContent: 'Verification Code: 123456',
  });
});
