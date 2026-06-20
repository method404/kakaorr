import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { validateStoredKakaoSession } from "@/lib/kakao-session";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await validateStoredKakaoSession();
    revalidatePath("/settings");

    return NextResponse.json({ ok: true, session });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to validate Kakao session.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
