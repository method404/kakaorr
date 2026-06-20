import { NextResponse } from "next/server";
import {
  getKakaoCompletedPage,
  type KakaoSeriesFilter,
} from "@/lib/kakao-completed";
import { normalizeLocale } from "@/lib/locale";

function isSeriesFilter(value: string | null): value is KakaoSeriesFilter {
  return value === "A" || value === "W" || value === "P";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locale = normalizeLocale(searchParams.get("locale"));
  const filter = isSeriesFilter(searchParams.get("filter"))
    ? (searchParams.get("filter") as KakaoSeriesFilter)
    : "A";
  const page = Number(searchParams.get("page") ?? "0");
  const pageSize = Number(searchParams.get("pageSize") ?? "25");

  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize <= 0) {
    return NextResponse.json({ error: "Invalid pagination." }, { status: 400 });
  }

  try {
    const payload = await getKakaoCompletedPage(locale, filter, page, pageSize);
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load completed series.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
