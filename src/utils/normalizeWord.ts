/**
 * normalizeWord — convert numeric tokens to spoken English for language learners.
 *
 * Examples:
 *   "100%"  → "one hundred percent"
 *   "50%"   → "fifty percent"
 *   "1st"   → "first"
 *   "2nd"   → "second"
 *   "3rd"   → "third"
 *   "4th"   → "fourth"
 *   Plain words are returned unchanged.
 */

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty',
  'sixty', 'seventy', 'eighty', 'ninety',
];

function intToWords(n: number): string {
  if (n === 0) return 'zero';
  if (n < 0) return 'negative ' + intToWords(-n);

  const parts: string[] = [];

  if (n >= 1_000_000) {
    parts.push(intToWords(Math.floor(n / 1_000_000)) + ' million');
    n %= 1_000_000;
  }
  if (n >= 1_000) {
    parts.push(intToWords(Math.floor(n / 1_000)) + ' thousand');
    n %= 1_000;
  }
  if (n >= 100) {
    parts.push(ONES[Math.floor(n / 100)] + ' hundred');
    n %= 100;
  }
  if (n >= 20) {
    const t = TENS[Math.floor(n / 10)];
    const o = ONES[n % 10];
    parts.push(o ? t + '-' + o : t);
  } else if (n > 0) {
    parts.push(ONES[n]);
  }

  return parts.join(' ');
}

const ORDINALS: Record<string, string> = {
  '1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth',
  '5th': 'fifth', '6th': 'sixth', '7th': 'seventh', '8th': 'eighth',
  '9th': 'ninth', '10th': 'tenth', '11th': 'eleventh', '12th': 'twelfth',
};

export function normalizeWord(raw: string): string {
  const w = raw.trim();

  // Ordinals: 1st, 2nd, 3rd … 12th (lookup), generic Nth (nth → Nth)
  const ordLower = w.toLowerCase();
  if (ORDINALS[ordLower]) return ORDINALS[ordLower];
  const ordMatch = w.match(/^(\d+)(st|nd|rd|th)$/i);
  if (ordMatch) {
    const n = parseInt(ordMatch[1], 10);
    if (!isNaN(n)) return intToWords(n) + ordMatch[2].toLowerCase();
  }

  // Percentages: 50%, 100%, 3.5%
  const pctMatch = w.match(/^(\d+(?:\.\d+)?)%$/);
  if (pctMatch) {
    const n = parseFloat(pctMatch[1]);
    if (!isNaN(n) && Number.isInteger(n)) {
      return intToWords(n) + ' percent';
    }
    // Decimal percentage: keep as-is (rare in speech)
    return w;
  }

  // Plain integers that look like spoken numbers (avoid converting years/IDs)
  // Only convert standalone small numbers that clearly appear in speech context
  // — we leave this conservative to avoid mangling "2024" or zip codes.
  // Uncomment if you want all integers converted:
  // const numMatch = w.match(/^-?\d+$/);
  // if (numMatch) { const n = parseInt(w, 10); if (!isNaN(n)) return intToWords(n); }

  return w;
}
