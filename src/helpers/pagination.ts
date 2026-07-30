export async function fetchAllPages<T>(fetchPage: (pageToken?: string) => Promise<{ items: T[]; nextPageToken?: string | null }>): Promise<T[]> {
  const all: T[] = [];
  let pageToken: string | undefined;
  do {
    const page = await fetchPage(pageToken);
    all.push(...page.items);
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken);
  return all;
}
