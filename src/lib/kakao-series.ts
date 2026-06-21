import {
  buildKakaoImageUrl,
  fetchKakao,
  fetchKakaoJson,
  isKakaoPaidOnlyContent,
  resolveKakaoAccessLabel,
} from "@/lib/kakao-request";
import type { Locale } from "@/lib/locale";

type RawKakaoSeriesContent = {
  series_id?: number;
  title?: string;
  thumbnail?: string;
  category?: string;
  sub_category?: string;
  is_all_free?: boolean;
  is_waitfree?: boolean;
  age_grade?: number;
  state?: string;
  on_issue?: string;
  series_type?: string;
  business_model?: string;
  authors?: string;
  description?: string;
  pub_period?: string;
  free_slide_count?: number;
  last_slide_added_dt?: string;
  start_sale_dt?: string;
  waitfree_block_count?: number;
  waitfree_period_by_minute?: number;
  sale_method?: string;
  publisher_uid?: number;
  on_sale_count?: number;
  talk_viewer_type?: string;
  first_product_id?: number;
  per_price_type?: string;
  lang?: string;
  id?: number;
};

type RawKakaoProductItem = {
  product_id?: number;
  title?: string;
  thumbnail?: string;
  is_free?: boolean;
  age_grade?: number;
  state?: string;
  slide_type?: string;
  last_release_dt?: string;
  size?: number;
  page_count?: number;
  hidden?: boolean;
  free_change_dt?: string;
  start_sale_dt?: string;
  order_value?: number;
  version?: string;
  waitfree_blocked?: boolean;
  sale_state?: string;
  read_access_type?: string;
};

type RawKakaoOverviewResponse = {
  result?: {
    content?: RawKakaoSeriesContent;
  };
};

type RawKakaoProductPageEntry = {
  cursor_index?: number;
  item?: RawKakaoProductItem;
};

type RawKakaoProductListResponse = {
  result?: {
    series_item?: RawKakaoSeriesContent;
    total_count?: number;
    has_next?: boolean;
    has_prev?: boolean;
    list?: RawKakaoProductPageEntry[];
  };
};

export type KakaoSeriesOverview = {
  seriesId: number;
  title: string;
  authors: string;
  description: string;
  thumbnailUrl: string;
  category: string;
  genre: string;
  publishPeriod: string;
  freeCount: number;
  totalCount: number;
  firstProductId: number | null;
  businessModel: string;
  waitfreePeriodByMinute: number | null;
  isAllFree: boolean;
  isWaitFree: boolean;
  isAdult: boolean;
  isPaidOnly: boolean;
  accessLabel: string;
  state: string;
  onIssue: string;
  saleMethod: string;
  talkViewerType: string;
  perPriceType: string;
  startedAt: string | null;
  updatedAt: string | null;
};

export type KakaoSeriesEpisode = {
  productId: number;
  order: number;
  title: string;
  thumbnailUrl: string;
  isFree: boolean;
  isAdult: boolean;
  pageCount: number | null;
  size: number | null;
  freeAt: string | null;
  releasedAt: string | null;
  startedAt: string | null;
  state: string;
  slideType: string;
  saleState: string;
  readAccessType: string;
  hidden: boolean;
  waitfreeBlocked: boolean;
  cursorIndex: number | null;
};

export type KakaoSeriesSnapshot = {
  overview: KakaoSeriesOverview;
  episodes: KakaoSeriesEpisode[];
  firstEpisode: KakaoSeriesEpisode | null;
  latestEpisode: KakaoSeriesEpisode | null;
  freeEpisodes: KakaoSeriesEpisode[];
  lockedEpisodes: KakaoSeriesEpisode[];
  nextFreeEpisode: KakaoSeriesEpisode | null;
  waitFreeTicket: KakaoWaitFreeTicketStatus | null;
};

type RawKakaoViewerDataImageFile = {
  no?: number;
  size?: number;
  secureUrl?: string;
  width?: number;
  height?: number;
};

type RawKakaoViewerDataImageDownloadData = {
  viewDirection?: string;
  gapBetweenImages?: boolean;
  readType?: string;
  files?: RawKakaoViewerDataImageFile[];
  totalCount?: number;
  totalSize?: number;
};

type RawKakaoViewerDataResponse = {
  result_code?: number;
  response_time?: string;
  message?: string;
  message_key?: string;
  viewerData?: {
    imageDownloadData?: RawKakaoViewerDataImageDownloadData;
  };
  item?: {
    isFree?: boolean;
    remainText?: string;
    title?: string;
  };
};

type RawKakaoTicketUseResponse = {
  result_code?: number;
  response_time?: string;
  message?: string;
  message_key?: string;
};

type RawKakaoWaitFreeTicketResponse = {
  result?: {
    waitfree?: {
      charged_complete?: boolean;
      user_activation?: boolean;
      charged_at?: string;
      charged_period_by_minute?: number;
    };
    my?: {
      ticket_own_count?: number;
      ticket_rental_count?: number;
      cash_amount?: number;
    };
  };
  result_code?: number;
  response_time?: string;
  message?: string;
  message_key?: string;
};

export type KakaoEpisodeViewerImageFile = {
  no: number;
  size: number;
  secureUrl: string;
  width: number | null;
  height: number | null;
};

export type KakaoEpisodeViewerData = {
  viewDirection: string;
  gapBetweenImages: boolean;
  readType: string;
  files: KakaoEpisodeViewerImageFile[];
  totalCount: number;
  totalSize: number;
};

export type KakaoWaitFreeTicketStatus = {
  chargedComplete: boolean;
  userActivation: boolean;
  chargedAt: string | null;
  chargedPeriodByMinute: number | null;
  ticketOwnCount: number;
  ticketRentalCount: number;
  availableNow: boolean;
  nextUnlockAt: string | null;
};

export type KakaoWaitFreeUnlockResult =
  | {
      status: "unlocked";
      message: string | null;
      ticketType: KakaoTicketType;
      exhaustedTicketTypes: KakaoTicketType[];
    }
  | {
      status: "already-unlocked";
      message: string | null;
      ticketType: KakaoTicketType;
      exhaustedTicketTypes: KakaoTicketType[];
    }
  | {
      status: "unavailable";
      message: string | null;
      ticketType: KakaoTicketType | null;
      exhaustedTicketTypes: KakaoTicketType[];
    };

export type KakaoTicketType = "RT03" | "RT05" | "RT06";

type KakaoUnlockTicketTypeOptions = {
  businessModel?: string | null;
  waitfreePeriodByMinute: number | null;
};

export function getKakaoUnlockTicketTypes({
  businessModel,
  waitfreePeriodByMinute,
}: KakaoUnlockTicketTypeOptions) {
  if (businessModel === "M") {
    if (waitfreePeriodByMinute === 2880) {
      return ["RT05", "RT03"] satisfies KakaoTicketType[];
    }

    if (waitfreePeriodByMinute === 1440) {
      return ["RT05", "RT06"] satisfies KakaoTicketType[];
    }

    return ["RT05"] satisfies KakaoTicketType[];
  }

  if (waitfreePeriodByMinute === 2880) {
    return ["RT03", "RT05"] satisfies KakaoTicketType[];
  }

  if (waitfreePeriodByMinute === 1440) {
    return ["RT06", "RT05"] satisfies KakaoTicketType[];
  }

  return ["RT05"] satisfies KakaoTicketType[];
}

type FetchKakaoSeriesSnapshotOptions = {
  locale?: Locale;
  windowSize?: number;
};

const DEFAULT_WINDOW_SIZE = 30;
const MAX_PRODUCT_PAGES = 200;

function toSeriesOverview(
  item: RawKakaoSeriesContent,
  locale: Locale,
): KakaoSeriesOverview {
  const isAllFree = item.is_all_free ?? false;
  const isWaitFree = item.is_waitfree ?? false;
  const freeSlideCount = item.free_slide_count ?? 0;

  return {
    seriesId: item.series_id ?? item.id ?? 0,
    title: item.title ?? "",
    authors: item.authors ?? "",
    description: item.description ?? "",
    thumbnailUrl: buildKakaoImageUrl(item.thumbnail),
    category: item.category ?? "",
    genre: item.sub_category ?? item.category ?? "",
    publishPeriod: item.pub_period ?? "",
    freeCount: freeSlideCount,
    totalCount: item.on_sale_count ?? 0,
    firstProductId:
      typeof item.first_product_id === "number" ? item.first_product_id : null,
    businessModel: item.business_model ?? "",
    waitfreePeriodByMinute:
      typeof item.waitfree_period_by_minute === "number"
        ? item.waitfree_period_by_minute
        : null,
    isAllFree,
    isWaitFree,
    isAdult: (item.age_grade ?? 0) >= 19,
    isPaidOnly: isKakaoPaidOnlyContent({
      isAllFree,
      isWaitFree,
      businessModel: item.business_model,
      waitfreePeriodByMinute: item.waitfree_period_by_minute,
      freeSlideCount,
    }),
    accessLabel: resolveKakaoAccessLabel(
      {
        isAllFree,
        isWaitFree,
        businessModel: item.business_model,
        waitfreePeriodByMinute: item.waitfree_period_by_minute,
        freeSlideCount,
      },
      locale,
    ),
    state: item.state ?? "",
    onIssue: item.on_issue ?? "",
    saleMethod: item.sale_method ?? "",
    talkViewerType: item.talk_viewer_type ?? "",
    perPriceType: item.per_price_type ?? "",
    startedAt: item.start_sale_dt ?? null,
    updatedAt: item.last_slide_added_dt ?? null,
  };
}

function toSeriesEpisode(entry: RawKakaoProductPageEntry): KakaoSeriesEpisode | null {
  const item = entry.item;

  if (
    !item ||
    typeof item.product_id !== "number" ||
    typeof item.order_value !== "number"
  ) {
    return null;
  }

  return {
    productId: item.product_id,
    order: item.order_value,
    title: item.title ?? "",
    thumbnailUrl: buildKakaoImageUrl(item.thumbnail),
    isFree: item.is_free ?? false,
    isAdult: (item.age_grade ?? 0) >= 19,
    pageCount: typeof item.page_count === "number" ? item.page_count : null,
    size: typeof item.size === "number" ? item.size : null,
    freeAt:
      item.free_change_dt && !item.free_change_dt.startsWith("1980-01-01")
        ? item.free_change_dt
        : null,
    releasedAt: item.last_release_dt ?? null,
    startedAt: item.start_sale_dt ?? null,
    state: item.state ?? "",
    slideType: item.slide_type ?? "",
    saleState: item.sale_state ?? "",
    readAccessType: item.read_access_type ?? "",
    hidden: item.hidden ?? false,
    waitfreeBlocked: item.waitfree_blocked ?? false,
    cursorIndex:
      typeof entry.cursor_index === "number" ? entry.cursor_index : null,
  };
}

function sortEpisodesAscending(episodes: KakaoSeriesEpisode[]) {
  return [...episodes].sort((left, right) => left.order - right.order);
}

export function getNextKakaoFreeEpisode(episodes: KakaoSeriesEpisode[]) {
  const now = Date.now();

  return (
    episodes
      .filter((episode) => {
        if (episode.isFree || !episode.freeAt) {
          return false;
        }

        const freeAtTime = new Date(episode.freeAt).getTime();
        return Number.isFinite(freeAtTime) && freeAtTime > now;
      })
      .sort((left, right) => {
        return (
          new Date(left.freeAt ?? "").getTime() -
          new Date(right.freeAt ?? "").getTime()
        );
      })[0] ?? null
  );
}

export async function fetchKakaoSeriesOverview(
  seriesId: number,
  locale: Locale = "ko",
) {
  const data = await fetchKakaoJson<RawKakaoOverviewResponse>(
    `https://bff-page.kakao.com/api/gateway/api/v1/content/overview?series_id=${seriesId}`,
  );

  const content = data.result?.content;

  if (!content || typeof content.series_id !== "number") {
    throw new Error(`Kakao series ${seriesId} overview not found.`);
  }

  return toSeriesOverview(content, locale);
}

export async function fetchKakaoSeriesProductPage(
  seriesId: number,
  cursorIndex: number,
  windowSize: number = DEFAULT_WINDOW_SIZE,
) {
  return fetchKakaoJson<RawKakaoProductListResponse>(
    "https://bff-page.kakao.com/api/gateway/api/v2/content/product/list?" +
      new URLSearchParams({
        series_id: String(seriesId),
        cursor_index: String(cursorIndex),
        cursor_direction: "NEXT",
        window_size: String(windowSize),
      }).toString(),
  );
}

export async function fetchAllKakaoSeriesEpisodes(
  seriesId: number,
  windowSize: number = DEFAULT_WINDOW_SIZE,
) {
  const episodes: KakaoSeriesEpisode[] = [];
  const seenOrders = new Set<number>();
  let cursorIndex = 0;

  for (let page = 0; page < MAX_PRODUCT_PAGES; page += 1) {
    const data = await fetchKakaoSeriesProductPage(seriesId, cursorIndex, windowSize);
    const entries = data.result?.list ?? [];

    for (const entry of entries) {
      const episode = toSeriesEpisode(entry);

      if (!episode || seenOrders.has(episode.order)) {
        continue;
      }

      seenOrders.add(episode.order);
      episodes.push(episode);
    }

    if (!(data.result?.has_next ?? false) || entries.length === 0) {
      break;
    }

    const lastCursorIndex = entries.at(-1)?.cursor_index;

    if (typeof lastCursorIndex !== "number" || lastCursorIndex <= cursorIndex) {
      break;
    }

    cursorIndex = lastCursorIndex;
  }

  return sortEpisodesAscending(episodes);
}

export async function fetchKakaoSeriesSnapshot(
  seriesId: number,
  options: FetchKakaoSeriesSnapshotOptions = {},
): Promise<KakaoSeriesSnapshot> {
  const locale = options.locale ?? "ko";
  const windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE;
  const [overview, episodes] = await Promise.all([
    fetchKakaoSeriesOverview(seriesId, locale),
    fetchAllKakaoSeriesEpisodes(seriesId, windowSize),
  ]);
  const freeEpisodes = episodes.filter((episode) => episode.isFree);
  const lockedEpisodes = episodes.filter((episode) => !episode.isFree);
  const waitFreeTicket = overview.isWaitFree
    ? await fetchKakaoWaitFreeTicketStatus(seriesId).catch(() => null)
    : null;

  return {
    overview,
    episodes,
    firstEpisode: episodes[0] ?? null,
    latestEpisode: episodes.at(-1) ?? null,
    freeEpisodes,
    lockedEpisodes,
    nextFreeEpisode: getNextKakaoFreeEpisode(episodes),
    waitFreeTicket,
  };
}

export async function fetchKakaoEpisodeViewerData(
  seriesId: number,
  productId: number,
): Promise<KakaoEpisodeViewerData> {
  const response = await fetchKakaoJson<RawKakaoViewerDataResponse>(
    "https://bff-page.kakao.com/api/gateway/api/v1/viewer/data?" +
      new URLSearchParams({
        series_id: String(seriesId),
        product_id: String(productId),
      }).toString(),
    {
      headers: {
        referer: `https://page.kakao.com/content/${seriesId}/viewer/${productId}`,
      },
    },
  );
  const imageDownloadData = response.viewerData?.imageDownloadData;

  if (!imageDownloadData) {
    const message = response.message?.trim();

    if (message) {
      throw new Error(message);
    }

    throw new Error(`Kakao viewer data for episode ${productId} is not available.`);
  }

  const files = (imageDownloadData.files ?? [])
    .filter(
      (file) =>
        typeof file.no === "number" &&
        typeof file.secureUrl === "string" &&
        file.secureUrl.length > 0,
    )
    .map((file) => ({
      no: file.no as number,
      size: typeof file.size === "number" ? file.size : 0,
      secureUrl: file.secureUrl as string,
      width: typeof file.width === "number" ? file.width : null,
      height: typeof file.height === "number" ? file.height : null,
    }));

  return {
    viewDirection: imageDownloadData.viewDirection ?? "Forward",
    gapBetweenImages: imageDownloadData.gapBetweenImages ?? false,
    readType: imageDownloadData.readType ?? "Scroll",
    files,
    totalCount:
      typeof imageDownloadData.totalCount === "number"
        ? imageDownloadData.totalCount
        : files.length,
    totalSize:
      typeof imageDownloadData.totalSize === "number"
        ? imageDownloadData.totalSize
        : files.reduce((sum, file) => sum + file.size, 0),
  };
}

async function unlockKakaoEpisodeWithTicket(
  productId: number,
  ticketType: KakaoTicketType,
): Promise<KakaoWaitFreeUnlockResult> {
  const response = await fetchKakao(
    "https://bff-page.kakao.com/api/gateway/api/v1/ticket/use",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        referer: "https://page.kakao.com/",
      },
      body: new URLSearchParams({
        product_id: String(productId),
        ticket_type: ticketType,
      }).toString(),
    },
  );
  const payload = (await response.json()) as RawKakaoTicketUseResponse;
  const message = payload.message?.trim() || null;

  if (payload.result_code === 0) {
    return {
      status: "unlocked",
      message,
      ticketType,
      exhaustedTicketTypes: [],
    };
  }

  if (message?.includes("이미 구입한 항목입니다")) {
    return {
      status: "already-unlocked",
      message,
      ticketType,
      exhaustedTicketTypes: [],
    };
  }

  return {
    status: "unavailable",
    message,
    ticketType,
    exhaustedTicketTypes: [ticketType],
  };
}

export async function unlockKakaoEpisodeWithAvailableTickets(
  productId: number,
  businessModel: string | null,
  waitfreePeriodByMinute: number | null,
  unavailableTicketTypes: ReadonlySet<KakaoTicketType> = new Set(),
): Promise<KakaoWaitFreeUnlockResult> {
  const exhaustedTicketTypes: KakaoTicketType[] = [];

  for (const ticketType of getKakaoUnlockTicketTypes({
    businessModel,
    waitfreePeriodByMinute,
  })) {
    if (unavailableTicketTypes.has(ticketType)) {
      continue;
    }

    const result = await unlockKakaoEpisodeWithTicket(productId, ticketType);

    if (result.status !== "unavailable") {
      return {
        ...result,
        exhaustedTicketTypes,
      };
    }

    exhaustedTicketTypes.push(ticketType);
  }

  return {
    status: "unavailable",
    message: null,
    ticketType: null,
    exhaustedTicketTypes,
  };
}

export async function fetchKakaoWaitFreeTicketStatus(
  seriesId: number,
): Promise<KakaoWaitFreeTicketStatus | null> {
  const payload = await fetchKakaoJson<RawKakaoWaitFreeTicketResponse>(
    "https://bff-page.kakao.com/api/gateway/api/v1/ticket/my?" +
      new URLSearchParams({
        series_id: String(seriesId),
        include_waitfree: "true",
      }).toString(),
  );
  const waitfree = payload.result?.waitfree;

  if (!waitfree) {
    return null;
  }

  const chargedAt =
    typeof waitfree.charged_at === "string" && waitfree.charged_at.length > 0
      ? waitfree.charged_at
      : null;
  const userActivation = waitfree.user_activation ?? false;
  const chargedComplete = waitfree.charged_complete ?? false;
  const ticketOwnCount = Math.max(0, payload.result?.my?.ticket_own_count ?? 0);
  const ticketRentalCount = Math.max(0, payload.result?.my?.ticket_rental_count ?? 0);
  const hasImmediateTicket = ticketOwnCount > 0 || ticketRentalCount > 0;
  const availableNow = (userActivation && chargedComplete) || hasImmediateTicket;

  return {
    chargedComplete,
    userActivation,
    chargedAt,
    chargedPeriodByMinute:
      typeof waitfree.charged_period_by_minute === "number"
        ? waitfree.charged_period_by_minute
        : null,
    ticketOwnCount,
    ticketRentalCount,
    availableNow,
    nextUnlockAt: availableNow ? new Date().toISOString() : chargedAt,
  };
}
