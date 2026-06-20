import { AdminShell } from "@/app/_components/admin-shell";
import { WeekdaySeriesBrowser } from "@/app/series/_components/weekday-series-browser";
import { getAppSettings } from "@/lib/app-settings";
import { getDictionary } from "@/lib/i18n";
import { getStoredSeriesSummaries } from "@/lib/kakao-library-store";
import {
  getKakaoWeekdaySections,
  type KakaoSeriesFilter,
} from "@/lib/kakao-weekday";
import { getLocale } from "@/lib/locale";

type SeriesWeekdayPageProps = {
  searchParams: Promise<{
    filter?: string;
  }>;
};

function isSeriesFilter(value: string | undefined): value is KakaoSeriesFilter {
  return value === "A" || value === "W" || value === "P";
}

export default async function SeriesWeekdayPage(
  props: SeriesWeekdayPageProps,
) {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const searchParams = await props.searchParams;
  const filter = isSeriesFilter(searchParams.filter) ? searchParams.filter : "A";
  const [weekdaySections, storedSeries, settings] = await Promise.all([
    getKakaoWeekdaySections(locale, filter),
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
  };

  const filterItems: Array<{ key: KakaoSeriesFilter; label: string }> = [
    { key: "A", label: labels.all },
    { key: "W", label: labels.waitFree },
    { key: "P", label: labels.free },
  ];

  return (
    <AdminShell
      locale={locale}
      activePath="/series/weekday"
      title={dict.common.weekday}
      hideHeader
      mainClassName="compact-shell"
    >
      <WeekdaySeriesBrowser
        filterItems={filterItems}
        labels={{ filters: labels.filters }}
        locale={locale}
        filter={filter}
        sections={weekdaySections}
        storedSeriesByTitleId={storedSeriesByTitleId}
        defaultRootFolder={settings.library.defaultRootFolder}
        defaultMonitorMode={settings.library.defaultMonitorMode}
      />
    </AdminShell>
  );
}
