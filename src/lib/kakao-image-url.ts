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
