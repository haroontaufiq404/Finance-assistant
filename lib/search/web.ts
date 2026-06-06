import "server-only";

/**
 * Web search adapter (PRD-C2). A single interface over the provider (Tavily by
 * default) so the rare Tier-3 merchant lookup has one swap point. Returns []
 * on missing key or any error, so the caller degrades to an honest
 * "couldn't determine" rather than throwing (SPEC §9).
 */
export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(
  query: string,
  opts?: { topK?: number },
): Promise<WebResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: opts?.topK ?? 5,
        search_depth: "basic",
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    return (json.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.content ?? "",
    }));
  } catch {
    return [];
  }
}
