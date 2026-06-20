import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const KAKAO_ADULT_PROBE_URL = "https://page.kakao.com/content/61933312";

type StoredKakaoSession = {
  cookieHeader: string;
  updatedAt: string;
  lastValidatedAt: string | null;
  isValid: boolean | null;
  adultAccess: boolean | null;
  lastError: string | null;
};

export type KakaoSessionSummary = {
  configured: boolean;
  updatedAt: string | null;
  lastValidatedAt: string | null;
  isValid: boolean | null;
  adultAccess: boolean | null;
  lastError: string | null;
  cookieNames: string[];
  maskedCookieHeader: string;
};

type ValidateResult = {
  isValid: boolean;
  adultAccess: boolean;
  lastError: string | null;
};

type MergeCookieResult = {
  cookieHeader: string;
  changed: boolean;
};

function getDataRoot() {
  return path.join(process.cwd(), "data");
}

function getSettingsRoot() {
  return path.join(getDataRoot(), "settings");
}

function getKakaoSessionPath() {
  return path.join(getSettingsRoot(), "kakao-session.json");
}

function extractCookiePairs(rawValue: string) {
  const sanitized = rawValue
    .replace(/^cookie\s*:\s*/i, "")
    .replace(/\r?\n/g, ";")
    .trim();
  const pairs = new Map<string, string>();

  for (const segment of sanitized.split(";")) {
    const trimmed = segment.trim();

    if (!trimmed) {
      continue;
    }

    const delimiterIndex = trimmed.indexOf("=");

    if (delimiterIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, delimiterIndex).trim();
    const value = trimmed.slice(delimiterIndex + 1).trim();

    if (!key || !value) {
      continue;
    }

    pairs.set(key, value);
  }

  return pairs;
}

function normalizeCookieHeader(rawValue: string) {
  const pairs = extractCookiePairs(rawValue);
  return [...pairs.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function normalizeSetCookieLines(
  rawValue: string | string[] | null | undefined,
): string[] {
  if (!rawValue) {
    return [];
  }

  if (Array.isArray(rawValue)) {
    return rawValue.map((value) => value.trim()).filter(Boolean);
  }

  return rawValue
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseSetCookieLine(rawLine: string) {
  const [pairPart = "", ...attributeParts] = rawLine
    .split(";")
    .map((value) => value.trim());
  const delimiterIndex = pairPart.indexOf("=");

  if (delimiterIndex <= 0) {
    return null;
  }

  const key = pairPart.slice(0, delimiterIndex).trim();
  const value = pairPart.slice(delimiterIndex + 1).trim();
  const attributes = new Map<string, string>();

  for (const attribute of attributeParts) {
    const attributeIndex = attribute.indexOf("=");

    if (attributeIndex <= 0) {
      attributes.set(attribute.toLowerCase(), "");
      continue;
    }

    attributes.set(
      attribute.slice(0, attributeIndex).trim().toLowerCase(),
      attribute.slice(attributeIndex + 1).trim(),
    );
  }

  return {
    key,
    value,
    attributes,
  };
}

function isExpiredCookie(attributes: Map<string, string>) {
  const maxAge = attributes.get("max-age");

  if (maxAge === "0") {
    return true;
  }

  const expires = attributes.get("expires");

  if (!expires) {
    return false;
  }

  const expiresAt = new Date(expires);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now();
}

function mergeCookieHeaders(
  currentCookieHeader: string | null,
  setCookieLines: string[] | null | undefined,
): MergeCookieResult {
  const currentPairs = extractCookiePairs(currentCookieHeader ?? "");
  const nextPairs = new Map(currentPairs);
  let changed = false;

  for (const rawLine of normalizeSetCookieLines(setCookieLines)) {
    const parsed = parseSetCookieLine(rawLine);

    if (!parsed) {
      continue;
    }

    if (!parsed.value || isExpiredCookie(parsed.attributes)) {
      if (nextPairs.delete(parsed.key)) {
        changed = true;
      }
      continue;
    }

    if (nextPairs.get(parsed.key) !== parsed.value) {
      nextPairs.set(parsed.key, parsed.value);
      changed = true;
    }
  }

  const cookieHeader = [...nextPairs.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");

  return { cookieHeader, changed };
}

function maskValue(value: string) {
  if (value.length <= 10) {
    return `${value.slice(0, 2)}***`;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function maskCookieHeader(cookieHeader: string) {
  const pairs = extractCookiePairs(cookieHeader);

  return [...pairs.entries()]
    .map(([key, value]) => `${key}=${maskValue(value)}`)
    .join("; ");
}

function summarizeSession(session: StoredKakaoSession | null): KakaoSessionSummary {
  if (!session) {
    return {
      configured: false,
      updatedAt: null,
      lastValidatedAt: null,
      isValid: null,
      adultAccess: null,
      lastError: null,
      cookieNames: [],
      maskedCookieHeader: "",
    };
  }

  const cookies = extractCookiePairs(session.cookieHeader);

  return {
    configured: true,
    updatedAt: session.updatedAt,
    lastValidatedAt: session.lastValidatedAt,
    isValid: session.isValid,
    adultAccess: session.adultAccess,
    lastError: session.lastError,
    cookieNames: [...cookies.keys()],
    maskedCookieHeader: maskCookieHeader(session.cookieHeader),
  };
}

async function readStoredSession() {
  try {
    const raw = await readFile(getKakaoSessionPath(), "utf8");
    return JSON.parse(raw) as StoredKakaoSession;
  } catch {
    return null;
  }
}

async function writeStoredSession(session: StoredKakaoSession) {
  await mkdir(getSettingsRoot(), { recursive: true });
  const filePath = getKakaoSessionPath();
  await writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  await chmod(filePath, 0o600).catch(() => undefined);
}

async function writeSessionFromCookieHeader(
  cookieHeader: string,
  options?: {
    updatedAt?: string;
    lastValidatedAt?: string | null;
    isValid?: boolean | null;
    adultAccess?: boolean | null;
    lastError?: string | null;
  },
) {
  const existing = await readStoredSession();
  const now = options?.updatedAt ?? new Date().toISOString();
  const session: StoredKakaoSession = {
    cookieHeader,
    updatedAt: now,
    lastValidatedAt:
      options?.lastValidatedAt ?? existing?.lastValidatedAt ?? null,
    isValid: options?.isValid ?? existing?.isValid ?? null,
    adultAccess: options?.adultAccess ?? existing?.adultAccess ?? null,
    lastError: options?.lastError ?? existing?.lastError ?? null,
  };

  await writeStoredSession(session);
  return summarizeSession(session);
}

function isAdultGatePage(text: string) {
  return (
    text.includes("연령 확인이 필요") ||
    text.includes("로그인 후 이용해 주세요.") ||
    text.includes("로그인 후 이용해 주세요")
  );
}

async function validateCookieHeader(cookieHeader: string): Promise<ValidateResult> {
  const response = await fetch(KAKAO_ADULT_PROBE_URL, {
    cache: "no-store",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8",
      cookie: cookieHeader,
      origin: "https://page.kakao.com",
      referer: "https://page.kakao.com/",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    },
    redirect: "manual",
  });

  const text = await response.text();

  if (!response.ok) {
    return {
      isValid: false,
      adultAccess: false,
      lastError: `KakaoPage validation failed: ${response.status}`,
    };
  }

  if (isAdultGatePage(text)) {
    return {
      isValid: false,
      adultAccess: false,
      lastError:
        "KakaoPage adult access could not be verified. Complete QR login and age verification in the external browser.",
    };
  }

  return {
    isValid: true,
    adultAccess: true,
    lastError: null,
  };
}

export async function getKakaoSessionCookieHeader() {
  const session = await readStoredSession();
  return session?.cookieHeader ?? null;
}

export async function getKakaoSessionSummary() {
  return summarizeSession(await readStoredSession());
}

export async function saveKakaoSession(rawCookieHeader: string) {
  const cookieHeader = normalizeCookieHeader(rawCookieHeader);

  if (!cookieHeader) {
    throw new Error("A valid Kakao cookie header is required.");
  }

  const validation = await validateCookieHeader(cookieHeader);
  const now = new Date().toISOString();
  const session: StoredKakaoSession = {
    cookieHeader,
    updatedAt: now,
    lastValidatedAt: now,
    isValid: validation.isValid,
    adultAccess: validation.adultAccess,
    lastError: validation.lastError,
  };

  await writeStoredSession(session);
  return summarizeSession(session);
}

export async function mergeKakaoSessionSetCookieLines(
  setCookieLines: string[] | null | undefined,
) {
  if (!setCookieLines?.length) {
    return null;
  }

  const existing = await readStoredSession();

  if (!existing?.cookieHeader) {
    return null;
  }

  const merged = mergeCookieHeaders(existing.cookieHeader, setCookieLines);

  if (!merged.changed || !merged.cookieHeader) {
    return summarizeSession(existing);
  }

  return writeSessionFromCookieHeader(merged.cookieHeader, {
    updatedAt: new Date().toISOString(),
    lastValidatedAt: existing.lastValidatedAt,
    isValid: existing.isValid,
    adultAccess: existing.adultAccess,
    lastError: existing.lastError,
  });
}

export async function validateStoredKakaoSession() {
  const session = await readStoredSession();

  if (!session) {
    return summarizeSession(null);
  }

  const validation = await validateCookieHeader(session.cookieHeader);
  const updatedSession: StoredKakaoSession = {
    ...session,
    lastValidatedAt: new Date().toISOString(),
    isValid: validation.isValid,
    adultAccess: validation.adultAccess,
    lastError: validation.lastError,
  };

  await writeStoredSession(updatedSession);
  return summarizeSession(updatedSession);
}

export async function clearKakaoSession() {
  await rm(getKakaoSessionPath(), { force: true });
}
