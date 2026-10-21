#!/usr/bin/env node
'use strict';

/**
 * Cetak blok mcp.json siap-tempel dengan path ABSOLUT ke server MCP.
 * Alasan: dokumentasi Kiro tidak menjamin working directory server MCP lokal
 * maupun ekspansi ${workspaceFolder}, jadi path absolut adalah opsi paling pasti.
 *
 * Pakai: node mcp/print-config.js   -> salin hasilnya ke .kiro/settings/mcp.json
 */

const path = require('node:path');

const serverPath = path.join(__dirname, 'tjlink-readonly-server.js').split(path.sep).join('/');

const config = {
  mcpServers: {
    'tjlink-readonly': {
      command: 'node',
      args: [serverPath],
      disabled: false,
      // Hanya tool read-only yang di-autoApprove (workshop: "use autoApprove sparingly").
      autoApprove: ['list_files', 'read_file', 'search_code', 'git_status'],
    },
  },
};

process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
