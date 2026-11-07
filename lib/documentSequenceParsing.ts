export function extractHistoricalSequence(reference: string, prefixes: readonly string[]): number | null {
  const prefix = reference.trim().toUpperCase();
  for (const candidate of prefixes) {
    const p = candidate.toUpperCase();
    if (!prefix.startsWith(p)) continue;
    const tail = prefix.slice(p.length).replace(/^[-_ /]+/, "");
    const patterns = [
      /^20\d{2}[-_ /]+(\d{1,9})$/,
      /^(\d{1,9})\/\d{1,2}\/\d{2,4}$/,
      /^(\d{1,9})(?:[-/]\d{2})?$/,
    ];
    for (const pattern of patterns) {
      const match = tail.match(pattern);
      if (match) {
        const number = Number(match[1]);
        if (Number.isSafeInteger(number) && number > 0) return number;
      }
    }
  }
  return null;
}

export function nextSequenceFromReferences(
  references: readonly string[],
  prefixes: readonly string[],
  configuredMinimum = 1,
): number {
  let highest = Math.max(0, Math.floor(configuredMinimum) - 1);
  for (const reference of references) {
    const sequence = extractHistoricalSequence(reference, prefixes);
    if (sequence !== null) highest = Math.max(highest, sequence);
  }
  return highest + 1;
}
