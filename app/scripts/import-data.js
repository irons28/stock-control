#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const parseLine = (line) => {
    const out = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        out.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    out.push(current);
    return out;
  };
  const headers = parseLine(lines[0]).map((item) => item.trim());
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || '').trim();
    });
    return row;
  });
}

async function main() {
  const [, , type, fileArg, ...rest] = process.argv;
  if (!type || !fileArg) {
    console.error('Usage: node scripts/import-data.js <type> <csv-file> [--apply] [--url=http://localhost:3001]');
    process.exit(1);
  }
  const apply = rest.includes('--apply');
  const urlArg = rest.find((item) => item.startsWith('--url='));
  const baseUrl = urlArg ? urlArg.slice('--url='.length) : 'http://localhost:3001';
  const filePath = path.resolve(process.cwd(), fileArg);
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  const endpoint = apply ? `/api/import/${type}` : `/api/import/validate/${type}`;
  const response = await fetch(baseUrl + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
