import type { Locale } from "@/lib/locale";
import {
  buildKakaoImageUrl,
  fetchKakaoJson,
  formatKakaoDate,
  isKakaoPaidOnlyContent,
  resolveKakaoAccessLabel,
} from "@/lib/kakao-request";

type RawKakaoSearchItem = {
  type?: string;
  series_id?: number;
  title?: string;
  thumbnail?: string;
  category?: string;
  sub_category?: string;
  age_grade?: number;
  authors?: string;
  is_all_free?: boolean;
  is_waitfree?: boolean;
  waitfree_period_by_minute?: number;
  free_slide_count?: number;
  last_slide_added_dt?: string;
  business_model?: string;
};

type RawKakaoSearchResponse = {
  result?: {
    total_count?: number;
    is_end?: boolean;
    list?: RawKakaoSearchItem[];
  };
};

export type KakaoSearchResult = {
  id: string;
  titleId: number | null;
  source: "kakao";
  sourceLabel: string;
  title: string;
  thumbnailUrl: string;
  authors: string;
  synopsis: string;
  genre: string;
  accessLabel: string;
  freeCount: number;
  lastUpdated: string;
  genres: string[];
  tags: string[];
  flags: string[];
  isAdult: boolean;
  isPaid: boolean;
};

export type KakaoSearchPayload = {
  results: KakaoSearchResult[];
  totalCount: number;
};

function t(locale: Locale, ko: string, en: string) {
  return locale === "ko" ? ko : en;
}

export async function searchKakaoSeries(
  query: string,
  locale: Locale,
): Promise<KakaoSearchPayload> {
  const trimmed = query.trim();

  if (!trimmed) {
    return {
      results: [],
      totalCount: 0,
    };
  }

  const params = new URLSearchParams({
    keyword: trimmed,
    category_uid: "10",
    is_complete: "false",
    sort_type: "ACCURACY",
    page: "0",
    size: "25",
  });

  const data = await fetchKakaoJson<RawKakaoSearchResponse>(
    `https://bff-page.kakao.com/api/gateway/api/v2/search/series?${params.toString()}`,
  );

  const items = (data.result?.list ?? []).filter((item) => item.type === "SERIES");

  return {
    totalCount: data.result?.total_count ?? items.length,
    results: items.map((item) => ({
      id: String(item.series_id ?? item.title ?? Math.random()),
      titleId: typeof item.series_id === "number" ? item.series_id : null,
      source: "kakao",
      sourceLabel: "KakaoPage",
      title: item.title ?? "",
      thumbnailUrl: buildKakaoImageUrl(item.thumbnail),
      authors: item.authors ?? "",
      synopsis: "",
      genre: item.sub_category ?? item.category ?? "",
      accessLabel: resolveKakaoAccessLabel(
        {
          isAllFree: item.is_all_free,
          isWaitFree: item.is_waitfree,
          businessModel: item.business_model,
          waitfreePeriodByMinute: item.waitfree_period_by_minute,
          freeSlideCount: item.free_slide_count,
        },
        locale,
      ),
      freeCount: item.free_slide_count ?? 0,
      lastUpdated: formatKakaoDate(item.last_slide_added_dt),
      genres: [item.sub_category ?? item.category ?? ""].filter(Boolean),
      tags: [],
      flags: [],
      isAdult: (item.age_grade ?? 0) >= 19,
      isPaid: isKakaoPaidOnlyContent({
        isAllFree: item.is_all_free,
        isWaitFree: item.is_waitfree,
        businessModel: item.business_model,
        waitfreePeriodByMinute: item.waitfree_period_by_minute,
        freeSlideCount: item.free_slide_count,
      }),
    })),
  };
}
