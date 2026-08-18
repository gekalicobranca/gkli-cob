import fs from 'node:fs';
import * as XLSX from 'xlsx';

const file = 'C:/Users/Gekali/Downloads/CotasInadimplentes_182.xlsx';
const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellDates: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });

const useful = rows.map((row, idx) => ({ row: idx + 1, values: row.map((v, col) => ({ col: XLSX.utils.encode_col(col), v })).filter(x => x.v !== null && String(x.v).trim() !== '') })).filter(x => x.values.length);
console.log(JSON.stringify({ sheet: wb.SheetNames[0], dimensions: ws['!ref'], usefulRows: useful.length, sample: useful.slice(0, 90) }, null, 2));

const textRows = useful.map(x => ({ row: x.row, text: x.values.map(y => String(y.v)).join(' | ') }));
const unitRows = textRows.filter(x => /Unidade/i.test(x.text));
const totalRows = textRows.filter(x => /Total/i.test(x.text));
const referenceRows = textRows.filter(x => /Referência/i.test(x.text));
console.log(JSON.stringify({ unitRows: unitRows.slice(0, 20), unitRowsCount: unitRows.length, totalRows: totalRows.slice(0, 30), totalRowsCount: totalRows.length, referenceRows: referenceRows.slice(0, 20), referenceRowsCount: referenceRows.length }, null, 2));

const money = (v: unknown) => Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;
const debts: Array<{unit: string; owner: string; due: string; original: number; fine: number; interest: number; total: number; row: number}> = [];
for (let i = 0; i < rows.length - 2; i++) {
  if (String(rows[i]?.[4] ?? '').trim().toLowerCase() !== 'unidade') continue;
  const values = rows[i];
  const debt = rows[i + 2];
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(debt?.[8] ?? '').trim())) continue;
  debts.push({
    unit: String(values?.[10] ?? '').trim(),
    owner: String(values?.[12] ?? '').trim(),
    due: String(debt?.[8] ?? '').trim(),
    original: money(debt?.[14]),
    fine: money(debt?.[16]),
    interest: money(debt?.[17]),
    total: money(debt?.[21]),
    row: i + 3,
  });
}
const uniqueUnits = new Set(debts.map(d => d.unit));
const totals = debts.reduce((a, d) => ({ original: a.original + d.original, fine: a.fine + d.fine, interest: a.interest + d.interest, total: a.total + d.total }), { original: 0, fine: 0, interest: 0, total: 0 });
const dates = debts.map(d => d.due.split('/').reverse().join('-')).sort();
const mismatches = debts.filter(d => Math.abs((d.original + d.fine + d.interest) - d.total) > 0.011);
console.log(JSON.stringify({ debts: debts.length, uniqueUnits: uniqueUnits.size, totals, minDue: dates[0], maxDue: dates.at(-1), mismatches: mismatches.length, sampleLast: debts.slice(-5) }, null, 2));
