import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  clearKakaoSession,
  getKakaoSessionSummary,
  saveKakaoSession,
} from "@/lib/kakao-session";

export const runtime = "nodejs";

type SaveKakaoSessionBody = {
  cookieHeader?: string;
};

export async function GET() {
  return NextResponse.json({
    session: await getKakaoSessionSummary(),
  });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as SaveKakaoSessionBody;
    const cookieHeader = body.cookieHeader?.trim() ?? "";

    if (!cookieHeader) {
      return NextResponse.json(
        { error: "Cookie header is required." },
        { status: 400 },
      );
    }

    const session = await saveKakaoSession(cookieHeader);
    revalidatePath("/settings");

    return NextResponse.json({ ok: true, session });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save Kakao session.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  await clearKakaoSession();
  revalidatePath("/settings");
  return NextResponse.json({ ok: true });
}
