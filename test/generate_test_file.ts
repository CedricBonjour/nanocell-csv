/**
 * @file test/generate_test_file.ts
 * High-performance streaming test CSV generator with regional locale support,
 * RFC 4180 stress injection, UTF-8 BOM, and deterministic PRNG seeding.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface GeneratorOptions {
  sizeMb?: number;
  country?: string;
  seed?: number;
  stress?: number;
  bom?: boolean;
  outDir?: string;
}

export interface GeneratorResult {
  filePath: string;
  fileName: string;
  totalBytes: number;
  totalRows: number;
  durationMs: number;
  throughputMbPerSec: number;
  rowsPerSec: number;
}

// ---------------------------------------------------------------------------
// Deterministic Fast PRNG (Mulberry32)
// ---------------------------------------------------------------------------
export function createPrng(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Regional Locale Format Configurations
// ---------------------------------------------------------------------------
export interface LocaleConfig {
  code: string;
  delimiter: string;
  decimalSep: string;
  thousandsSep: string;
  currencyCode: string;
  formatDate: (y: number, m: number, d: number) => string;
  formatTime: (h: number, min: number, s: number) => string;
  formatCurrency: (amountStr: string) => string;
}

const pad2 = (n: number) => (n < 10 ? '0' + n : String(n));

export const LOCALES: Record<string, LocaleConfig> = {
  ISO: {
    code: 'ISO',
    delimiter: ',',
    decimalSep: '.',
    thousandsSep: '',
    currencyCode: 'USD',
    formatDate: (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`,
    formatTime: (h, min, s) => `${pad2(h)}:${pad2(min)}:${pad2(s)}`,
    formatCurrency: (amt) => `$${amt}`
  },
  FR: {
    code: 'FR',
    delimiter: ';',
    decimalSep: ',',
    thousandsSep: ' ',
    currencyCode: 'EUR',
    formatDate: (y, m, d) => `${pad2(d)}/${pad2(m)}/${y}`,
    formatTime: (h, min, s) => `${pad2(h)}:${pad2(min)}:${pad2(s)}`,
    formatCurrency: (amt) => `${amt} €`
  },
  DE: {
    code: 'DE',
    delimiter: ';',
    decimalSep: ',',
    thousandsSep: '.',
    currencyCode: 'EUR',
    formatDate: (y, m, d) => `${pad2(d)}.${pad2(m)}.${y}`,
    formatTime: (h, min, s) => `${pad2(h)}:${pad2(min)}:${pad2(s)}`,
    formatCurrency: (amt) => `${amt} €`
  },
  US: {
    code: 'US',
    delimiter: ',',
    decimalSep: '.',
    thousandsSep: ',',
    currencyCode: 'USD',
    formatDate: (y, m, d) => `${pad2(m)}/${pad2(d)}/${y}`,
    formatTime: (h, min, s) => {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${pad2(h12)}:${pad2(min)}:${pad2(s)} ${ampm}`;
    },
    formatCurrency: (amt) => `$${amt}`
  },
  GB: {
    code: 'GB',
    delimiter: ',',
    decimalSep: '.',
    thousandsSep: ',',
    currencyCode: 'GBP',
    formatDate: (y, m, d) => `${pad2(d)}/${pad2(m)}/${y}`,
    formatTime: (h, min, s) => `${pad2(h)}:${pad2(min)}:${pad2(s)}`,
    formatCurrency: (amt) => `£${amt}`
  },
  JP: {
    code: 'JP',
    delimiter: ',',
    decimalSep: '.',
    thousandsSep: ',',
    currencyCode: 'JPY',
    formatDate: (y, m, d) => `${y}/${pad2(m)}/${pad2(d)}`,
    formatTime: (h, min, s) => `${pad2(h)}:${pad2(min)}:${pad2(s)}`,
    formatCurrency: (amt) => `¥${amt}`
  },
  CH: {
    code: 'CH',
    delimiter: ';',
    decimalSep: '.',
    thousandsSep: "'",
    currencyCode: 'CHF',
    formatDate: (y, m, d) => `${pad2(d)}.${pad2(m)}.${y}`,
    formatTime: (h, min, s) => `${pad2(h)}:${pad2(min)}:${pad2(s)}`,
    formatCurrency: (amt) => `CHF ${amt}`
  }
};

export function getLocale(code: string): LocaleConfig {
  const upper = (code || 'ISO').toUpperCase();
  if (LOCALES[upper]) return LOCALES[upper];
  // Generic fallback with custom country code and standard ISO formats
  return {
    ...LOCALES.ISO,
    code: upper
  };
}

// ---------------------------------------------------------------------------
// Static Vocabularies for Realistic Data
// ---------------------------------------------------------------------------
const CATEGORIES = ['Hardware', 'Software', 'Cloud Services', 'Consulting', 'Enterprise Support', 'Security', 'Networking', 'AI Tools'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED'];
const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'JP', name: 'Japan' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' }
];

const NAMES = [
  'Smith, John',
  'Dr. Müller, Hans',
  'Dupont, Élodie',
  "O'Connor, Liam",
  'Tanaka, Kenji',
  'García, María',
  'Rossi, Marco',
  'Schmidt, Anna',
  'Dubois, Claire',
  'Williams, Robert'
];

const BASE_NOTES = [
  'Standard order fulfillment',
  'Customer requested rush handling',
  'Corporate discount 15% applied',
  'Requires special freight delivery',
  'Verified by regional compliance team',
  'Invoice issued; pending payment receipt',
  'Annual subscription renewal'
];

const HEX_CHARS = '0123456789abcdef';
const HEX_COLORS = ['#4A90E2', '#E94E77', '#50E3C2', '#F5A623', '#9013FE', '#7ED321', '#B8E986', '#417505'];

// ---------------------------------------------------------------------------
// Main Generator Function
// ---------------------------------------------------------------------------
export async function generateTestFile(options: GeneratorOptions = {}): Promise<GeneratorResult> {
  const sizeMb = Number(options.sizeMb) > 0 ? Number(options.sizeMb) : 11;
  const country = (options.country || 'ISO').toUpperCase();
  const seed = Number.isInteger(options.seed) ? Number(options.seed) : 12345;
  const stress = typeof options.stress === 'number' ? Math.max(0, Math.min(1, options.stress)) : 0;
  const bom = Boolean(options.bom);
  const outDir = options.outDir || path.resolve(process.cwd(), 'test/files');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const locale = getLocale(country);
  const sep = locale.delimiter;
  const targetBytes = Math.round(sizeMb * 1024 * 1024);

  // Parameter-rich output file name
  const bomTag = bom ? 'bom' : 'nobom';
  const stressTag = stress > 0 ? `stress${Math.round(stress * 100)}` : 'nostress';
  const fileName = `test_${country}_${sizeMb}mb_${bomTag}_${stressTag}_seed${seed}.csv`;
  const filePath = path.join(outDir, fileName);

  const rand = createPrng(seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
  const randFloat = (min: number, max: number, decimals: number = 2) => {
    const val = rand() * (max - min) + min;
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  };

  const formatNumber = (num: number, decimals: number = 2): string => {
    const fixed = num.toFixed(decimals);
    const [intPart, decPart] = fixed.split('.');
    let formattedInt = intPart;
    if (locale.thousandsSep) {
      formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, locale.thousandsSep);
    }
    return decPart !== undefined ? `${formattedInt}${locale.decimalSep}${decPart}` : formattedInt;
  };

  const generateUuid = () => {
    let u = '';
    for (let i = 0; i < 32; i++) {
      if (i === 8 || i === 12 || i === 16 || i === 20) u += '-';
      if (i === 12) u += '4';
      else if (i === 16) u += HEX_CHARS[(Math.floor(rand() * 4) + 8)];
      else u += HEX_CHARS[Math.floor(rand() * 16)];
    }
    return u;
  };

  const generateHexHash = () => {
    let h = '';
    for (let i = 0; i < 32; i++) h += HEX_CHARS[Math.floor(rand() * 16)];
    return h;
  };

  // Header definition
  const headers = [
    'id',
    'transaction_id',
    'date',
    'time',
    'timestamp',
    'country_code',
    'country_name',
    'category',
    'priority',
    'status',
    'quantity',
    'unit_price',
    'total_amount',
    'currency_code',
    'currency_formatted',
    'tax_rate',
    'latitude',
    'longitude',
    'geo_point',
    'hex_hash',
    'hex_color',
    'is_verified',
    'ip_address',
    'customer_name',
    'notes'
  ];

  const headerRow = headers.join(sep) + '\r\n';

  const writeStream = fs.createWriteStream(filePath, {
    flags: 'w',
    encoding: 'utf-8',
    highWaterMark: 64 * 1024
  });

  const startTime = performance.now();
  let totalBytes = 0;
  let totalRows = 0;

  // Prepend UTF-8 BOM if requested
  if (bom) {
    const bomBuffer = Buffer.from('\uFEFF', 'utf-8');
    writeStream.write(bomBuffer);
    totalBytes += bomBuffer.length;
  }

  writeStream.write(headerRow);
  totalBytes += Buffer.byteLength(headerRow, 'utf-8');

  // Buffer accumulator for fast bulk writes
  let buffer = '';
  const BUFFER_FLUSH_SIZE = 64 * 1024;

  const writeAsync = async (content: string): Promise<void> => {
    totalBytes += Buffer.byteLength(content, 'utf-8');
    if (!writeStream.write(content)) {
      await new Promise<void>((resolve) => writeStream.once('drain', resolve));
    }
  };

  while (totalBytes < targetBytes) {
    totalRows++;

    // Optional stress comment injection
    if (stress > 0 && rand() < (stress * 0.05)) {
      buffer += `# System checkpoint audit log timestamp: ${Date.now()}\r\n`;
    }

    const rowId = totalRows;
    const txId = generateUuid();

    const y = randInt(2020, 2026);
    const m = randInt(1, 12);
    const d = randInt(1, 28);
    const dateStr = locale.formatDate(y, m, d);

    const h = randInt(0, 23);
    const min = randInt(0, 59);
    const s = randInt(0, 59);
    const timeStr = locale.formatTime(h, min, s);
    const timestampStr = `${y}-${pad2(m)}-${pad2(d)}T${pad2(h)}:${pad2(min)}:${pad2(s)}Z`;

    const countryObj = pick(COUNTRIES);
    const cat = pick(CATEGORIES);
    const prio = pick(PRIORITIES);
    const stat = pick(STATUSES);

    const qty = randInt(1, 500);
    const unitPriceNum = randFloat(5.0, 1500.0, 2);
    const totalAmountNum = Math.round(qty * unitPriceNum * 100) / 100;

    const unitPriceStr = formatNumber(unitPriceNum, 2);
    const totalAmountStr = formatNumber(totalAmountNum, 2);
    const currFormatted = locale.formatCurrency(totalAmountStr);

    const taxRateStr = formatNumber(randFloat(0.05, 0.25, 4), 4);
    const lat = randFloat(-85.0, 85.0, 6);
    const lon = randFloat(-175.0, 175.0, 6);
    // Quoted coordinate pair with embedded comma delimiter
    const geoPoint = `"${lat}, ${lon}"`;

    const hash = generateHexHash();
    const color = pick(HEX_COLORS);
    const verified = rand() > 0.15 ? 'true' : 'false';
    const ip = `${randInt(10, 220)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;

    let customerName = `"${pick(NAMES)}"`;
    let notes = pick(BASE_NOTES);

    // RFC 4180 Stress Injection
    if (stress > 0 && rand() < stress) {
      const stressType = randInt(1, 4);
      if (stressType === 1) {
        // Multiline quoted text
        notes = `"Batch order item\r\nInternal review notes:\r\nApproved by management"`;
      } else if (stressType === 2) {
        // Escaped double-quotes
        notes = `"Priority: ""CRITICAL"" dispatch requested; customer ref ""VIP-99"""`;
      } else if (stressType === 3) {
        // Unquoted spaces / emojis / symbols
        notes = `"Fast express shipping 🚀 | Priority rating 📊 ($100 rebate)"`;
      } else {
        // Delimiters inside quotes
        notes = `"Item specs: width=10, height=20, depth=30; fragile"`;
      }
    } else {
      if (notes.includes(sep) || notes.includes('"') || notes.includes('\n')) {
        notes = '"' + notes.replaceAll('"', '""') + '"';
      }
    }

    const row = [
      rowId,
      txId,
      dateStr,
      timeStr,
      timestampStr,
      countryObj.code,
      countryObj.name,
      cat,
      prio,
      stat,
      qty,
      unitPriceStr,
      totalAmountStr,
      locale.currencyCode,
      `"${currFormatted}"`,
      taxRateStr,
      lat,
      lon,
      geoPoint,
      hash,
      color,
      verified,
      ip,
      customerName,
      notes
    ].join(sep) + '\r\n';

    buffer += row;

    if (buffer.length >= BUFFER_FLUSH_SIZE) {
      await writeAsync(buffer);
      buffer = '';
    }
  }

  if (buffer.length > 0) {
    await writeAsync(buffer);
    buffer = '';
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end((err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const durationMs = Math.round(performance.now() - startTime);
  const totalMb = totalBytes / (1024 * 1024);
  const throughputMbPerSec = durationMs > 0 ? Math.round((totalMb / (durationMs / 1000)) * 100) / 100 : 0;
  const rowsPerSec = durationMs > 0 ? Math.round((totalRows / (durationMs / 1000))) : 0;

  return {
    filePath,
    fileName,
    totalBytes,
    totalRows,
    durationMs,
    throughputMbPerSec,
    rowsPerSec
  };
}

// ---------------------------------------------------------------------------
// CLI Execution Handler
// ---------------------------------------------------------------------------
function parseCliArgs(): GeneratorOptions {
  const scriptIdx = process.argv.findIndex((arg) => arg.includes('generate_test_file'));
  const args = scriptIdx !== -1 ? process.argv.slice(scriptIdx + 1) : process.argv.slice(2);
  const options: GeneratorOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--size' || arg === '-s') {
      options.sizeMb = parseFloat(args[++i]);
    } else if (arg === '--country' || arg === '-c') {
      options.country = args[++i];
    } else if (arg === '--seed') {
      options.seed = parseInt(args[++i], 10);
    } else if (arg === '--stress') {
      const nextVal = args[i + 1];
      if (nextVal && !nextVal.startsWith('-') && !isNaN(Number(nextVal))) {
        options.stress = parseFloat(args[++i]);
      } else {
        options.stress = 0.05; // 5% default stress ratio
      }
    } else if (arg === '--bom') {
      options.bom = true;
    } else if (arg === '--out' || arg === '-o') {
      options.outDir = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: vite-node test/generate_test_file.ts [options]

Options:
  -s, --size <mb>       Target file size in MB (default: 11)
  -c, --country <iso2>  ISO2 country code or ISO (default: ISO)
                        Supported: ISO, FR, DE, US, GB, JP, CH (or any ISO2 code)
  --seed <number>       PRNG seed for deterministic output (default: 12345)
  --stress [ratio]      RFC 4180 stress injection ratio 0.0-1.0 (default: 0, flag: 0.05)
                        Injects multiline cells, escaped quotes, emojis, comments
  --bom                 Prepend UTF-8 Byte Order Mark (\\uFEFF)
  -o, --out <dir>       Output directory (default: test/files)
  -h, --help            Show this help message

File Naming Convention:
  test_<COUNTRY>_<SIZE>mb_<bom|nobom>_<stressN|nostress>_seed<SEED>.csv
      `);
      process.exit(0);
    }
  }

  return options;
}

const opts = parseCliArgs();
console.log('Generating test CSV file...');
generateTestFile(opts)
  .then((result) => {
    console.log('\n=================================================================');
    console.log('📁 Test CSV File Generation Complete');
    console.log('=================================================================');
    console.log(`  File Name:   ${result.fileName}`);
    console.log(`  File Path:   ${result.filePath}`);
    console.log(`  File Size:   ${(result.totalBytes / (1024 * 1024)).toFixed(2)} MB (${result.totalBytes.toLocaleString()} bytes)`);
    console.log(`  Total Rows:  ${result.totalRows.toLocaleString()} rows`);
    console.log(`  Duration:    ${result.durationMs} ms`);
    console.log(`  Speed:       ${result.throughputMbPerSec} MB/s (${result.rowsPerSec.toLocaleString()} rows/s)`);
    console.log('=================================================================\n');
  })
  .catch((err) => {
    console.error('Error generating test file:', err);
    process.exit(1);
  });
