/** Reject failed reads instead of presenting missing rows as valid zero totals. */
export async function readReportQuery<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.data || [];
}
