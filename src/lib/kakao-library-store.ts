import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  fetchKakaoEpisodeViewerData,
  getKakaoUnlockTicketTypes,
  unlockKakaoEpisodeWithAvailableTickets,
  fetchKakaoSeriesSnapshot,
  type KakaoTicketType,
  type KakaoEpisodeViewerData,
  type KakaoSeriesEpisode,
  type KakaoSeriesOverview,
  type KakaoSeriesSnapshot,
} from "@/lib/kakao-series";
import { fetchKakao } from "@/lib/kakao-request";
import type { ActivityTask, JobRun, MonitorMode } from "@/lib/types";

type EpisodeArchiveStatus =
  | "pending"
  | "downloading"
  | "downloaded"
  | "failed"
  | "preview";

type LibrarySeriesEntry = {
  id: string;
  titleId: number;
  sourceName: string;
  title: string;
  authors: string;
  monitored: boolean;
  monitorMode: MonitorMode;
  checkIntervalHours: number;
  totalEpisodes: number;
  availableEpisodes: number;
  downloadedEpisodes: number;
  storagePath: string;
  rootFolder: string;
  posterThumbnailUrl: string;
  nextCheck: string;
  lastSeen: string;
  sizeOnDisk: string;
  tags: string[];
  isFinished: boolean;
  isWaitFree: boolean;
  isOnBreak: boolean;
  isDailyPass: boolean;
  isAdult: boolean;
  publishDescription: string;
  addedAt: string;
  updatedAt: string;
};

type LibraryIndex = {
  items: LibrarySeriesEntry[];
};

type AddSeriesInput = {
  titleId: number;
  rootFolder: string;
  monitorMode: MonitorMode;
};

type UpdateSeriesSettingsInput = {
  titleId: number;
  checkIntervalHours: number;
};

type StoredSnapshotFile = {
  snapshot: KakaoSeriesSnapshot;
  savedAt: string;
};

type StoredSeriesStorageMetadata = {
  savedAt: string;
  snapshot: KakaoSeriesSnapshot;
};

export type StoredKakaoEpisodeArchiveManifest = {
  titleId: number;
  productId: number;
  order: number;
  title: string;
  episode: {
    thumbnailUrl: string;
    pageCount: number | null;
    freeAt: string | null;
    isFree: boolean;
    releasedAt: string | null;
    slideType: string;
  };
  crawl: {
    status: EpisodeArchiveStatus;
    imageCount: number;
    downloadedImageCount: number;
    downloadedAt: string | null;
    errorMessage: string | null;
  };
  storage: {
    manifestPath: string;
    episodeDir: string;
    imagesDir: string;
    thumbnailPath: string;
  };
};

export type StoredSeriesSummary = {
  id: string;
  titleId: number;
  slug: string;
  title: string;
  authors: string;
  posterThumbnailUrl: string;
  sourceName: string;
  monitored: boolean;
  monitorMode: MonitorMode;
  checkIntervalHours: number;
  totalEpisodes: number;
  availableEpisodes: number;
  downloadedEpisodes: number;
  missingEpisodes: number;
  hasActiveDownload: boolean;
  storagePath: string;
  nextCheck: string;
  lastSeen: string;
  sizeOnDisk: string;
  tags: string[];
  isFinished: boolean;
  isWaitFree: boolean;
  isOnBreak: boolean;
  isDailyPass: boolean;
  isAdult: boolean;
  publishDescription: string;
  addedAt: string;
  updatedAt: string;
};

export type StoredSeriesDetail = {
  summary: StoredSeriesSummary;
  overview: KakaoSeriesOverview;
  episodes: KakaoSeriesEpisode[];
  freeEpisodes: KakaoSeriesEpisode[];
  lockedEpisodes: KakaoSeriesEpisode[];
  nextFreeEpisode: KakaoSeriesEpisode | null;
  waitFreeTicket: KakaoSeriesSnapshot["waitFreeTicket"];
  episodeArchives: Record<number, StoredKakaoEpisodeArchiveManifest | null>;
};

type SeriesStorageStats = {
  availableEpisodes: number;
  downloadedEpisodes: number;
  hasActiveDownload: boolean;
  failedEpisodes: number;
  sizeOnDisk: string;
};

type SeriesStorageSyncTask = {
  snapshot: KakaoSeriesSnapshot;
  rootFolder: string;
  monitorMode: MonitorMode;
  enqueuedAt: string;
  trigger: "series-add" | "series-refresh";
};

type WaitFreeUnlockState = {
  enabled: boolean;
  unavailableTicketTypes: Set<KakaoTicketType>;
};

declare global {
  var __kakaorrRecentJobs: JobRun[] | undefined;
  var __kakaorrStorageSyncQueue: SeriesStorageSyncTask[] | undefined;
  var __kakaorrStorageSyncCurrentRuns:
    | Array<{
        task: SeriesStorageSyncTask;
        startedAt: string;
      }>
    | undefined;
}

const DEFAULT_LIBRARY_ROOT_FOLDER = "./storage/webtoons";
const DEFAULT_CHECK_INTERVAL_HOURS = 24;
const MAX_RECENT_JOBS = 12;
const DEFAULT_STORAGE_SYNC_CONCURRENCY = 2;
const DEFAULT_IMAGE_DOWNLOAD_CONCURRENCY = 3;

function getDataRoot() {
  return path.join(process.cwd(), "data");
}

function getLibraryRoot() {
  return path.join(getDataRoot(), "library");
}

function getKakaoSeriesDir(titleId: number) {
  return path.join(getDataRoot(), "sources", "kakao", "series", String(titleId));
}

function getLibraryIndexPath() {
  return path.join(getLibraryRoot(), "kakao-series.json");
}

function getSeriesSnapshotPath(titleId: number) {
  return path.join(getKakaoSeriesDir(titleId), "snapshot.json");
}

function getSeriesEpisodeArchiveDir(titleId: number, order: number) {
  return path.join(getKakaoSeriesDir(titleId), "episodes", String(order));
}

function getSeriesEpisodeManifestPath(titleId: number, order: number) {
  return path.join(getSeriesEpisodeArchiveDir(titleId, order), "episode.json");
}

function getStorageSeriesMetadataPath(storagePath: string) {
  return path.join(storagePath, "series.json");
}

function getStoragePosterPath(storagePath: string) {
  return path.join(storagePath, "poster.jpg");
}

function getStorageEpisodesRoot(storagePath: string) {
  return path.join(storagePath, "episodes");
}

function getStorageEpisodeDir(storagePath: string, order: number) {
  return path.join(getStorageEpisodesRoot(storagePath), String(order));
}

function getStorageEpisodeManifestPath(storagePath: string, order: number) {
  return path.join(getStorageEpisodeDir(storagePath, order), "episode.json");
}

function getStorageEpisodeImagesDir(storagePath: string, order: number) {
  return path.join(getStorageEpisodeDir(storagePath, order), "images");
}

function getStorageEpisodeThumbnailPath(storagePath: string, order: number) {
  return path.join(getStorageEpisodeDir(storagePath, order), "thumbnail.jpg");
}

function slugifyTitle(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "series";
}

export function buildSeriesSlug(title: string, titleId: number) {
  return `${slugifyTitle(title)}-${titleId}`;
}

function extractTitleIdFromSlug(slug: string) {
  const match = slug.match(/-(\d+)$/);

  if (!match) {
    return null;
  }

  const titleId = Number(match[1]);
  return Number.isInteger(titleId) ? titleId : null;
}

async function ensureDir(dirPath: string) {
  await mkdir(dirPath, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeBinaryFile(filePath: string, buffer: Uint8Array) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, buffer);
}

function getRecentJobsState() {
  if (!globalThis.__kakaorrRecentJobs) {
    globalThis.__kakaorrRecentJobs = [];
  }

  return globalThis.__kakaorrRecentJobs;
}

function appendRecentJob(job: JobRun) {
  const jobs = getRecentJobsState();
  jobs.unshift(job);
  globalThis.__kakaorrRecentJobs = jobs.slice(0, MAX_RECENT_JOBS);
}

function getStorageSyncQueue() {
  if (!globalThis.__kakaorrStorageSyncQueue) {
    globalThis.__kakaorrStorageSyncQueue = [];
  }

  return globalThis.__kakaorrStorageSyncQueue;
}

function getStorageSyncCurrentRuns() {
  if (!globalThis.__kakaorrStorageSyncCurrentRuns) {
    globalThis.__kakaorrStorageSyncCurrentRuns = [];
  }

  return globalThis.__kakaorrStorageSyncCurrentRuns;
}

function isQueuedSeries(titleId: number) {
  const currentRuns = getStorageSyncCurrentRuns();

  return (
    currentRuns.some(
      (run) => run.task.snapshot.overview.seriesId === titleId,
    ) ||
    getStorageSyncQueue().some(
      (task) => task.snapshot.overview.seriesId === titleId,
    )
  );
}

function getStorageSyncConcurrency() {
  const rawValue = Number(
    process.env.KAKAORR_STORAGE_SYNC_CONCURRENCY ?? DEFAULT_STORAGE_SYNC_CONCURRENCY,
  );

  if (!Number.isFinite(rawValue) || rawValue < 1) {
    return DEFAULT_STORAGE_SYNC_CONCURRENCY;
  }

  return Math.min(6, Math.trunc(rawValue));
}

function getImageDownloadConcurrency() {
  const rawValue = Number(
    process.env.KAKAORR_IMAGE_DOWNLOAD_CONCURRENCY ??
      DEFAULT_IMAGE_DOWNLOAD_CONCURRENCY,
  );

  if (!Number.isFinite(rawValue) || rawValue < 1) {
    return DEFAULT_IMAGE_DOWNLOAD_CONCURRENCY;
  }

  return Math.min(8, Math.trunc(rawValue));
}

function getSeriesCheckHourLocal() {
  const rawValue = Number(process.env.KAKAORR_SERIES_CHECK_HOUR ?? 23);

  if (!Number.isFinite(rawValue) || rawValue < 0 || rawValue > 23) {
    return 23;
  }

  return Math.trunc(rawValue);
}

function getSeriesCheckMinuteLocal() {
  const rawValue = Number(process.env.KAKAORR_SERIES_CHECK_MINUTE ?? 50);

  if (!Number.isFinite(rawValue) || rawValue < 0 || rawValue > 59) {
    return 50;
  }

  return Math.trunc(rawValue);
}

export function getSeriesRefreshIntervalMinutes() {
  const rawValue = Number(process.env.KAKAORR_SERIES_REFRESH_INTERVAL_MINUTES ?? 60);

  if (!Number.isFinite(rawValue) || rawValue < 5) {
    return 60;
  }

  return Math.trunc(rawValue);
}

function clampCheckIntervalHours(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_CHECK_INTERVAL_HOURS;
  }

  return Math.min(168, Math.max(1, Math.trunc(value)));
}

function computeNextCheck(
  checkIntervalHours: number,
  publishDescription: string,
  _isFinished: boolean,
  nextFreeAt: string | null,
  waitFreeNextUnlockAt: string | null,
  waitFreeAvailableNow: boolean,
) {
  if (waitFreeAvailableNow) {
    return new Date().toISOString();
  }

  if (waitFreeNextUnlockAt) {
    const nextDate = new Date(waitFreeNextUnlockAt);

    if (!Number.isNaN(nextDate.getTime())) {
      nextDate.setMinutes(nextDate.getMinutes() + 1);
      return nextDate.toISOString();
    }
  }

  if (nextFreeAt) {
    const nextDate = new Date(nextFreeAt);

    if (!Number.isNaN(nextDate.getTime())) {
      nextDate.setMinutes(nextDate.getMinutes() + 1);
      return nextDate.toISOString();
    }
  }

  const next = new Date();

  if (publishDescription) {
    next.setDate(next.getDate() + 1);
    next.setHours(getSeriesCheckHourLocal(), getSeriesCheckMinuteLocal(), 0, 0);
    return next.toISOString();
  }

  next.setHours(next.getHours() + clampCheckIntervalHours(checkIntervalHours));
  return next.toISOString();
}

function buildStoragePath(rootFolder: string, title: string, titleId: number) {
  return path.join(rootFolder, `${title} (${titleId})`);
}

async function resolveRootFolder(rootFolder: string) {
  const target = rootFolder.trim() || DEFAULT_LIBRARY_ROOT_FOLDER;
  await ensureDir(target);
  return target;
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function calculateDirectorySize(targetPath: string): Promise<number> {
  try {
    const entry = await stat(targetPath);

    if (entry.isFile()) {
      return entry.size;
    }

    if (!entry.isDirectory()) {
      return 0;
    }
  } catch {
    return 0;
  }

  const children = await readdir(targetPath, { withFileTypes: true });
  const sizes = await Promise.all(
    children.map((child) => calculateDirectorySize(path.join(targetPath, child.name))),
  );

  return sizes.reduce((sum, size) => sum + size, 0);
}

async function listFilesSafe(targetPath: string) {
  try {
    return await readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isFinishedSeries(snapshot: KakaoSeriesSnapshot) {
  const publish = snapshot.overview.publishPeriod;
  return snapshot.overview.onIssue !== "Y" || publish.includes("완결");
}

function shouldKeepSeriesScheduled(options: {
  isFinished: boolean;
  isWaitFree: boolean;
  totalEpisodes: number;
  downloadedEpisodes: number;
}) {
  if (!options.isFinished) {
    return true;
  }

  return options.isWaitFree && options.downloadedEpisodes < options.totalEpisodes;
}

function buildEpisodeArchiveManifest(
  storagePath: string,
  titleId: number,
  episode: KakaoSeriesEpisode,
  overrides?: Partial<StoredKakaoEpisodeArchiveManifest["crawl"]>,
): StoredKakaoEpisodeArchiveManifest {
  return {
    titleId,
    productId: episode.productId,
    order: episode.order,
    title: episode.title,
    episode: {
      thumbnailUrl: episode.thumbnailUrl,
      pageCount: episode.pageCount,
      freeAt: episode.freeAt,
      isFree: episode.isFree,
      releasedAt: episode.releasedAt,
      slideType: episode.slideType,
    },
    crawl: {
      status: overrides?.status ?? (episode.isFree ? "pending" : "preview"),
      imageCount: overrides?.imageCount ?? 0,
      downloadedImageCount: overrides?.downloadedImageCount ?? 0,
      downloadedAt: overrides?.downloadedAt ?? null,
      errorMessage: overrides?.errorMessage ?? null,
    },
    storage: {
      manifestPath: getStorageEpisodeManifestPath(storagePath, episode.order),
      episodeDir: getStorageEpisodeDir(storagePath, episode.order),
      imagesDir: getStorageEpisodeImagesDir(storagePath, episode.order),
      thumbnailPath: getStorageEpisodeThumbnailPath(storagePath, episode.order),
    },
  };
}

function normalizeLegacyLockedManifest(
  manifest: StoredKakaoEpisodeArchiveManifest | null,
) {
  if (!manifest) {
    return null;
  }

  if (
    manifest.crawl.status === "failed" &&
    !manifest.episode.isFree &&
    manifest.crawl.downloadedImageCount === 0 &&
    manifest.crawl.errorMessage?.includes("/api/gateway/api/v1/viewer/data?")
  ) {
    return {
      ...manifest,
      crawl: {
        ...manifest.crawl,
        status: "preview",
        errorMessage: null,
      },
    } satisfies StoredKakaoEpisodeArchiveManifest;
  }

  return manifest;
}

async function readEpisodeArchiveManifest(titleId: number, order: number) {
  const manifest = await readJsonFile<StoredKakaoEpisodeArchiveManifest | null>(
    getSeriesEpisodeManifestPath(titleId, order),
    null,
  );

  return normalizeLegacyLockedManifest(manifest);
}

async function writeEpisodeArchiveManifest(manifest: StoredKakaoEpisodeArchiveManifest) {
  await Promise.all([
    writeJsonFile(
      getSeriesEpisodeManifestPath(manifest.titleId, manifest.order),
      manifest,
    ),
    writeJsonFile(manifest.storage.manifestPath, manifest),
  ]);
}

function getEpisodeImageExtension(url: string) {
  try {
    const parsed = new URL(url);
    const filename = parsed.searchParams.get("filename") ?? "";
    const matched = filename.match(/(\.[a-zA-Z0-9]+)$/);

    if (matched) {
      return matched[1].toLowerCase();
    }
  } catch {
    return ".jpg";
  }

  return ".jpg";
}

function isKakaoDownloadUrlExpired(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("404");
}

function isKakaoEpisodeLocked(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("구매하지 않은 상품입니다") ||
    error.message.includes("not purchased")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  if (items.length === 0) {
    return [] as R[];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  );

  return results;
}

async function fetchBinary(url: string, referer: string) {
  const response = await fetchKakao(url, {
    headers: {
      accept: "*/*",
      origin: "https://page.kakao.com",
      referer,
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Kakao binary download failed: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function downloadEpisodeImageBytes(
  titleId: number,
  episode: KakaoSeriesEpisode,
  file: KakaoEpisodeViewerData["files"][number],
) {
  const referer = `https://page.kakao.com/content/${titleId}/viewer/${episode.productId}`;

  try {
    const bytes = await fetchBinary(file.secureUrl, referer);
    await sleep(80);
    return bytes;
  } catch (error) {
    if (!isKakaoDownloadUrlExpired(error)) {
      throw error;
    }

    await sleep(750);
    const refreshedViewerData = await fetchKakaoEpisodeViewerData(
      titleId,
      episode.productId,
    );
    const refreshedFile = refreshedViewerData.files.find(
      (candidate) => candidate.no === file.no,
    );

    if (!refreshedFile) {
      throw error;
    }

    const bytes = await fetchBinary(refreshedFile.secureUrl, referer);
    await sleep(120);
    return bytes;
  }
}

async function writeEpisodeDownloadFiles(
  titleId: number,
  episode: KakaoSeriesEpisode,
  manifest: StoredKakaoEpisodeArchiveManifest,
  viewerData: KakaoEpisodeViewerData,
) {
  if (episode.thumbnailUrl) {
    const thumbnailBytes = await fetchBinary(
      episode.thumbnailUrl,
      `https://page.kakao.com/content/${titleId}/viewer/${episode.productId}`,
    );
    await writeBinaryFile(manifest.storage.thumbnailPath, thumbnailBytes);
  }

  let downloadedImageCount = 0;

  await mapWithConcurrency(
    viewerData.files,
    getImageDownloadConcurrency(),
    async (file) => {
      const extension = getEpisodeImageExtension(file.secureUrl);
      const imagePath = path.join(
        manifest.storage.imagesDir,
        `${String(file.no).padStart(3, "0")}${extension}`,
      );
      const imageBytes = await downloadEpisodeImageBytes(titleId, episode, file);
      await writeBinaryFile(imagePath, imageBytes);
      downloadedImageCount += 1;
    },
  );

  return downloadedImageCount;
}

function canAttemptWaitFreeUnlock(
  overview: KakaoSeriesOverview,
  episode: KakaoSeriesEpisode,
  unlockState: WaitFreeUnlockState,
) {
  if (!unlockState.enabled || episode.isFree) {
    return false;
  }

  if (overview.isPaidOnly) {
    return false;
  }

  const availableTicketTypes = getKakaoUnlockTicketTypes(
    overview.waitfreePeriodByMinute,
  );

  if (
    availableTicketTypes.every((ticketType) =>
      unlockState.unavailableTicketTypes.has(ticketType),
    )
  ) {
    return false;
  }

  return true;
}

async function resolveViewerDataForEpisode(
  titleId: number,
  overview: KakaoSeriesOverview,
  episode: KakaoSeriesEpisode,
  unlockState: WaitFreeUnlockState,
) {
  async function fetchViewerDataWithUnlockRetry() {
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) {
        await sleep(1000 * attempt);
      }

      try {
        return await fetchKakaoEpisodeViewerData(titleId, episode.productId);
      } catch (retryError) {
        lastError = retryError;

        if (!isKakaoEpisodeLocked(retryError)) {
          throw retryError;
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Kakao viewer data was not available after unlock.");
  }

  try {
    return await fetchKakaoEpisodeViewerData(titleId, episode.productId);
  } catch (error) {
    if (!isKakaoEpisodeLocked(error) || !canAttemptWaitFreeUnlock(overview, episode, unlockState)) {
      throw error;
    }

    try {
      const unlockResult = await unlockKakaoEpisodeWithAvailableTickets(
        episode.productId,
        overview.waitfreePeriodByMinute,
        unlockState.unavailableTicketTypes,
      );

      for (const ticketType of unlockResult.exhaustedTicketTypes) {
        unlockState.unavailableTicketTypes.add(ticketType);
      }

      if (unlockResult.status === "unlocked" || unlockResult.status === "already-unlocked") {
        return await fetchViewerDataWithUnlockRetry();
      }
    } catch (unlockError) {
      console.warn(
        "[kakaorr] wait-free unlock failed",
        titleId,
        episode.productId,
        unlockError,
      );
    }

    throw error;
  }
}

async function downloadSeriesPoster(snapshot: KakaoSeriesSnapshot, storagePath: string) {
  if (!snapshot.overview.thumbnailUrl) {
    return;
  }

  const posterBytes = await fetchBinary(
    snapshot.overview.thumbnailUrl,
    `https://page.kakao.com/content/${snapshot.overview.seriesId}`,
  );
  await writeBinaryFile(getStoragePosterPath(storagePath), posterBytes);
}

async function writeStorageSeriesMetadata(
  snapshot: KakaoSeriesSnapshot,
  storagePath: string,
) {
  const payload: StoredSeriesStorageMetadata = {
    savedAt: new Date().toISOString(),
    snapshot,
  };
  await writeJsonFile(getStorageSeriesMetadataPath(storagePath), payload);
  await downloadSeriesPoster(snapshot, storagePath);
}

function countDownloadedFiles(files: KakaoEpisodeViewerData["files"], dirEntries: Awaited<ReturnType<typeof listFilesSafe>>) {
  const entryNames = new Set(dirEntries.map((entry) => entry.name));

  return files.filter((file) => {
    const extension = getEpisodeImageExtension(file.secureUrl);
    const filename = `${String(file.no).padStart(3, "0")}${extension}`;
    return entryNames.has(filename);
  }).length;
}

async function syncEpisodeStorage(
  titleId: number,
  storagePath: string,
  episode: KakaoSeriesEpisode,
  overview: KakaoSeriesOverview,
  unlockState: WaitFreeUnlockState,
) {
  const existingManifest = await readEpisodeArchiveManifest(titleId, episode.order);

  if (existingManifest?.crawl.status === "downloaded") {
    if (!episode.isFree) {
      return existingManifest;
    }

    try {
      const viewerData = await fetchKakaoEpisodeViewerData(titleId, episode.productId);
      const storedImages = await listFilesSafe(existingManifest.storage.imagesDir);
      const downloadedImageCount = countDownloadedFiles(viewerData.files, storedImages);

      if (downloadedImageCount >= viewerData.files.length && viewerData.files.length > 0) {
        return existingManifest;
      }
    } catch {
      return existingManifest;
    }
  }

  const baseManifest = buildEpisodeArchiveManifest(storagePath, titleId, episode, {
    status: "pending",
    imageCount: episode.pageCount ?? 0,
    downloadedImageCount: 0,
    downloadedAt: null,
    errorMessage: null,
  });

  await writeEpisodeArchiveManifest(baseManifest);

  try {
    const viewerData = await resolveViewerDataForEpisode(
      titleId,
      overview,
      episode,
      unlockState,
    );
    const downloadingManifest = buildEpisodeArchiveManifest(storagePath, titleId, episode, {
      status: "downloading",
      imageCount: viewerData.files.length,
      downloadedImageCount: 0,
      downloadedAt: null,
      errorMessage: null,
    });

    await Promise.all([
      rm(downloadingManifest.storage.episodeDir, { recursive: true, force: true }),
      rm(getSeriesEpisodeArchiveDir(titleId, episode.order), {
        recursive: true,
        force: true,
      }),
    ]);
    await ensureDir(downloadingManifest.storage.imagesDir);
    await writeEpisodeArchiveManifest(downloadingManifest);
    const downloadedImageCount = await writeEpisodeDownloadFiles(
      titleId,
      episode,
      downloadingManifest,
      viewerData,
    );

    const downloadedManifest = buildEpisodeArchiveManifest(storagePath, titleId, episode, {
      status: "downloaded",
      imageCount: viewerData.files.length,
      downloadedImageCount,
      downloadedAt: new Date().toISOString(),
      errorMessage: null,
    });

    await writeEpisodeArchiveManifest(downloadedManifest);
    return downloadedManifest;
  } catch (error) {
    if (!episode.isFree && isKakaoEpisodeLocked(error)) {
      const previewManifest = buildEpisodeArchiveManifest(storagePath, titleId, episode, {
        status: "preview",
        imageCount: episode.pageCount ?? 0,
        downloadedImageCount: 0,
        downloadedAt: null,
        errorMessage: null,
      });

      await writeEpisodeArchiveManifest(previewManifest);
      return previewManifest;
    }

    const failedManifest = buildEpisodeArchiveManifest(storagePath, titleId, episode, {
      status: "failed",
      imageCount: episode.pageCount ?? 0,
      downloadedImageCount: 0,
      downloadedAt: null,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    await writeEpisodeArchiveManifest(failedManifest);
    return failedManifest;
  }
}

async function syncSeriesStorage(
  snapshot: KakaoSeriesSnapshot,
  storagePath: string,
): Promise<SeriesStorageStats> {
  await ensureDir(storagePath);
  await writeStorageSeriesMetadata(snapshot, storagePath);

  const manifests: StoredKakaoEpisodeArchiveManifest[] = [];
  const waitFreeUnlockState: WaitFreeUnlockState = {
    enabled: !snapshot.overview.isPaidOnly,
    unavailableTicketTypes: new Set(),
  };

  for (const episode of snapshot.episodes) {
    const manifest = await syncEpisodeStorage(
      snapshot.overview.seriesId,
      storagePath,
      episode,
      snapshot.overview,
      waitFreeUnlockState,
    );
    manifests.push(manifest);
  }

  const availableEpisodes = manifests.filter(
    (manifest) => manifest.episode.isFree || manifest.crawl.status === "downloaded",
  ).length;
  const downloadedEpisodes = manifests.filter(
    (manifest) => manifest.crawl.status === "downloaded",
  ).length;
  const hasActiveDownload = manifests.some(
    (manifest) =>
      manifest.crawl.status === "pending" ||
      manifest.crawl.status === "downloading",
  );
  const failedEpisodes = manifests.filter(
    (manifest) => manifest.crawl.status === "failed",
  ).length;

  return {
    availableEpisodes,
    downloadedEpisodes,
    hasActiveDownload,
    failedEpisodes,
    sizeOnDisk: formatBytes(await calculateDirectorySize(storagePath)),
  };
}

function toLibraryEntry(
  snapshot: KakaoSeriesSnapshot,
  options: {
    rootFolder: string;
    monitorMode: MonitorMode;
    existing?: LibrarySeriesEntry | undefined;
    checkIntervalHours?: number | undefined;
    sizeOnDisk?: string | undefined;
    availableEpisodes?: number | undefined;
    downloadedEpisodes?: number | undefined;
  },
): LibrarySeriesEntry {
  const now = new Date().toISOString();
  const rootFolder = options.rootFolder;
  const storagePath = buildStoragePath(
    rootFolder,
    snapshot.overview.title,
    snapshot.overview.seriesId,
  );
  const availableEpisodes =
    options.availableEpisodes ?? snapshot.freeEpisodes.length;
  const downloadedEpisodes =
    options.downloadedEpisodes ?? options.existing?.downloadedEpisodes ?? 0;
  const isFinished = isFinishedSeries(snapshot);
  const checkIntervalHours = clampCheckIntervalHours(
    options.checkIntervalHours ??
      options.existing?.checkIntervalHours ??
      DEFAULT_CHECK_INTERVAL_HOURS,
  );
  const shouldKeepScheduled = shouldKeepSeriesScheduled({
    isFinished,
    isWaitFree: snapshot.overview.isWaitFree,
    totalEpisodes: snapshot.episodes.length,
    downloadedEpisodes,
  });

  return {
    id: `kakao-${snapshot.overview.seriesId}`,
    titleId: snapshot.overview.seriesId,
    sourceName: "KakaoPage",
    title: snapshot.overview.title,
    authors: snapshot.overview.authors,
    monitored:
      options.monitorMode === "none"
        ? false
        : (options.existing?.monitored ?? true),
    monitorMode: options.monitorMode,
    checkIntervalHours,
    totalEpisodes: snapshot.episodes.length,
    availableEpisodes,
    downloadedEpisodes,
    storagePath,
    rootFolder,
    posterThumbnailUrl: snapshot.overview.thumbnailUrl,
    nextCheck:
      options.monitorMode === "none"
      || !shouldKeepScheduled
        ? "-"
        : computeNextCheck(
            checkIntervalHours,
            snapshot.overview.publishPeriod,
            isFinished,
            snapshot.nextFreeEpisode?.freeAt ?? null,
            snapshot.waitFreeTicket?.nextUnlockAt ?? null,
            snapshot.waitFreeTicket?.availableNow ?? false,
          ),
    lastSeen: snapshot.overview.updatedAt ?? now,
    sizeOnDisk: options.sizeOnDisk ?? options.existing?.sizeOnDisk ?? "0 B",
    tags: [],
    isFinished,
    isWaitFree: snapshot.overview.isWaitFree,
    isOnBreak: false,
    isDailyPass: snapshot.overview.isPaidOnly,
    isAdult: snapshot.overview.isAdult,
    publishDescription: snapshot.overview.publishPeriod,
    addedAt: options.existing?.addedAt ?? now,
    updatedAt: now,
  };
}

function toStoredSeriesSummary(
  entry: LibrarySeriesEntry,
  overrides?: Partial<StoredSeriesSummary>,
): StoredSeriesSummary {
  const availableEpisodes =
    overrides?.availableEpisodes ?? entry.availableEpisodes;
  const downloadedEpisodes =
    overrides?.downloadedEpisodes ?? entry.downloadedEpisodes;

  return {
    id: entry.id,
    titleId: entry.titleId,
    slug: buildSeriesSlug(entry.title, entry.titleId),
    title: entry.title,
    authors: entry.authors,
    posterThumbnailUrl: entry.posterThumbnailUrl,
    sourceName: entry.sourceName,
    monitored: entry.monitored,
    monitorMode: entry.monitorMode,
    checkIntervalHours: entry.checkIntervalHours,
    totalEpisodes: overrides?.totalEpisodes ?? entry.totalEpisodes,
    availableEpisodes,
    downloadedEpisodes,
    missingEpisodes:
      overrides?.missingEpisodes ??
      Math.max(availableEpisodes - downloadedEpisodes, 0),
    hasActiveDownload: overrides?.hasActiveDownload ?? false,
    storagePath: entry.storagePath,
    nextCheck: entry.nextCheck,
    lastSeen: entry.lastSeen,
    sizeOnDisk: overrides?.sizeOnDisk ?? entry.sizeOnDisk,
    tags: entry.tags,
    isFinished: entry.isFinished,
    isWaitFree: entry.isWaitFree,
    isOnBreak: entry.isOnBreak,
    isDailyPass: entry.isDailyPass,
    isAdult: entry.isAdult,
    publishDescription: entry.publishDescription,
    addedAt: entry.addedAt,
    updatedAt: entry.updatedAt,
  };
}

async function readLibraryIndex() {
  return readJsonFile<LibraryIndex>(getLibraryIndexPath(), { items: [] });
}

async function writeLibraryIndex(index: LibraryIndex) {
  await writeJsonFile(getLibraryIndexPath(), index);
}

async function writeSeriesSnapshot(snapshot: KakaoSeriesSnapshot) {
  const payload: StoredSnapshotFile = {
    snapshot,
    savedAt: new Date().toISOString(),
  };
  await writeJsonFile(getSeriesSnapshotPath(snapshot.overview.seriesId), payload);
}

async function readSeriesSnapshot(titleId: number) {
  const payload = await readJsonFile<StoredSnapshotFile | null>(
    getSeriesSnapshotPath(titleId),
    null,
  );

  return payload?.snapshot ?? null;
}

async function refreshSnapshotAfterStorageSync(
  titleId: number,
  fallbackSnapshot: KakaoSeriesSnapshot,
) {
  if (!fallbackSnapshot.overview.isWaitFree) {
    return fallbackSnapshot;
  }

  const refreshedSnapshot = await fetchKakaoSeriesSnapshot(titleId, { locale: "ko" });
  await writeSeriesSnapshot(refreshedSnapshot);
  return refreshedSnapshot;
}

async function writeLibraryEntry(entry: LibrarySeriesEntry) {
  const index = await readLibraryIndex();
  const existingIndex = index.items.findIndex((item) => item.titleId === entry.titleId);

  if (existingIndex >= 0) {
    index.items[existingIndex] = entry;
  } else {
    index.items.unshift(entry);
  }

  await writeLibraryIndex(index);
}

async function getStoredSeriesStats(
  entry: LibrarySeriesEntry,
  snapshot: KakaoSeriesSnapshot | null,
): Promise<SeriesStorageStats> {
  if (!snapshot) {
    return {
      availableEpisodes: entry.availableEpisodes,
      downloadedEpisodes: entry.downloadedEpisodes,
      hasActiveDownload: isQueuedSeries(entry.titleId),
      failedEpisodes: 0,
      sizeOnDisk: entry.sizeOnDisk,
    };
  }

  const manifests = await Promise.all(
    snapshot.episodes.map((episode) => readEpisodeArchiveManifest(entry.titleId, episode.order)),
  );
  const availableEpisodes = manifests.filter(
    (manifest) => manifest?.episode.isFree || manifest?.crawl.status === "downloaded",
  ).length;
  const downloadedEpisodes = manifests.filter(
    (manifest) => manifest?.crawl.status === "downloaded",
  ).length;
  const manifestActive = manifests.some(
    (manifest) =>
      manifest?.crawl.status === "pending" ||
      manifest?.crawl.status === "downloading",
  );
  const failedEpisodes = manifests.filter(
    (manifest) => manifest?.crawl.status === "failed",
  ).length;

  return {
    availableEpisodes,
    downloadedEpisodes,
    hasActiveDownload: manifestActive || isQueuedSeries(entry.titleId),
    failedEpisodes,
    sizeOnDisk: formatBytes(await calculateDirectorySize(entry.storagePath)),
  };
}

async function syncSeries(
  titleId: number,
  options?: Partial<AddSeriesInput> & {
    existing?: LibrarySeriesEntry | undefined;
    trigger?: "series-add" | "series-refresh";
  },
) {
  const snapshot = await fetchKakaoSeriesSnapshot(titleId, { locale: "ko" });
  const existing = options?.existing;
  const rootFolder = await resolveRootFolder(
    options?.rootFolder ?? existing?.rootFolder ?? DEFAULT_LIBRARY_ROOT_FOLDER,
  );
  const storagePath = buildStoragePath(
    rootFolder,
    snapshot.overview.title,
    snapshot.overview.seriesId,
  );

  await ensureDir(storagePath);
  await writeSeriesSnapshot(snapshot);

  const previousEntry =
    existing ??
    (await readLibraryIndex()).items.find(
      (item) => item.titleId === snapshot.overview.seriesId,
    );
  const previousStats = previousEntry
    ? await getStoredSeriesStats(previousEntry, snapshot)
    : {
        availableEpisodes: snapshot.freeEpisodes.length,
        downloadedEpisodes: 0,
        hasActiveDownload: false,
        failedEpisodes: 0,
        sizeOnDisk: formatBytes(await calculateDirectorySize(storagePath)),
      };

  const entry = toLibraryEntry(snapshot, {
    rootFolder,
    monitorMode: options?.monitorMode ?? previousEntry?.monitorMode ?? "all",
    existing: previousEntry,
    checkIntervalHours: previousEntry?.checkIntervalHours,
    sizeOnDisk: previousStats.sizeOnDisk,
    availableEpisodes: previousStats.availableEpisodes,
    downloadedEpisodes: previousStats.downloadedEpisodes,
  });
  await writeLibraryEntry(entry);

  enqueueSeriesStorageSync({
    snapshot,
    rootFolder,
    monitorMode: entry.monitorMode,
    enqueuedAt: new Date().toISOString(),
    trigger: options?.trigger ?? "series-refresh",
  });

  return entry;
}

function enqueueSeriesStorageSync(task: SeriesStorageSyncTask) {
  const queue = getStorageSyncQueue();
  const existingIndex = queue.findIndex(
    (item) => item.snapshot.overview.seriesId === task.snapshot.overview.seriesId,
  );

  if (existingIndex >= 0) {
    queue[existingIndex] = task;
  } else {
    queue.push(task);
  }

  void runSeriesStorageSyncQueue();
}

async function runSeriesStorageSyncQueue() {
  const queue = getStorageSyncQueue();
  const currentRuns = getStorageSyncCurrentRuns();

  while (currentRuns.length < getStorageSyncConcurrency()) {
    const nextTask = queue.shift();

    if (!nextTask) {
      return;
    }

    const startedAt = new Date().toISOString();
    currentRuns.push({
      task: nextTask,
      startedAt,
    });

    void processSeriesStorageSyncTask(nextTask, startedAt);
  }
}

async function processSeriesStorageSyncTask(
  nextTask: SeriesStorageSyncTask,
  startedAt: string,
) {
  try {
    const index = await readLibraryIndex();
    const existing = index.items.find(
      (item) => item.titleId === nextTask.snapshot.overview.seriesId,
    );
    const storagePath = buildStoragePath(
      nextTask.rootFolder,
      nextTask.snapshot.overview.title,
      nextTask.snapshot.overview.seriesId,
    );
    const storageSync = await syncSeriesStorage(nextTask.snapshot, storagePath);
    const latestSnapshot = await refreshSnapshotAfterStorageSync(
      nextTask.snapshot.overview.seriesId,
      nextTask.snapshot,
    );
    const entry = toLibraryEntry(latestSnapshot, {
      rootFolder: nextTask.rootFolder,
      monitorMode: nextTask.monitorMode,
      existing,
      checkIntervalHours: existing?.checkIntervalHours,
      availableEpisodes: storageSync.availableEpisodes,
      downloadedEpisodes: storageSync.downloadedEpisodes,
      sizeOnDisk: storageSync.sizeOnDisk,
    });

    await writeLibraryEntry(entry);
    appendRecentJob({
      id: `storage-job-${entry.titleId}-${Date.now()}`,
      name: entry.title,
      trigger: nextTask.trigger,
      status: storageSync.failedEpisodes > 0 ? "warning" : "success",
      itemsProcessed: storageSync.downloadedEpisodes,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    appendRecentJob({
      id: `storage-job-${nextTask.snapshot.overview.seriesId}-${Date.now()}`,
      name: nextTask.snapshot.overview.title,
      trigger: nextTask.trigger,
      status: "failed",
      itemsProcessed: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    console.error("[kakaorr] series storage sync failed", error);
  } finally {
    globalThis.__kakaorrStorageSyncCurrentRuns = getStorageSyncCurrentRuns().filter(
      (run) => run.task.snapshot.overview.seriesId !== nextTask.snapshot.overview.seriesId,
    );
    void runSeriesStorageSyncQueue();
  }
}

export async function getStoredSeriesSummaries(): Promise<StoredSeriesSummary[]> {
  const index = await readLibraryIndex();
  const entries = index.items.slice();

  const summaries = await Promise.all(
    entries.map(async (entry) => {
      const snapshot = await readSeriesSnapshot(entry.titleId);
      const stats = await getStoredSeriesStats(entry, snapshot);

      return toStoredSeriesSummary(entry, {
        totalEpisodes: snapshot?.episodes.length ?? entry.totalEpisodes,
        availableEpisodes: stats.availableEpisodes,
        downloadedEpisodes: stats.downloadedEpisodes,
        missingEpisodes: Math.max(
          stats.availableEpisodes - stats.downloadedEpisodes,
          0,
        ),
        hasActiveDownload: stats.hasActiveDownload,
        sizeOnDisk: stats.sizeOnDisk,
      });
    }),
  );

  return summaries;
}

export async function getStoredSeriesDetail(
  slug: string,
): Promise<StoredSeriesDetail | null> {
  const titleId = extractTitleIdFromSlug(slug);

  if (!titleId) {
    return null;
  }

  const index = await readLibraryIndex();
  const entry = index.items.find((item) => item.titleId === titleId);

  if (!entry) {
    return null;
  }

  const snapshot = await readSeriesSnapshot(titleId);

  if (!snapshot) {
    return null;
  }

  const manifests = await Promise.all(
    snapshot.episodes.map((episode) => readEpisodeArchiveManifest(titleId, episode.order)),
  );
  const episodeArchives = Object.fromEntries(
    snapshot.episodes.map((episode, index) => [episode.order, manifests[index] ?? null]),
  ) as Record<number, StoredKakaoEpisodeArchiveManifest | null>;
  const stats = await getStoredSeriesStats(entry, snapshot);

  return {
    summary: toStoredSeriesSummary(entry, {
      totalEpisodes: snapshot.episodes.length,
      availableEpisodes: stats.availableEpisodes,
      downloadedEpisodes: stats.downloadedEpisodes,
      missingEpisodes: Math.max(
        stats.availableEpisodes - stats.downloadedEpisodes,
        0,
      ),
      hasActiveDownload: stats.hasActiveDownload,
      sizeOnDisk: stats.sizeOnDisk,
    }),
    overview: snapshot.overview,
    episodes: snapshot.episodes,
    freeEpisodes: snapshot.freeEpisodes,
    lockedEpisodes: snapshot.lockedEpisodes,
    nextFreeEpisode: snapshot.nextFreeEpisode,
    waitFreeTicket: snapshot.waitFreeTicket,
    episodeArchives,
  };
}

export async function addSeriesToLibrary(input: AddSeriesInput) {
  const index = await readLibraryIndex();
  const existing = index.items.find((item) => item.titleId === input.titleId);

  return syncSeries(input.titleId, {
    rootFolder: input.rootFolder,
    monitorMode: input.monitorMode,
    existing,
    trigger: "series-add",
  });
}

export async function refreshSeriesInLibrary(titleId: number) {
  const index = await readLibraryIndex();
  const existing = index.items.find((item) => item.titleId === titleId);

  if (!existing) {
    throw new Error(`Series ${titleId} is not in the library.`);
  }

  return syncSeries(titleId, {
    rootFolder: existing.rootFolder,
    monitorMode: existing.monitorMode,
    existing,
    trigger: "series-refresh",
  });
}

export async function retrySeriesEpisodeInLibrary(titleId: number, order: number) {
  const index = await readLibraryIndex();
  const existing = index.items.find((item) => item.titleId === titleId);

  if (!existing) {
    throw new Error(`Series ${titleId} is not in the library.`);
  }

  const snapshot = await fetchKakaoSeriesSnapshot(titleId, { locale: "ko" });
  const rootFolder = await resolveRootFolder(existing.rootFolder);
  const storagePath = buildStoragePath(
    rootFolder,
    snapshot.overview.title,
    snapshot.overview.seriesId,
  );
  const episode = snapshot.episodes.find((item) => item.order === order);

  if (!episode) {
    throw new Error(`Episode ${order} is not available in series ${titleId}.`);
  }

  await writeSeriesSnapshot(snapshot);
  await syncEpisodeStorage(titleId, storagePath, episode, snapshot.overview, {
    enabled: !snapshot.overview.isPaidOnly,
    unavailableTicketTypes: new Set(),
  });
  const latestSnapshot = await refreshSnapshotAfterStorageSync(titleId, snapshot);

  const stats = await getStoredSeriesStats(existing, latestSnapshot);
  const updatedEntry = toLibraryEntry(latestSnapshot, {
    rootFolder,
    monitorMode: existing.monitorMode,
    existing,
    checkIntervalHours: existing.checkIntervalHours,
    availableEpisodes: stats.availableEpisodes,
    downloadedEpisodes: stats.downloadedEpisodes,
    sizeOnDisk: stats.sizeOnDisk,
  });
  await writeLibraryEntry(updatedEntry);
  return updatedEntry;
}

export async function deleteSeriesEpisodeInLibrary(titleId: number, order: number) {
  const index = await readLibraryIndex();
  const existing = index.items.find((item) => item.titleId === titleId);

  if (!existing) {
    throw new Error(`Series ${titleId} is not in the library.`);
  }

  const snapshot = await fetchKakaoSeriesSnapshot(titleId, { locale: "ko" });
  const rootFolder = await resolveRootFolder(existing.rootFolder);
  const storagePath = buildStoragePath(
    rootFolder,
    snapshot.overview.title,
    snapshot.overview.seriesId,
  );
  const episode = snapshot.episodes.find((item) => item.order === order);

  if (!episode) {
    throw new Error(`Episode ${order} is not available in series ${titleId}.`);
  }

  await Promise.all([
    rm(getSeriesEpisodeArchiveDir(titleId, order), { recursive: true, force: true }),
    rm(getStorageEpisodeDir(storagePath, order), { recursive: true, force: true }),
  ]);

  await writeSeriesSnapshot(snapshot);

  const stats = await getStoredSeriesStats(existing, snapshot);
  const updatedEntry = toLibraryEntry(snapshot, {
    rootFolder,
    monitorMode: existing.monitorMode,
    existing,
    checkIntervalHours: existing.checkIntervalHours,
    availableEpisodes: stats.availableEpisodes,
    downloadedEpisodes: stats.downloadedEpisodes,
    sizeOnDisk: stats.sizeOnDisk,
  });
  await writeLibraryEntry(updatedEntry);
  return updatedEntry;
}

export async function refreshAllStoredSeries() {
  const index = await readLibraryIndex();
  const now = Date.now();
  const eligibleItems = index.items.filter((item) => {
    if (
      !item.monitored ||
      (item.isFinished && (!item.isWaitFree || item.downloadedEpisodes >= item.totalEpisodes))
    ) {
      return false;
    }

    if (item.nextCheck !== "-") {
      const nextCheck = Date.parse(item.nextCheck);

      if (Number.isFinite(nextCheck) && nextCheck > now) {
        return false;
      }
    }

    return true;
  });

  return mapWithConcurrency(
    eligibleItems,
    getStorageSyncConcurrency(),
    async (item) => refreshSeriesInLibrary(item.titleId),
  );
}

export async function forceRefreshAllStoredSeries() {
  const index = await readLibraryIndex();
  return mapWithConcurrency(
    index.items,
    getStorageSyncConcurrency(),
    async (item) => refreshSeriesInLibrary(item.titleId),
  );
}

export async function unmonitorSeriesInLibrary(titleId: number) {
  const index = await readLibraryIndex();
  const existingIndex = index.items.findIndex((item) => item.titleId === titleId);

  if (existingIndex < 0) {
    throw new Error(`Series ${titleId} is not in the library.`);
  }

  const existing = index.items[existingIndex];
  const updatedEntry: LibrarySeriesEntry = {
    ...existing,
    monitored: false,
    monitorMode: "none",
    nextCheck: "-",
    updatedAt: new Date().toISOString(),
  };

  index.items[existingIndex] = updatedEntry;
  await writeLibraryIndex(index);
  return updatedEntry;
}

export async function deleteSeriesFromLibrary(titleId: number) {
  const index = await readLibraryIndex();
  const existingIndex = index.items.findIndex((item) => item.titleId === titleId);

  if (existingIndex < 0) {
    throw new Error(`Series ${titleId} is not in the library.`);
  }

  const existing = index.items[existingIndex];
  index.items.splice(existingIndex, 1);
  await writeLibraryIndex(index);

  globalThis.__kakaorrStorageSyncQueue = getStorageSyncQueue().filter(
    (task) => task.snapshot.overview.seriesId !== titleId,
  );

  await Promise.all([
    rm(getKakaoSeriesDir(titleId), { recursive: true, force: true }),
    rm(existing.storagePath, { recursive: true, force: true }),
  ]);

  return existing;
}

export async function updateSeriesSettings(input: UpdateSeriesSettingsInput) {
  const index = await readLibraryIndex();
  const existingIndex = index.items.findIndex((item) => item.titleId === input.titleId);

  if (existingIndex < 0) {
    throw new Error(`Series ${input.titleId} is not in the library.`);
  }

  const existing = index.items[existingIndex];
  const snapshot = await readSeriesSnapshot(input.titleId);
  const checkIntervalHours = clampCheckIntervalHours(input.checkIntervalHours);
  const shouldKeepScheduled =
    snapshot
      ? shouldKeepSeriesScheduled({
          isFinished: existing.isFinished,
          isWaitFree: snapshot.overview.isWaitFree,
          totalEpisodes: snapshot.episodes.length,
          downloadedEpisodes: existing.downloadedEpisodes,
        })
      : !existing.isFinished;
  const updatedEntry: LibrarySeriesEntry = {
    ...existing,
    checkIntervalHours,
    nextCheck:
      existing.monitored && shouldKeepScheduled
        ? computeNextCheck(
            checkIntervalHours,
            existing.publishDescription,
            existing.isFinished,
            snapshot?.nextFreeEpisode?.freeAt ?? null,
            snapshot?.waitFreeTicket?.nextUnlockAt ?? null,
            snapshot?.waitFreeTicket?.availableNow ?? false,
          )
        : "-",
    updatedAt: new Date().toISOString(),
  };

  index.items[existingIndex] = updatedEntry;
  await writeLibraryIndex(index);
  return updatedEntry;
}

export function getSeriesStorageSyncActivityTasks(): ActivityTask[] {
  const tasks: ActivityTask[] = [];
  for (const activeRun of getStorageSyncCurrentRuns()) {
    tasks.push({
      id: `storage-running-${activeRun.task.snapshot.overview.seriesId}`,
      name: activeRun.task.snapshot.overview.title,
      sourceName: "KakaoPage",
      status: "running",
      queue: activeRun.task.trigger,
      startedAt: activeRun.startedAt,
      eta: "-",
    });
  }

  for (const task of getStorageSyncQueue()) {
    tasks.push({
      id: `storage-queued-${task.snapshot.overview.seriesId}`,
      name: task.snapshot.overview.title,
      sourceName: "KakaoPage",
      status: "queued",
      queue: task.trigger,
      startedAt: task.enqueuedAt,
      eta: "-",
    });
  }

  return tasks;
}

export function getSeriesStorageSyncRecentJobs() {
  return [...getRecentJobsState()];
}
