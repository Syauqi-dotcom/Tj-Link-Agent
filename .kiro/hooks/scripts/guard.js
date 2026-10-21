#!/usr/bin/env node
'use strict';

/**
 * TJLINK PreToolUse guard — mencegah aksi berbahaya SEBELUM tool dijalankan.
 * Dipanggil hook PreToolUse (tool tulis + shell). Payload JSON hook dibaca dari stdin.
 *
 * Keputusan: exit 0 = izinkan; exit 2 = BLOKIR (alasan di stderr diteruskan ke agent).
 * Fail-closed: payload tak terbaca / path tak ditemukan pada tool tulis -> blokir.
 * Setiap keputusan dicatat ke .kiro/audit/agent-actions.jsonl (tanpa isi file).
 *
 * Catatan jujur: pola perintah shell = denylist best-effort (jaring pengaman), bukan
 * batas keamanan. Batas sesungguhnya: tidak ada kredensial production di mesin dev,
 * proteksi branch di server Git, dan CI.
 */

const fs = require('node:fs');
const path = require('node:path');
const { findHighConfidenceSecrets, redactSecrets } = require('../../../lib/secret-patterns');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const AUDIT_LOG = path.join(REPO_ROOT, '.kiro', 'audit', 'agent-actions.jsonl');
const WRITE_TOOLS = new Set(['fs_write', 'fs_append', 'str_replace', 'delete_file']);
const SHELL_TOOLS = new Set(['execute_pwsh', 'execute_bash']);
const toPosix = (p) => p.split(path.sep).join('/');

// Path yang tidak boleh diubah agent: anti-tamper guardrail + data sensitif.
const PROTECTED_PATHS = [
  [/^\.kiro\/(hooks|steering|skills|settings)(\/|$)/i, 'konfigurasi guardrail agent (Hook/Steering/Skill/Settings) hanya boleh diubah manusia'],
  [/^\.kiro\/(evidence|audit)(\/|$)/i, 'evidence gate & audit log tidak boleh dimanipulasi agent'],
  [/^(githooks|mcp|lib)\//i, 'hard gate, server MCP, dan pola keamanan hanya boleh diubah manusia'],
  [/^sandbox\/scripts\/lint\.js$/i, 'aturan lint adalah bagian gate; perubahan aturan butuh review manusia'],
  [/^\.git(\/|$)/i, 'internal git'],
  [/(^|\/)\.env(\.|$)/i, 'file environment/secret'],
  [/\.(pem|key|p12|pfx)$/i, 'kunci privat/sertifikat'],
  [/(^|\/)id_(rsa|ed25519|ecdsa)/i, 'kunci SSH'],
];

// Referensi path terlindungi di dalam perintah shell + kata kerja yang mengubah file.
const PROTECTED_IN_CMD = /(\.kiro[\\/](hooks|steering|skills|settings|evidence|audit)|githooks[\\/]|(^|[\s"'])(mcp|lib)[\\/]|lint\.js)/i;
const WRITE_VERB = /(Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|New-Item|Rename-Item|Clear-Content|\b(rm|del|erase|mv|cp|copy|move|ren|tee|truncate)\b|sed\s+-i|>)/i;

// Perintah shell berisiko (SKILL §4). Urutan: pola paling spesifik di atas.
const DANGEROUS_SHELL = [
  [/\bgit\s+push\b/i, 'push ke remote dilakukan manusia lewat PR, bukan agent'],
  [/\bgit\s+reset\b[^\n]*--hard/i, 'git reset --hard membuang perubahan'],
  [/\bgit\s+clean\b[^\n]*\s-[a-z]*f/i, 'git clean -f menghapus file untracked'],
  [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/i, 'membuang semua perubahan working tree'],
  [/\bgit\s+branch\s+(-D|--delete\s+--force)\b/, 'hapus branch paksa'],
  [/\bgit\s+config\b/i, 'mengubah konfigurasi git'],
  [/--no-verify\b|\bgit\s+commit\b[^\n]*\s-n\b/i, 'melewati git hook (hard gate)'],
  [/\brm\s+-[a-z]*(rf|fr)[a-z]*\b|\brm\s+-r\b/i, 'hapus rekursif'],
  [/\bRemove-Item\b[^\n]*-Recurse/i, 'hapus rekursif'],
  [/\b(rd|rmdir)\s+\/s\b|\bdel\s+\/[sq]\b/i, 'hapus massal'],
  [/\bformat(-volume)?\s+[a-z]:/i, 'format disk'],
  [/\b(npm|pnpm|yarn)\s+publish\b/i, 'publish package'],
  [/\b(npm|pnpm|yarn)\s+(install|i|add)\s+[^-\s]/i, 'menambah dependency butuh persetujuan (SKILL §3)'],
  [/\bdocker\s+(push|login)\b/i, 'push image / login registry'],
  [/\b(kubectl|helm|terraform|pulumi|ansible-playbook)\b/i, 'tooling deployment/infrastruktur'],
  [/\b(ssh|scp|sftp|rsync)\b/i, 'akses server remote'],
  [/\b(mysql|psql|mongo|mongosh|redis-cli|sqlcmd)\b/i, 'akses database langsung'],
  [/\b(aws|gcloud|az)\s+[a-z]/i, 'CLI cloud provider'],
  [/\b(curl|wget|iwr|Invoke-WebRequest|Invoke-RestMethod)\b[^\n]*\|\s*(sh|bash|iex|Invoke-Expression)\b/i, 'unduh lalu eksekusi script'],
  [/\b(Invoke-Expression|iex)\b/i, 'eksekusi string dinamis'],
  [/\bdeploy\b/i, 'perintah deployment'],
];

function audit(entry) {
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
    fs.appendFileSync(AUDIT_LOG, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch {
    // Audit gagal tidak boleh menjatuhkan guard; keputusan tetap berlaku.
  }
}

function decideShell(input) {
  const cmd = String(input.command || '');
  if (!cmd.trim()) return { block: true, why: 'perintah shell kosong/tidak terbaca (fail-closed)' };
  for (const [re, why] of DANGEROUS_SHELL) if (re.test(cmd)) return { block: true, why, target: cmd };
  if (PROTECTED_IN_CMD.test(cmd) && WRITE_VERB.test(cmd)) {
    return { block: true, why: 'perintah shell mengubah file guardrail/evidence/gate', target: cmd };
  }
  return { block: false, target: cmd };
}

function decideWrite(input, cwd) {
  const raw = input.path || input.targetFile || input.file_path || input.filePath;
  if (!raw) {
    return { block: true, why: `path tidak ditemukan di tool_input (keys: ${Object.keys(input).join(',') || '-'}) — fail-closed` };
  }
  const abs = path.resolve(cwd || REPO_ROOT, String(raw));
  const rel = toPosix(path.relative(REPO_ROOT, abs));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { block: true, why: 'menulis di luar workspace', target: abs };
  for (const [re, why] of PROTECTED_PATHS) if (re.test(rel)) return { block: true, why, target: rel };
  const body = [input.text, input.newStr, input.content].filter((x) => typeof x === 'string').join('\n');
  const secrets = findHighConfidenceSecrets(body);
  if (secrets.length) return { block: true, why: `konten mengandung secret (${secrets.join(', ')})`, target: rel };
  return { block: false, target: rel };
}

function main() {
  let payload = null;
  try {
    payload = JSON.parse(fs.readFileSync(0, 'utf8') || 'null');
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== 'object') {
    process.stderr.write('TJLINK guard: payload hook tidak terbaca — diblokir (fail-closed).\n');
    audit({ decision: 'block', reason: 'payload tidak terbaca' });
    return 2;
  }

  const tool = String(payload.tool_name || '');
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  let d = { block: false, target: tool };
  if (SHELL_TOOLS.has(tool)) d = decideShell(input);
  else if (WRITE_TOOLS.has(tool)) d = decideWrite(input, payload.cwd);

  audit({
    session: payload.session_id,
    tool,
    decision: d.block ? 'block' : 'allow',
    reason: d.why,
    target: redactSecrets(String(d.target || '')).text.slice(0, 200),
    inputKeys: Object.keys(input),
  });

  if (!d.block) return 0;
  process.stderr.write(
    `TJLINK guard MEMBLOKIR ${tool}: ${d.why}.\n` +
      'Aturan: SKILL tjlink-dev §4 / steering tjlink-guardrails. ' +
      'Jelaskan risikonya ke manusia dan minta konfirmasi, atau pakai alternatif non-destruktif.\n',
  );
  return 2;
}

process.exitCode = main();
