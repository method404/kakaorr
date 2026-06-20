import { AdminShell } from "@/app/_components/admin-shell";
import { KakaoSessionSettings } from "@/app/settings/_components/kakao-session-settings";
import { getKakaoSessionSummary } from "@/lib/kakao-session";
import { getLocale } from "@/lib/locale";

export default async function AccountSettingsPage() {
  const locale = await getLocale();
  const session = await getKakaoSessionSummary();

  return (
    <AdminShell
      locale={locale}
      activePath="/settings/account"
      title={locale === "ko" ? "계정 정보" : "Account"}
      hideHeader
    >
      <div className="settings-page">
        <KakaoSessionSettings locale={locale} initialSession={session} />
      </div>
    </AdminShell>
  );
}
