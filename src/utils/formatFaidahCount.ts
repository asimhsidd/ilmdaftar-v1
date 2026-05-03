/**
 * Correct Arabic pluralization for fa'idah counts.
 * Rules:
 *   1 → "فائدة" (fa'idah)
 *   2 → "فائدتان" (fa'idatayn)
 *   3+ → "فوائد" (fawā'id)
 */
export function formatFaidahCount(count: number, language: string = 'ar'): string {
  if (language !== 'ar') {
    if (count === 1) return `1 fāʾidah`;
    return `${count} fawāʾid`;
  }
  if (count === 0) return 'لا فوائد';
  if (count === 1) return 'فائدة واحدة';
  if (count === 2) return 'فائدتان';
  return `${count} فوائد`;
}
