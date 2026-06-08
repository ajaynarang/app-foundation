const RATECON_KEYWORDS = ['ratecon', 'rate_con', 'rate con', 'rate confirmation', 'rc-', 'confirmation'];

const BLOCKED_KEYWORDS = [
  'invoice',
  'receipt',
  'w9',
  'w-9',
  'insurance',
  'certificate',
  'pod',
  'bol',
  'bill of lading',
  'proof of delivery',
  'fuel',
  'lumper',
];

export function isLikelyRatecon(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return RATECON_KEYWORDS.some((kw) => lower.includes(kw));
}

export function isBlockedFilename(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (isLikelyRatecon(fileName)) return false;
  return BLOCKED_KEYWORDS.some((kw) => lower.includes(kw));
}
