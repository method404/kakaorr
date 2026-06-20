"use client";

import { useState, useTransition } from "react";
import type { Locale } from "@/lib/locale";
import type { KakaoSessionSummary } from "@/lib/kakao-session";

type KakaoSessionSettingsProps = {
  locale: Locale;
  initialSession: KakaoSessionSummary;
};

function formatDateTime(value: string | null, locale: Locale) {
  if (!value) {
    return locale === "ko" ? "없음" : "None";
  }

  try {
    return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getAdultAccessLabel(value: boolean | null, locale: Locale) {
  if (value === null) {
    return locale === "ko" ? "미확인" : "Unknown";
  }

  return value
    ? locale === "ko"
      ? "가능"
      : "Available"
    : locale === "ko"
      ? "불가"
      : "Unavailable";
}

export function KakaoSessionSettings({
  locale,
  initialSession,
}: KakaoSessionSettingsProps) {
  const [session, setSession] = useState(initialSession);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "bridgeCopy" | "sessionValidate" | "sessionClear" | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const kakaorrUrl =
    typeof window === "undefined" ? "http://SERVER_IP:3000" : window.location.origin;
  const bridgeCommand = `npm run kakao:bridge -- --kakaorr-url ${kakaorrUrl}`;

  const labels = {
    session: locale === "ko" ? "카카오페이지 세션" : "KakaoPage session",
    status: locale === "ko" ? "상태" : "Status",
    lastValidatedAt: locale === "ko" ? "마지막 확인" : "Last check",
    adultAccess:
      locale === "ko" ? "성인컨텐츠 접근" : "Adult content access",
    bridgeLogin:
      locale === "ko" ? "외부 PC 로그인" : "External PC sign-in",
    validateSession:
      locale === "ko" ? "세션 확인" : "Check session",
    validatingSession:
      locale === "ko" ? "확인 중..." : "Checking...",
    copyBridgeCommand:
      locale === "ko" ? "명령 복사" : "Copy command",
    copyingBridgeCommand:
      locale === "ko" ? "복사 중..." : "Copying...",
    clearSession:
      locale === "ko" ? "세션 삭제" : "Delete session",
    clearingSession:
      locale === "ko" ? "삭제 중..." : "Deleting...",
    configuredSummary:
      locale === "ko" ? "저장됨" : "Saved",
    notConfiguredSummary:
      locale === "ko" ? "저장되지 않음" : "Not saved",
    validationSuccess:
      locale === "ko" ? "세션 상태를 다시 확인했습니다." : "Session rechecked.",
    validationError:
      locale === "ko" ? "세션 확인에 실패했습니다." : "Failed to check session.",
    sessionCleared:
      locale === "ko" ? "저장된 세션을 삭제했습니다." : "Stored session deleted.",
    sessionError:
      locale === "ko" ? "세션 삭제에 실패했습니다." : "Failed to delete session.",
    bridgeCommand: locale === "ko" ? "실행 명령" : "Command",
    bridgeCopied:
      locale === "ko" ? "브릿지 명령을 복사했습니다." : "Copied the bridge command.",
    bridgeCopyError:
      locale === "ko" ? "명령 복사에 실패했습니다." : "Failed to copy the command.",
  };

  return (
    <section className="settings-panel">
      <header className="settings-panel-header">
        <h2>{labels.session}</h2>
      </header>

      <div className="settings-form-grid">
        <div className="settings-form-row">
          <div className="settings-form-label">
            <h3>{labels.status}</h3>
          </div>
          <div className="settings-form-control">
            <p className="settings-summary-line">
              {session.configured
                ? labels.configuredSummary
                : labels.notConfiguredSummary}
            </p>
          </div>
        </div>

        <div className="settings-form-row">
          <div className="settings-form-label">
            <h3>{labels.adultAccess}</h3>
          </div>
          <div className="settings-form-control">
            <strong className="settings-inline-value">
              {getAdultAccessLabel(session.adultAccess, locale)}
            </strong>
          </div>
        </div>

        <div className="settings-form-row">
          <div className="settings-form-label">
            <h3>{labels.lastValidatedAt}</h3>
          </div>
          <div className="settings-form-control">
            <strong className="settings-inline-value">
              {formatDateTime(session.lastValidatedAt, locale)}
            </strong>
          </div>
        </div>

        <div className="settings-form-row">
          <div className="settings-form-label">
            <h3>{labels.bridgeLogin}</h3>
          </div>
          <div className="settings-form-control">
            <div className="settings-remote-auth-box">
              <div className="settings-remote-auth-link-row">
                <div className="settings-command-header">
                  <span className="settings-remote-auth-label">{labels.bridgeCommand}</span>
                  <button
                    type="button"
                    className="button settings-command-copy-button"
                    onClick={() => {
                      setMessage("");
                      setError("");
                      setPendingAction("bridgeCopy");

                      startTransition(async () => {
                        try {
                          if (!navigator.clipboard) {
                            throw new Error(labels.bridgeCopyError);
                          }
                          await navigator.clipboard.writeText(bridgeCommand);
                          setMessage(labels.bridgeCopied);
                          setError("");
                        } catch (requestError) {
                          setError(
                            requestError instanceof Error
                              ? requestError.message
                              : labels.bridgeCopyError,
                          );
                        } finally {
                          setPendingAction(null);
                        }
                      });
                    }}
                  >
                    {pendingAction === "bridgeCopy" && isPending
                      ? labels.copyingBridgeCommand
                      : labels.copyBridgeCommand}
                  </button>
                </div>
                <textarea
                  className="settings-input settings-command-input"
                  readOnly
                  value={bridgeCommand}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-panel-footer settings-panel-footer-split">
        <div className="settings-inline-actions">
          <button
            type="button"
            className="button"
            disabled={isPending || !session.configured}
            onClick={() => {
              setMessage("");
              setError("");
              setPendingAction("sessionValidate");

              startTransition(async () => {
                try {
                  const response = await fetch("/api/settings/kakao-session/validate", {
                    method: "POST",
                  });
                  const payload = (await response.json()) as {
                    error?: string;
                    session?: KakaoSessionSummary;
                  };

                  if (!response.ok || !payload.session) {
                    throw new Error(payload.error ?? labels.validationError);
                  }

                  setSession(payload.session);
                  setMessage(labels.validationSuccess);
                } catch (requestError) {
                  setError(
                    requestError instanceof Error
                      ? requestError.message
                      : labels.validationError,
                  );
                } finally {
                  setPendingAction(null);
                }
              });
            }}
          >
            {pendingAction === "sessionValidate" && isPending
              ? labels.validatingSession
              : labels.validateSession}
          </button>
        </div>

        <div className="settings-inline-actions">
          <button
            type="button"
            className="button button-danger"
            disabled={isPending || !session.configured}
            onClick={() => {
              setMessage("");
              setError("");
              setPendingAction("sessionClear");

              startTransition(async () => {
                try {
                  const response = await fetch("/api/settings/kakao-session", {
                    method: "DELETE",
                  });
                  const payload = (await response.json()) as {
                    error?: string;
                  };

                  if (!response.ok) {
                    throw new Error(payload.error ?? labels.sessionError);
                  }

                  setSession({
                    configured: false,
                    updatedAt: null,
                    lastValidatedAt: null,
                    isValid: null,
                    adultAccess: null,
                    lastError: null,
                    cookieNames: [],
                    maskedCookieHeader: "",
                  });
                  setMessage(labels.sessionCleared);
                } catch (requestError) {
                  setError(
                    requestError instanceof Error
                      ? requestError.message
                      : labels.sessionError,
                  );
                } finally {
                  setPendingAction(null);
                }
              });
            }}
          >
            {pendingAction === "sessionClear" && isPending
              ? labels.clearingSession
              : labels.clearSession}
          </button>
        </div>
      </div>

      {message ? <p className="settings-meta-note">{message}</p> : null}
      {error ? <p className="settings-meta-note settings-inline-error">{error}</p> : null}
      {session.lastError ? (
        <p className="settings-meta-note">{session.lastError}</p>
      ) : null}
    </section>
  );
}
