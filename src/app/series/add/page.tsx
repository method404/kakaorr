import { AdminShell } from "@/app/_components/admin-shell";
import { SearchResultBrowser } from "@/app/series/_components/search-result-browser";
import { AutoSearchForm } from "@/app/series/add/_components/auto-search-form";
import { getAppSettings } from "@/lib/app-settings";
import { getStoredSeriesSummaries } from "@/lib/kakao-library-store";
import { searchKakaoSeries } from "@/lib/kakao-search";
import { getLocale } from "@/lib/locale";

type AddSeriesPageProps = {
  searchParams: Promise<{
    q?: string;
    source?: string;
    open?: string;
  }>;
};

export default async function AddSeriesPage(props: AddSeriesPageProps) {
  const locale = await getLocale();
  const searchParams = await props.searchParams;
  const query = searchParams.q?.trim() ?? "";
  const openId = searchParams.open?.trim() ?? "";
  const [payload, storedSeries, settings] = await Promise.all([
    searchKakaoSeries(query, locale),
    getStoredSeriesSummaries(),
    getAppSettings(),
  ]);
  const storedSeriesByTitleId = Object.fromEntries(
    storedSeries.map((item) => [String(item.titleId), item.slug]),
  );

  const labels = {
    title: locale === "ko" ? "시리즈 추가" : "Add Series",
    searchPlaceholder:
      locale === "ko" ? "작품명, 작가명 검색" : "Search by title or author",
    updatedCol: locale === "ko" ? "최종 업데이트" : "Last Updated",
    genreCol: locale === "ko" ? "장르" : "Genre",
    accessCol: locale === "ko" ? "이용" : "Access",
    freeCountCol: locale === "ko" ? "무료 회차" : "Free Episodes",
    emptyDescription:
      locale === "ko" ? "작품 설명이 없습니다." : "No description available.",
    noResults:
      locale === "ko"
        ? "검색 결과가 없습니다."
        : "No results matched this query.",
  };

  return (
    <AdminShell
      locale={locale}
      activePath="/series/add"
      title={labels.title}
      hideHeader
      mainClassName="compact-shell"
    >
      <div className="add-series-page">
        <section className="card search-panel">
          <AutoSearchForm
            initialQuery={query}
            placeholder={labels.searchPlaceholder}
          />
        </section>

        {query.length === 0 ? null : payload.results.length === 0 ? (
          <section className="search-empty-state">
            <p className="muted">{labels.noResults}</p>
          </section>
        ) : (
          <SearchResultBrowser
            key={`${query}:${openId}`}
            labels={{
              updatedCol: labels.updatedCol,
              genreCol: labels.genreCol,
              accessCol: labels.accessCol,
              freeCountCol: labels.freeCountCol,
              emptyDescription: labels.emptyDescription,
            }}
            locale={locale}
            results={payload.results}
            storedSeriesByTitleId={storedSeriesByTitleId}
            defaultRootFolder={settings.library.defaultRootFolder}
            defaultMonitorMode={settings.library.defaultMonitorMode}
            initialSelectedId={openId}
          />
        )}
      </div>
    </AdminShell>
  );
}
