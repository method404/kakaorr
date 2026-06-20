import { getKakaoSessionCookieHeader } from "@/lib/kakao-session";

export const runtime = "nodejs";

const ALLOWED_HOSTNAMES = new Set([
  "dn-img-page.kakao.com",
  "page-edge.kakao.com",
]);

function buildImageHeaders(cookieHeader: string | null) {
  const headers = new Headers({
    accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    origin: "https://page.kakao.com",
    referer: "https://page.kakao.com/",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  });

  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  return headers;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url")?.trim() ?? "";

  if (!rawUrl) {
    return new Response("Missing url", { status: 400 });
  }

  let targetUrl: URL;

  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (
    targetUrl.protocol !== "https:" ||
    !ALLOWED_HOSTNAMES.has(targetUrl.hostname)
  ) {
    return new Response("Host not allowed", { status: 403 });
  }

  const cookieHeader = await getKakaoSessionCookieHeader().catch(() => null);
  const response = await fetch(targetUrl, {
    cache: "no-store",
    headers: buildImageHeaders(cookieHeader),
  });

  if (!response.ok) {
    return new Response("Image fetch failed", { status: response.status });
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const cacheControl =
    response.headers.get("cache-control") ?? "private, max-age=3600";
  const body = await response.arrayBuffer();

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": cacheControl,
    },
  });
}
