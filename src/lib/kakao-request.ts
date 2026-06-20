import {
  getKakaoSessionCookieHeader,
  mergeKakaoSessionSetCookieLines,
} from "@/lib/kakao-session";

const KAKAO_HEADERS = {
  accept: "application/json, text/plain, */*",
  origin: "https://page.kakao.com",
  referer: "https://page.kakao.com/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
} as const;

function shouldAttachKakaoCookie(url: string) {
  const hostname = new URL(url).hostname;

  return (
    hostname === "page.kakao.com" ||
    hostname === "bff-page.kakao.com" ||
    hostname === "page-edge.kakao.com"
  );
}

function withDefaultHeaders(
  url: string,
  headers: HeadersInit | undefined,
  cookieHeader: string | null,
) {
  const merged = new Headers({
    ...KAKAO_HEADERS,
    ...(headers ?? {}),
  });

  if (cookieHeader && shouldAttachKakaoCookie(url) && !merged.has("cookie")) {
    merged.set("cookie", cookieHeader);
  }

  return merged;
}

async function performKakaoFetch(
  url: string,
  init: RequestInit | undefined,
  cookieHeader: string | null,
) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: withDefaultHeaders(url, init?.headers, cookieHeader),
  });

  if (shouldAttachKakaoCookie(url)) {
    const setCookieLines =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : response.headers.get("set-cookie")?.split(/\r?\n/) ?? [];

    await mergeKakaoSessionSetCookieLines(setCookieLines).catch(() => undefined);
  }

  return response;
}

async function buildKakaoResponseError(response: Response, url: string) {
  const text = await response.text().catch(() => "");

  if (
    response.url.includes("accounts.kakao.com") ||
    text.includes("카카오계정") ||
    text.includes("로그인 후 이용해 주세요")
  ) {
    return new Error(
      "KakaoPage login session is required or adult verification is not complete.",
    );
  }

  return new Error(`Kakao request failed: ${response.status} ${url}`);
}

export async function fetchKakao(url: string, init?: RequestInit) {
  const cookieHeader = await getKakaoSessionCookieHeader();
  const response = await performKakaoFetch(url, init, cookieHeader);

  if (!response.ok) {
    throw await buildKakaoResponseError(response, url);
  }

  return response;
}

export async function fetchKakaoJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchKakao(url, init);
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");

    if (
      response.url.includes("accounts.kakao.com") ||
      text.includes("카카오계정") ||
      text.includes("로그인 후 이용해 주세요")
    ) {
      throw new Error(
        "KakaoPage login session is required or adult verification is not complete.",
      );
    }

    throw new Error(`Kakao JSON response was not returned: ${url}`);
  }

  return (await response.json()) as T;
}

export function buildKakaoImageUrl(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return `https://dn-img-page.kakao.com/download/resource?kid=${value}`;
}

export function buildKakaoClientImageUrl(url: string | null | undefined) {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);

    if (
      parsed.protocol === "https:" &&
      (parsed.hostname === "dn-img-page.kakao.com" ||
        parsed.hostname === "page-edge.kakao.com")
    ) {
      return `/api/image/kakao?url=${encodeURIComponent(url)}`;
    }
  } catch {
    return url;
  }

  return url;
}

export function formatKakaoDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

type KakaoAccessLabelInput = {
  isAllFree?: boolean | null;
  isWaitFree?: boolean | null;
  businessModel?: string | null;
  waitfreePeriodByMinute?: number | null;
  freeSlideCount?: number | null;
};

export function isKakaoPaidOnlyContent(item: KakaoAccessLabelInput) {
  if (item.isAllFree || item.isWaitFree || item.businessModel === "M") {
    return false;
  }

  return (item.freeSlideCount ?? 0) <= 0;
}

export function resolveKakaoAccessLabel(
  item: KakaoAccessLabelInput,
  locale: "ko" | "en",
) {
  if (item.isAllFree) {
    return locale === "ko" ? "무료" : "Free";
  }

  if (item.businessModel === "M") {
    return locale === "ko" ? "연재무료" : "Free Run";
  }

  if (item.isWaitFree) {
    const minutes = item.waitfreePeriodByMinute ?? null;

    if (minutes === 1440) {
      return locale === "ko" ? "기다무" : "Wait Free";
    }

    if (typeof minutes === "number" && minutes > 0 && minutes % 60 === 0) {
      const hours = minutes / 60;
      return locale === "ko" ? `${hours}다무` : `${hours}h Free`;
    }

    return locale === "ko" ? "기다무" : "Wait Free";
  }

  if ((item.freeSlideCount ?? 0) > 0) {
    return locale === "ko" ? "연재무료" : "Free Run";
  }

  return locale === "ko" ? "유료" : "Paid";
}
