import type { Locale } from "@/lib/locale";
import {
  buildKakaoImageUrl,
  fetchKakaoJson,
  formatKakaoDate,
  isKakaoPaidOnlyContent,
  resolveKakaoAccessLabel,
} from "@/lib/kakao-request";

type RawKakaoAssetProperty = {
  banner_img?: string;
  card_img?: string;
  banner_set?: {
    main_img?: string;
  };
  card_set?: {
    background_img?: string;
  };
};

type RawKakaoOperatorProperty = {
  copy?: string;
};

type RawKakaoSeriesItem = {
  series_id?: number;
  category?: string;
  sub_category?: string;
  title?: string;
  is_all_free?: boolean;
  is_waitfree?: boolean;
  waitfree_period_by_minute?: number;
  business_model?: string;
  age_grade?: number;
  authors?: string;
  pub_period?: string;
  last_slide_added_dt?: string;
  free_slide_count?: number;
  operator_property?: RawKakaoOperatorProperty;
  asset_property?: RawKakaoAssetProperty;
};

type RawKakaoCompletedResponse = {
  result?: {
    list?: RawKakaoSeriesItem[];
    total_count?: number;
    is_end?: boolean;
  };
};

export type KakaoSeriesFilter = "A" | "W" | "P";

export type KakaoCompletedItem = {
  id: string;
  titleId: number | null;
  title: string;
  thumbnailUrl: string;
  authors: string;
  synopsis: string;
  schedule: string;
  lastUpdated: string;
  genres: string[];
  flags: string[];
  rating: string;
  isAdult: boolean;
  isPaid: boolean;
};

export type KakaoCompletedPage = {
  title: string;
  items: KakaoCompletedItem[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalRows: number;
  hasMore: boolean;
};

function t(locale: Locale, ko: string, en: string) {
  return locale === "ko" ? ko : en;
}

function resolveThumbnailUrl(item: RawKakaoSeriesItem) {
  const asset = item.asset_property;

  return buildKakaoImageUrl(
    asset?.card_img ??
      asset?.banner_img ??
      asset?.banner_set?.main_img ??
      asset?.card_set?.background_img,
  );
}

function normalizeFlags(item: RawKakaoSeriesItem, locale: Locale) {
  const accessLabel = resolveKakaoAccessLabel(
    {
      isAllFree: item.is_all_free,
      isWaitFree: item.is_waitfree,
      businessModel: item.business_model,
      waitfreePeriodByMinute: item.waitfree_period_by_minute,
      freeSlideCount: item.free_slide_count,
    },
    locale,
  );

  return accessLabel ? [accessLabel] : [];
}

export async function getKakaoCompletedPage(
  locale: Locale,
  filter: KakaoSeriesFilter = "A",
  page: number = 0,
  pageSize: number = 25,
): Promise<KakaoCompletedPage> {
  const params = new URLSearchParams({
    category_uid: "10",
    page: String(page),
    tab_uid: "12",
    screen_uid: "52",
  });

  if (filter !== "A") {
    params.set("bm", filter);
    params.set("subcategory_uid", "0");
  }

  const data = await fetchKakaoJson<RawKakaoCompletedResponse>(
    `https://bff-page.kakao.com/api/gateway/view/v2/landing/dayofweek?${params.toString()}`,
  );

  const totalRows = data.result?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = page;
  const hasMore = !(data.result?.is_end ?? true);

  return {
    title: t(locale, "완결 웹툰", "Completed Webtoons"),
    items: (data.result?.list ?? []).map((item) => ({
      id: String(item.series_id ?? item.title ?? Math.random()),
      titleId: typeof item.series_id === "number" ? item.series_id : null,
      title: item.title ?? "",
      thumbnailUrl: resolveThumbnailUrl(item),
      authors: item.authors ?? "",
      synopsis: item.operator_property?.copy ?? "",
      schedule: item.pub_period ?? "",
      lastUpdated: formatKakaoDate(item.last_slide_added_dt),
      genres: [item.sub_category ?? item.category ?? ""].filter(Boolean),
      flags: normalizeFlags(item, locale),
      rating: "",
      isAdult: (item.age_grade ?? 0) >= 19,
      isPaid: isKakaoPaidOnlyContent({
        isAllFree: item.is_all_free,
        isWaitFree: item.is_waitfree,
        businessModel: item.business_model,
        waitfreePeriodByMinute: item.waitfree_period_by_minute,
        freeSlideCount: item.free_slide_count,
      }),
    })),
    page: currentPage,
    pageSize,
    totalPages,
    totalRows,
    hasMore,
  };
}
