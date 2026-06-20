import Image from "next/image";
import { notFound } from "next/navigation";
import { AdultBadge } from "@/app/_components/adult-badge";
import { AdminShell } from "@/app/_components/admin-shell";
import { FinishedBadge } from "@/app/_components/finished-badge";
import { LocalizedDateTime } from "@/app/_components/localized-date-time";
import { SeriesDetailActions } from "@/app/series/_components/series-detail-actions";
import { SeriesDetailAutoRefresh } from "@/app/series/_components/series-detail-auto-refresh";
import { SeriesEpisodeManageMenu } from "@/app/series/_components/series-episode-manage-menu";
import { OpenStoragePathButton } from "@/app/series/_components/open-storage-path-button";
import { SeriesSynopsis } from "@/app/series/_components/series-synopsis";
import { getStoredSeriesDetail } from "@/lib/kakao-library-store";
import { buildKakaoClientImageUrl } from "@/lib/kakao-request";
import { getLocale } from "@/lib/locale";

function getEpisodeStateLabel(
  episode: {
    isFree: boolean;
    freeAt: string | null;
  },
  archiveStatus:
    | "pending"
    | "downloading"
    | "downloaded"
    | "failed"
    | "preview"
    | null,
  locale: "ko" | "en",
) {
  if (archiveStatus === "downloaded") {
    return locale === "ko" ? "저장 완료" : "Downloaded";
  }

  if (archiveStatus === "downloading") {
    return locale === "ko" ? "저장 중" : "Downloading";
  }

  if (archiveStatus === "pending") {
    return locale === "ko" ? "저장 대기" : "Queued";
  }

  if (archiveStatus === "failed") {
    return locale === "ko" ? "저장 실패" : "Failed";
  }

  if (episode.isFree) {
    return locale === "ko" ? "미저장" : "Missing";
  }

  if (episode.freeAt) {
    return locale === "ko" ? "공개 예정" : "Scheduled";
  }

  return locale === "ko" ? "잠김" : "Locked";
}

function getEpisodePublicDate(
  episode: {
    isFree: boolean;
    freeAt: string | null;
    releasedAt: string | null;
  },
) {
  if (episode.isFree) {
    return episode.releasedAt ?? episode.freeAt;
  }

  return episode.freeAt ?? episode.releasedAt;
}

type SeriesDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function SeriesDetailPage({
  params,
}: SeriesDetailPageProps) {
  const { slug } = await params;
  const locale = await getLocale();
  const detail = await getStoredSeriesDetail(slug);

  if (!detail) {
    notFound();
  }

  const { summary, overview, episodes, nextFreeEpisode, episodeArchives } = detail;
  const orderedEpisodes = [...episodes].sort((left, right) => right.order - left.order);
  const labels = {
    finished: locale === "ko" ? "완결" : "Finished",
    ongoing: locale === "ko" ? "연재중" : "Ongoing",
    monitoring: locale === "ko" ? "추적중" : "Monitored",
    paused: locale === "ko" ? "보류" : "Paused",
    adult: locale === "ko" ? "성인" : "Adult",
    access: locale === "ko" ? "이용 방식" : "Access",
    updatedAt: locale === "ko" ? "메타데이터 갱신" : "Metadata Updated",
    published: locale === "ko" ? "연재" : "Published",
    free: locale === "ko" ? "무료 공개" : "Free",
    total: locale === "ko" ? "전체 회차" : "Total",
    nextFree: locale === "ko" ? "다음 무료 공개" : "Next Free",
    folder: locale === "ko" ? "저장경로" : "Storage Path",
    number: locale === "ko" ? "번호" : "No.",
    title: locale === "ko" ? "제목" : "Title",
    publicDate: locale === "ko" ? "공개일" : "Release Date",
    state: locale === "ko" ? "상태" : "State",
    manage: locale === "ko" ? "관리" : "Manage",
  };

  return (
    <AdminShell
      locale={locale}
      activePath={`/series/${slug}`}
      title={summary.title}
      hideHeader
    >
      <SeriesDetailAutoRefresh active={summary.hasActiveDownload} />
      <section className="series-detail-shell">
        <div className="series-detail-hero">
          <div className="series-detail-poster">
            {summary.isFinished ? (
              <FinishedBadge size={42} className="series-detail-finished-badge" />
            ) : null}
            {summary.isAdult ? (
              <AdultBadge
                size={42}
                className={`series-detail-adult-badge${
                  summary.isFinished ? " stacked-badge" : ""
                }`}
              />
            ) : null}
            {summary.posterThumbnailUrl ? (
              <Image
                src={buildKakaoClientImageUrl(summary.posterThumbnailUrl)}
                alt={summary.title}
                width={480}
                height={623}
                unoptimized
              />
            ) : (
              <div className="series-card-fallback" />
            )}
          </div>

          <div className="series-detail-main">
            <div className="series-detail-heading-row">
              <div className="series-detail-heading-copy">
                <div className="series-detail-title-row">
                  <h1>{summary.title}</h1>
                  <div className="badge-list series-detail-state-badges">
                    <span className="tag-badge">
                      {summary.isFinished ? labels.finished : labels.ongoing}
                    </span>
                    <span className="tag-badge subtle-tag">
                      {summary.monitored ? labels.monitoring : labels.paused}
                    </span>
                    <span className="tag-badge subtle-tag">{overview.accessLabel}</span>
                    {summary.isAdult ? (
                      <span className="tag-badge subtle-tag">{labels.adult}</span>
                    ) : null}
                  </div>
                </div>

                <div className="series-detail-meta">
                  <span>{summary.authors || "-"}</span>
                  <span>{labels.published} {summary.publishDescription || "-"}</span>
                  <span>
                    {labels.updatedAt}{" "}
                    <LocalizedDateTime value={summary.updatedAt} locale={locale} />
                  </span>
                </div>

                {overview.description ? (
                  <SeriesSynopsis
                    key={overview.description}
                    locale={locale}
                    text={overview.description}
                  />
                ) : null}
              </div>
              <SeriesDetailActions locale={locale} titleId={summary.titleId} />
            </div>

            <div className="series-detail-stats">
              <article className="series-stat-card">
                <span>{labels.free}</span>
                <strong>
                  {detail.freeEpisodes.length}/{summary.totalEpisodes}
                </strong>
              </article>
              <article className="series-stat-card">
                <span>{labels.nextFree}</span>
                <strong>
                  <LocalizedDateTime
                    value={nextFreeEpisode?.freeAt ?? summary.nextCheck}
                    locale={locale}
                  />
                </strong>
              </article>
              <article className="series-stat-card">
                <span>{labels.folder}</span>
                <OpenStoragePathButton locale={locale} path={summary.storagePath} />
              </article>
            </div>
          </div>
        </div>

        <section className="series-episode-panel">
          <div className="series-episode-table-wrap">
            <table className="series-episode-table">
              <thead>
                <tr>
                  <th>{labels.number}</th>
                  <th className="series-episode-thumb-column" aria-label="Thumbnail"></th>
                  <th>{labels.title}</th>
                  <th>{labels.publicDate}</th>
                  <th>{labels.state}</th>
                  <th>{labels.manage}</th>
                </tr>
              </thead>
              <tbody>
                {orderedEpisodes.map((episode) => (
                  <tr key={episode.order}>
                    <td className="series-episode-number-cell mono-text">{episode.order}</td>
                    <td className="series-episode-thumb-cell">
                      <div className="series-episode-thumb">
                        {episode.thumbnailUrl ? (
                          <Image
                            src={buildKakaoClientImageUrl(episode.thumbnailUrl)}
                            alt={episode.title}
                            width={202}
                            height={120}
                            unoptimized
                          />
                        ) : (
                          <div className="series-episode-thumb-fallback" />
                        )}
                      </div>
                    </td>
                    <td className="series-episode-title-cell">
                      <strong>{episode.title}</strong>
                    </td>
                    <td className="series-episode-airdate">
                      <LocalizedDateTime
                        value={getEpisodePublicDate(episode)}
                        locale={locale}
                      />
                    </td>
                    <td className="series-episode-status-cell">
                      <div className="series-episode-status-stack">
                        {(() => {
                          const archive = episodeArchives[episode.order];
                          const archiveStatus = archive?.crawl.status ?? null;
                          const statusClass =
                            archiveStatus === "downloaded"
                              ? " is-downloaded"
                              : archiveStatus === "downloading"
                                ? " is-downloading"
                                : archiveStatus === "pending"
                                  ? " is-pending"
                                  : archiveStatus === "failed"
                                    ? " is-failed"
                                    : " is-preview";

                          return (
                        <span
                              className={`series-episode-status${statusClass}`}
                        >
                              {getEpisodeStateLabel(episode, archiveStatus, locale)}
                        </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="series-episode-manage-cell">
                      <SeriesEpisodeManageMenu
                        locale={locale}
                        titleId={summary.titleId}
                        no={episode.order}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </AdminShell>
  );
}
