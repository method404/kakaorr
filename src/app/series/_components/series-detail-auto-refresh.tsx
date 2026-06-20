"use client";

import { PageAutoRefresh } from "@/app/_components/page-auto-refresh";

type SeriesDetailAutoRefreshProps = {
  active: boolean;
};

export function SeriesDetailAutoRefresh({
  active,
}: SeriesDetailAutoRefreshProps) {
  return <PageAutoRefresh active={active} />;
}
