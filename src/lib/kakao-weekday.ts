import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locale } from "@/lib/locale";
import {
  buildKakaoImageUrl,
  fetchKakaoJson,
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
  age_grade?: number;
  on_issue?: string;
  authors?: string;
  business_model?: string;
  pub_period?: string;
  last_slide_added_dt?: string;
  free_slide_count?: number;
  operator_property?: RawKakaoOperatorProperty;
  asset_property?: RawKakaoAssetProperty;
};

type RawKakaoOption = {
  name?: string;
  param?: string;
};

type RawKakaoWeekdayResponse = {
  result?: {
    list?: RawKakaoSeriesItem[];
    total_count?: number;
    is_end?: boolean;
    selected_bm_opt?: RawKakaoOption;
    bm_opt_list?: RawKakaoOption[];
    selected_tab_opt?: RawKakaoOption;
  };
};

export type KakaoSeriesFilter = "A" | "W" | "P";

export type WeekdayKey =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export type WeekdaySeriesItem = {
  id: string;
  titleId: number | null;
  title: string;
  author: string;
  thumbnailUrl: string;
  genre: string;
  schedule: string;
  accessLabel: string;
  overview: string;
  isAdult: boolean;
  isPaid: boolean;
};

export type WeekdaySection = {
  key: WeekdayKey;
  label: string;
  items: WeekdaySeriesItem[];
};

const WEEKDAY_TABS: Array<{ key: WeekdayKey; tabUid: number }> = [
  { key: "MONDAY", tabUid: 1 },
  { key: "TUESDAY", tabUid: 2 },
  { key: "WEDNESDAY", tabUid: 3 },
  { key: "THURSDAY", tabUid: 4 },
  { key: "FRIDAY", tabUid: 5 },
  { key: "SATURDAY", tabUid: 6 },
  { key: "SUNDAY", tabUid: 7 },
];

const weekdayCachePromises = new Map<KakaoSeriesFilter, Promise<WeekdaySection[]>>();
const MAX_WEEKDAY_PAGES = 40;
const WEEKDAY_CACHE_VERSION = 2;

function getDataRoot() {
  return path.join(process.cwd(), "data");
}

function getWeekdayCachePath(filter: KakaoSeriesFilter) {
  return path.join(getDataRoot(), "cache", "kakao", `weekday-${filter}.json`);
}

function getLocalDayKey(now: Date = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function t(locale: Locale, ko: string, en: string) {
  return locale === "ko" ? ko : en;
}

function getWeekdayLabel(day: WeekdayKey, locale: Locale) {
  const labels: Record<WeekdayKey, string> = {
    MONDAY: t(locale, "월요일", "Monday"),
    TUESDAY: t(locale, "화요일", "Tuesday"),
    WEDNESDAY: t(locale, "수요일", "Wednesday"),
    THURSDAY: t(locale, "목요일", "Thursday"),
    FRIDAY: t(locale, "금요일", "Friday"),
    SATURDAY: t(locale, "토요일", "Saturday"),
    SUNDAY: t(locale, "일요일", "Sunday"),
  };

  return labels[day];
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

function normalizeItem(
  item: RawKakaoSeriesItem,
  locale: Locale,
): WeekdaySeriesItem {
  const isPaid = isKakaoPaidOnlyContent({
    isAllFree: item.is_all_free,
    isWaitFree: item.is_waitfree,
    businessModel: item.business_model,
    waitfreePeriodByMinute: item.waitfree_period_by_minute,
    freeSlideCount: item.free_slide_count,
  });

  return {
    id: String(item.series_id ?? item.title ?? Math.random()),
    titleId: typeof item.series_id === "number" ? item.series_id : null,
    title: item.title ?? "",
    author: item.authors ?? "",
    thumbnailUrl: resolveThumbnailUrl(item),
    genre: item.sub_category ?? item.category ?? "",
    schedule: item.pub_period ?? "",
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
    overview: item.operator_property?.copy ?? "",
    isAdult: (item.age_grade ?? 0) >= 19,
    isPaid,
  };
}

async function readWeekdayCache(filter: KakaoSeriesFilter) {
  try {
    const raw = await readFile(getWeekdayCachePath(filter), "utf8");
    const parsed = JSON.parse(raw) as {
      version?: number;
      dayKey?: string;
      sections?: WeekdaySection[];
    };

    if (
      parsed.version === WEEKDAY_CACHE_VERSION &&
      parsed.dayKey === getLocalDayKey() &&
      parsed.sections
    ) {
      return parsed.sections;
    }
  } catch {
    // ignore cache miss
  }

  return null;
}

async function writeWeekdayCache(
  filter: KakaoSeriesFilter,
  sections: WeekdaySection[],
) {
  const cachePath = getWeekdayCachePath(filter);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(
    cachePath,
    `${JSON.stringify(
      {
        version: WEEKDAY_CACHE_VERSION,
        dayKey: getLocalDayKey(),
        sections,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function fetchWeekdaySection(
  locale: Locale,
  key: WeekdayKey,
  tabUid: number,
  filter: KakaoSeriesFilter,
): Promise<WeekdaySection> {
  const items: RawKakaoSeriesItem[] = [];
  const seenIds = new Set<number>();

  for (let page = 0; page < MAX_WEEKDAY_PAGES; page += 1) {
    const params = new URLSearchParams({
      category_uid: "10",
      page: String(page),
      tab_uid: String(tabUid),
      screen_uid: "52",
    });

    if (filter !== "A") {
      params.set("bm", filter);
      params.set("subcategory_uid", "0");
    }

    const data = await fetchKakaoJson<RawKakaoWeekdayResponse>(
      `https://bff-page.kakao.com/api/gateway/view/v2/landing/dayofweek?${params.toString()}`,
    );

    const pageItems = data.result?.list ?? [];

    for (const item of pageItems) {
      const seriesId = item.series_id;

      if (typeof seriesId === "number") {
        if (seenIds.has(seriesId)) {
          continue;
        }
        seenIds.add(seriesId);
      }

      items.push(item);
    }

    if (data.result?.is_end || pageItems.length === 0) {
      break;
    }
  }

  return {
    key,
    label: getWeekdayLabel(key, locale),
    items: items.map((item) => normalizeItem(item, locale)),
  };
}

export async function getKakaoWeekdaySections(
  locale: Locale,
  filter: KakaoSeriesFilter = "A",
): Promise<WeekdaySection[]> {
  const cached = await readWeekdayCache(filter);

  if (cached) {
    return cached;
  }

  const inFlight = weekdayCachePromises.get(filter);

  if (inFlight) {
    return inFlight;
  }

  const request = Promise.all(
    WEEKDAY_TABS.map((entry) =>
      fetchWeekdaySection(locale, entry.key, entry.tabUid, filter),
    ),
  );

  weekdayCachePromises.set(filter, request);

  try {
    const sections = await request;
    await writeWeekdayCache(filter, sections);
    return sections;
  } finally {
    weekdayCachePromises.delete(filter);
  }
}
