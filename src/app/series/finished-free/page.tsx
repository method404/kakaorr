import { AdminShell } from "@/app/_components/admin-shell";
import { FinishedFreeBrowser } from "@/app/series/_components/finished-free-browser";
import { getAppSettings } from "@/lib/app-settings";
import { getStoredSeriesSummaries } from "@/lib/kakao-library-store";
import {
  getKakaoCompletedPage,
  type KakaoSeriesFilter,
} from "@/lib/kakao-completed";
import { getDictionary } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

type SeriesFinishedFreePageProps = {
  searchParams: Promise<{
    filter?: string;
  }>;
};

function isSeriesFilter(value: string | undefined): value is KakaoSeriesFilter {
  return value === "A" || value === "W" || value === "P";
}

export default async function SeriesFinishedFreePage(
  props: SeriesFinishedFreePageProps,
) {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const searchParams = await props.searchParams;
  const filter = isSeriesFilter(searchParams.filter) ? searchParams.filter : "A";

  const [initialPage, storedSeries, settings] = await Promise.all([
    getKakaoCompletedPage(locale, filter, 0, 25),
    getStoredSeriesSummaries(),
    getAppSettings(),
  ]);

  const storedSeriesByTitleId = Object.fromEntries(
    storedSeries.map((item) => [String(item.titleId), item.slug]),
  );

  const labels = {
    filters: locale === "ko" ? "필터" : "Filter",
    all: locale === "ko" ? "전체" : "All",
    waitFree: locale === "ko" ? "기다무" : "Wait Free",
    free: locale === "ko" ? "연재무료" : "Free",
    schedule: locale === "ko" ? "연재" : "Schedule",
    updated: locale === "ko" ? "업데이트" : "Updated",
    empty:
      locale === "ko"
        ? "표시할 완결 웹툰이 없습니다."
        : "No completed webtoons found.",
    emptyDescription:
      locale === "ko" ? "작품 설명이 없습니다." : "No description available.",
    loading: locale === "ko" ? "불러오는 중..." : "Loading...",
    end:
      locale === "ko"
        ? "마지막 항목까지 불러왔습니다."
        : "You've reached the end.",
  };

  const filterItems: Array<{ key: KakaoSeriesFilter; label: string }> = [
    { key: "A", label: labels.all },
    { key: "W", label: labels.waitFree },
    { key: "P", label: labels.free },
  ];

  return (
    <AdminShell
      locale={locale}
      activePath="/series/finished-free"
      title={dict.common.finishedFree}
      hideHeader
      mainClassName="compact-shell"
    >
      <FinishedFreeBrowser
        key={filter}
        apiPath="/api/series/finished-free"
        basePath="/series/finished-free"
        filterItems={filterItems}
        filterParamName="filter"
        initialItems={initialPage.items}
        initialHasMore={initialPage.hasMore}
        initialPage={initialPage.page}
        labels={{
          filters: labels.filters,
          schedule: labels.schedule,
          updated: labels.updated,
          empty: labels.empty,
          emptyDescription: labels.emptyDescription,
          loading: labels.loading,
          end: labels.end,
        }}
        locale={locale}
        filter={filter}
        storedSeriesByTitleId={storedSeriesByTitleId}
        defaultRootFolder={settings.library.defaultRootFolder}
        defaultMonitorMode={settings.library.defaultMonitorMode}
      />
    </AdminShell>
  );
}
