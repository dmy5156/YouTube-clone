export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("Chunk size must be positive");
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}
export const batchVideoRequests = (ids: readonly string[]): string[][] => chunkArray(ids, 50);
