/**
 * @file core/csv/SeparatorDetector.ts
 * Delimiter auto-detection outside quoted segments.
 * ZERO browser/DOM imports.
 */

export class SeparatorDetector {
  private static readonly CANDIDATES = [',', '\t', ';', ':', '|'];
  private static readonly SAMPLE_LIMIT = 2000;

  static detect(sample: string, candidates: readonly string[] = SeparatorDetector.CANDIDATES): string {
    if (!sample || typeof sample !== 'string' || sample.length === 0) {
      return ',';
    }

    const text = sample.length > SeparatorDetector.SAMPLE_LIMIT
      ? sample.substring(0, SeparatorDetector.SAMPLE_LIMIT)
      : sample;

    const counts = new Array<number>(candidates.length).fill(0);
    let inQuotes = false;
    const len = text.length;

    for (let i = 0; i < len; i++) {
      const char = text[i];
      if (char === '"') {
        if (inQuotes && i + 1 < len && text[i + 1] === '"') {
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes) {
        for (let j = 0; j < candidates.length; j++) {
          if (char === candidates[j]) {
            counts[j]++;
            break;
          }
        }
      }
    }

    let maxCount = 0;
    let dominantIndex = 0;
    for (let j = 0; j < counts.length; j++) {
      if (counts[j] > maxCount) {
        maxCount = counts[j];
        dominantIndex = j;
      }
    }

    return maxCount > 0 ? candidates[dominantIndex] : ',';
  }
}
