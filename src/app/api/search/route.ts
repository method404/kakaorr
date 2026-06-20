import { NextResponse } from "next/server";
import { getStoredSeriesSummaries } from "@/lib/kakao-library-store";
import { searchKakaoSeries } from "@/lib/kakao-search";
import { normalizeLocale } from "@/lib/locale";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const locale = normalizeLocale(searchParams.get("locale"));

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  try {
    const [payload, storedSeries] = await Promise.all([
      searchKakaoSeries(query, locale),
      getStoredSeriesSummaries(),
    ]);
    const storedSeriesByTitleId = Object.fromEntries(
      storedSeries.map((item) => [String(item.titleId), item.slug]),
    );

    return NextResponse.json({
      results: payload.results.slice(0, 8).map((result) => ({
        ...result,
        storedSlug:
          result.titleId === null
            ? null
            : storedSeriesByTitleId[String(result.titleId)] ?? null,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Search request failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
