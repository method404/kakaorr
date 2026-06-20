#!/usr/bin/env node

import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { chromium } from "playwright";

const KAKAO_QR_LOGIN_URL =
  "https://accounts.kakao.com/qr_login/?append_stay_signed_in=false&continue=https%3A%2F%2Fkauth.kakao.com%2Foauth%2Fauthorize%3Fclient_id%3D49bbb48c5fdb0199e5da1b89de359484%26state%3Dhttps%25253A%25252F%25252Fpage.kakao.com%25252Fcontent%25252F61933312%26redirect_uri%3Dhttps%253A%252F%252Fpage.kakao.com%252Frelay%252Flogin%26response_type%3Dcode%26auth_tran_id%3DQHtw0vXiTJFhOLUrTfyWiGMysqyen97UQsnVfm~fwHRMLMZJfFwuhhPKsGBI%26ka%3Dsdk%252F2.1.0%2520os%252Fjavascript%2520sdk_type%252Fjavascript%2520lang%252Fko%2520device%252FMacIntel%2520origin%252Fhttps%25253A%25252F%25252Fpage.kakao.com%26is_popup%3Dfalse%26through_account%3Dtrue&lang=ko&showHeader=false&stay_signed_in=false#main";

function parseArgs(argv) {
  const values = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const [key, inlineValue] = current.slice(2).split("=", 2);

    if (inlineValue !== undefined) {
      values.set(key, inlineValue);
      continue;
    }

    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      values.set(key, "true");
      continue;
    }

    values.set(key, next);
    index += 1;
  }

  return values;
}

function printUsage() {
  console.log(`Kakaorr Kakao session bridge

Usage:
  node scripts/kakao-session-bridge.mjs --kakaorr-url http://SERVER_IP:3000

Options:
  --kakaorr-url  Kakaorr base URL, e.g. http://192.168.0.10:3000
  --username     Optional Kakao account ID/email/phone
  --password     Optional Kakao password
  --profile-dir  Optional persistent browser profile directory
  --headless     true/false, default false
`);
}

function normalizeBaseUrl(rawValue) {
  const value = rawValue?.trim();

  if (!value) {
    throw new Error("Missing --kakaorr-url");
  }

  return value.replace(/\/+$/, "");
}

async function resolveBrowserLaunchOptions() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
  ];

  for (const executablePath of candidates) {
    try {
      await access(executablePath);
      return { executablePath };
    } catch {
      continue;
    }
  }

  return {};
}

function buildCookieHeader(cookies) {
  return cookies
    .filter((cookie) => {
      return (
        cookie.domain.includes("kakao.com") ||
        cookie.domain.includes("kakaoentcdn.com")
      );
    })
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function hasUsableKakaoCookies(cookies) {
  return cookies.some((cookie) => {
    return (
      (cookie.domain.includes("page.kakao.com") ||
        cookie.domain.endsWith(".kakao.com") ||
        cookie.domain === "kakao.com") &&
      !cookie.name.startsWith("_ga") &&
      !cookie.name.startsWith("_gid")
    );
  });
}

async function saveSession(kakaorrUrl, cookieHeader) {
  const response = await fetch(`${kakaorrUrl}/api/settings/kakao-session`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cookieHeader,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error ?? `Failed to save Kakao session: ${response.status}`,
    );
  }

  return payload.session ?? null;
}

async function fillLogin(page, username, password) {
  const usernameInput = page.locator(
    'input[placeholder*="카카오메일"], input[autocomplete="username"], input[name="loginId"]',
  );
  const passwordInput = page.locator(
    'input[type="password"], input[autocomplete="current-password"]',
  );
  const saveLoginCheckbox = page.getByRole("checkbox", {
    name: "간편로그인 정보 저장",
  });

  await usernameInput.first().waitFor({ timeout: 15000 });
  await usernameInput.first().fill(username);
  await passwordInput.first().fill(password);

  if ((await saveLoginCheckbox.count()) > 0) {
    await saveLoginCheckbox.first().check().catch(() => undefined);
  }

  await page.getByRole("button", { name: "로그인" }).click();
}

async function waitForSessionCookies(context, timeoutMs = 10 * 60 * 1000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const page = context.pages().at(-1) ?? (await context.newPage());
    const url = page.url();
    const cookies = await context.cookies([
      "https://page.kakao.com",
      "https://bff-page.kakao.com",
      "https://accounts.kakao.com",
    ]);

    if (
      url.startsWith("https://page.kakao.com/") &&
      !url.includes("/relay/login") &&
      hasUsableKakaoCookies(cookies)
    ) {
      return cookies;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });
  }

  throw new Error("Timed out waiting for KakaoPage session cookies.");
}

async function promptHidden(query) {
  return new Promise((resolve) => {
    const output = process.stdout;
    const input = process.stdin;
    const rl = readline.createInterface({
      input,
      output,
      terminal: true,
    });

    const originalWrite = rl._writeToOutput.bind(rl);
    rl._writeToOutput = function writeMuted(stringToWrite) {
      if (rl.stdoutMuted) {
        rl.output.write("*");
        return;
      }

      originalWrite(stringToWrite);
    };

    output.write(query);
    rl.stdoutMuted = true;
    rl.question("", (answer) => {
      rl.close();
      output.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.has("help")) {
    printUsage();
    process.exit(0);
  }

  const kakaorrUrl = normalizeBaseUrl(args.get("kakaorr-url"));
  const username = args.get("username")?.trim() ?? "";
  const passwordArg = args.get("password")?.trim() ?? "";
  const headless = args.get("headless") === "true";
  const profileDir =
    args.get("profile-dir")?.trim() ||
    path.join(os.tmpdir(), "kakaorr-kakao-session-bridge");
  const password =
    username && !passwordArg
      ? await promptHidden("Kakao password: ")
      : passwordArg;

  console.log("[kakaorr-bridge] opening local browser...");
  const launchOptions = await resolveBrowserLaunchOptions();
  const context = await chromium.launchPersistentContext(profileDir, {
    ...launchOptions,
    headless,
    viewport: { width: 1440, height: 960 },
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());

    await page.goto(KAKAO_QR_LOGIN_URL, {
      waitUntil: "domcontentloaded",
    });

    if (username && password) {
      await fillLogin(page, username, password);
    }

    console.log(
      "[kakaorr-bridge] complete Kakao QR login or account login in the opened browser.",
    );

    const cookies = await waitForSessionCookies(context);
    const cookieHeader = buildCookieHeader(cookies);

    if (!cookieHeader) {
      throw new Error("Kakao session cookies were not captured.");
    }

    console.log("[kakaorr-bridge] uploading captured Kakao session to Kakaorr...");
    const session = await saveSession(kakaorrUrl, cookieHeader);

    console.log("[kakaorr-bridge] done");
    console.log(
      JSON.stringify(
        {
          adultAccess: session?.adultAccess ?? null,
          updatedAt: session?.updatedAt ?? null,
          configured: session?.configured ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(
    `[kakaorr-bridge] ${
      error instanceof Error ? error.message : "Unknown error"
    }`,
  );
  process.exit(1);
});
