'use strict';

/** Konfigurasi Kiro dicek terhadap dokumentasi resmi: hook v1, MCP config, steering, skill (P12-P14). */

const fs = require('node:fs');
const path = require('node:path');
const { SRC_ROOT, check } = require('./harness');

const S = 'konfigurasi Kiro';
const TRIGGERS = ['PreToolUse', 'PostToolUse', 'Stop', 'SessionStart', 'UserPromptSubmit',
  'PreTaskExec', 'PostTaskExec', 'PostFileCreate', 'PostFileSave', 'PostFileDelete'];
const p = (...x) => path.join(SRC_ROOT, ...x);
const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

function configCases() {
  const dir = p('.kiro', 'hooks');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const hooks = files.flatMap((f) => json(path.join(dir, f)).hooks.map((h) => ({ ...h, file: f })));
  const of = (t) => hooks.filter((h) => h.trigger === t);
  check(S, 'hook: schema v1 + trigger valid', files.length > 0 && files.every((f) => json(path.join(dir, f)).version === 'v1')
    && hooks.every((h) => TRIGGERS.includes(h.trigger)), hooks.map((h) => `${h.trigger}=${h.file}`).join(' '));
  check(S, 'hook: tiga lapis aktif (PreToolUse guard, PostToolUse quick, Stop final)',
    of('PreToolUse').length === 1 && of('PostToolUse').length === 1 && of('Stop').length === 1);
  check(S, 'hook: tidak ada aksi "agent" di Stop (cegah loop & boros kredit)', !of('Stop').some((h) => h.action.type === 'agent'));
  const pre = of('PreToolUse')[0];
  const re = pre ? new RegExp(pre.matcher) : null;
  const tools = ['fs_write', 'fs_append', 'str_replace', 'delete_file', 'execute_pwsh', 'execute_bash'];
  check(S, '[P13] matcher guard ter-anchor, mencakup delete_file + shell', Boolean(re) && tools.every((t) => re.test(t)) && !re.test('x_fs_write_y'), pre && pre.matcher);
  check(S, '[P13] timeout tidak diletakkan di dalam action', hooks.every((h) => !('timeout' in h.action)));
  check(S, 'hook: skrip yang dipanggil benar-benar ada', hooks.filter((h) => h.action.type === 'command')
    .every((h) => fs.existsSync(p(h.action.command.split(' ')[1]))));

  const mcp = json(p('mcp', 'mcp.example.json'));
  const servers = Object.entries(mcp.mcpServers || {});
  check(S, '[P12] mcp.example.json: semua entri objek server valid', servers.length > 0
    && servers.every(([, v]) => v && typeof v === 'object' && v.command && Array.isArray(v.args)), servers.map(([k]) => k).join(','));
  check(S, '[P12] tanpa variabel tak terdokumentasi, path server absolut',
    !JSON.stringify(mcp).includes('${') && servers.every(([, v]) => /^([A-Za-z]:)?[\\/]/.test(v.args[0])));

  const steer = fs.readFileSync(p('.kiro', 'steering', 'tjlink-guardrails.md'), 'utf8');
  check(S, 'steering: frontmatter di baris pertama, inclusion: always', /^---\r?\ninclusion: always\r?\n---/.test(steer));
  const skill = fs.readFileSync(p('.kiro', 'skills', 'tjlink-dev', 'SKILL.md'), 'utf8');
  const name = (skill.match(/^name:\s*(.+)$/m) || [])[1];
  const desc = (skill.match(/^description:\s*(.+)$/m) || [])[1] || '';
  check(S, 'skill: name = nama folder, description 1-1024 karakter', name === 'tjlink-dev' && desc.length > 0 && desc.length <= 1024, `name=${name}, desc=${desc.length}`);

  const texts = ['demo/run-demo.js', '.kiro/skills/tjlink-dev/SKILL.md', 'README.md'].map((f) => fs.readFileSync(p(f), 'utf8')).join('\n');
  check(S, '[P14] tanpa karakter Cyrillic & tanpa render "TO``DO"', !/[\u0400-\u04FF]/.test(texts) && !texts.includes('TO``DO'));
}

module.exports = configCases;
