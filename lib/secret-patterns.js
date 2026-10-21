'use strict';

/**
 * Pola secret bersama untuk guard PreToolUse (blokir tulis) dan MCP server
 * (redaksi isi file sebelum dikirim ke agent).
 *
 * Prinsip:
 *   - Pola BERKEYAKINAN TINGGI dipakai untuk memblokir (hampir pasti secret asli).
 *   - Pola KONTEKSTUAL (nilai setelah kata kunci sensitif) hanya untuk redaksi,
 *     karena lebih rawan false positive.
 *
 * Ini lapisan pengaman PoC, bukan pengganti secret scanner khusus
 * (mis. gitleaks/trufflehog) di pipeline CI.
 */

const HIGH_CONFIDENCE = [
  {
    name: 'private-key',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/g,
  },
  { name: 'aws-access-key-id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: 'gitlab-token', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

const KEYWORDS = '(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)';

// Nilai ber-kutip setelah kata kunci: password = "hunter2", "token": "abc".
const QUOTED_ASSIGNMENT = new RegExp(`(${KEYWORDS}\\w*["']?\\s*[:=]\\s*)(["'])([^"'\\r\\n]{3,})\\2`, 'gi');
// Nilai tanpa kutip yang tampak literal (tanpa titik/kurung agar ekspresi kode tidak ikut):
// DB_PASSWORD=hunter22 diredaksi, password = req.body.password dibiarkan.
const BARE_ASSIGNMENT = new RegExp(`(${KEYWORDS}\\w*\\s*[:=]\\s*)([A-Za-z0-9_\\-+/=!@#$%^&*~]{6,})(?=\\s|$|[,;])`, 'gim');
// Kredensial di URL: scheme://user:pass@host
const URL_CREDENTIAL = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)(@)/gi;
const BEARER = /(\bBearer\s+)([A-Za-z0-9._~+/-]{8,}=*)/g;

/**
 * Redaksi secret dari teks.
 * @param {string} text
 * @returns {{text: string, count: number, kinds: string[]}}
 */
function redactSecrets(text) {
  let out = String(text);
  let count = 0;
  const kinds = new Set();

  for (const p of HIGH_CONFIDENCE) {
    out = out.replace(p.re, () => {
      count += 1;
      kinds.add(p.name);
      return `[REDACTED:${p.name}]`;
    });
  }
  out = out.replace(QUOTED_ASSIGNMENT, (m, pre, quote, value) => {
    if (value.startsWith('[REDACTED')) return m;
    count += 1;
    kinds.add('assignment');
    return `${pre}${quote}[REDACTED]${quote}`;
  });
  out = out.replace(BARE_ASSIGNMENT, (m, pre) => {
    count += 1;
    kinds.add('assignment');
    return `${pre}[REDACTED]`;
  });
  out = out.replace(URL_CREDENTIAL, (m, pre, value, at) => {
    count += 1;
    kinds.add('url-credential');
    return `${pre}[REDACTED]${at}`;
  });
  out = out.replace(BEARER, (m, pre) => {
    count += 1;
    kinds.add('bearer');
    return `${pre}[REDACTED]`;
  });

  return { text: out, count, kinds: [...kinds] };
}

/**
 * Deteksi secret berkeyakinan tinggi (untuk keputusan blokir).
 * @param {string} text
 * @returns {string[]} nama pola yang cocok
 */
function findHighConfidenceSecrets(text) {
  const s = String(text);
  const found = [];
  for (const p of HIGH_CONFIDENCE) {
    p.re.lastIndex = 0;
    if (p.re.test(s)) found.push(p.name);
    p.re.lastIndex = 0;
  }
  return found;
}

module.exports = { redactSecrets, findHighConfidenceSecrets };
