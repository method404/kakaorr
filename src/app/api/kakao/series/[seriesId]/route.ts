import { NextResponse } from "next/server";
import { fetchKakaoSeriesSnapshot } from "@/lib/kakao-series";
import type { Locale } from "@/lib/locale";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    seriesId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const seriesId = Number(params.seriesId);

    if (!Number.isInteger(seriesId) || seriesId <= 0) {
      return NextResponse.json({ error: "Invalid seriesId." }, { status: 400 });
    }

    const url = new URL(request.url);
    const localeParam = url.searchParams.get("locale");
    const locale: Locale = localeParam === "en" ? "en" : "ko";
    const snapshot = await fetchKakaoSeriesSnapshot(seriesId, { locale });

    return NextResponse.json({
      ok: true,
      snapshot,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch Kakao series snapshot.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
