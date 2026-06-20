"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type PageAutoRefreshProps = {
  active: boolean;
  intervalMs?: number;
};

export function PageAutoRefresh({
  active,
  intervalMs = 3000,
}: PageAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [active, intervalMs, router]);

  return null;
}
