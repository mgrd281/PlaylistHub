import { randomBytes } from 'crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, no 0/O/1/I

/** Generate a 64-char hex device key (256 bits of entropy) */
export function generateDeviceKey(): string {
  return randomBytes(32).toString('hex');
}

/** Generate an 8-char activation code formatted as XXXX-XXXX */
export function generateActivationCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Max active devices per user */
export const MAX_DEVICES_PER_USER = 5;
