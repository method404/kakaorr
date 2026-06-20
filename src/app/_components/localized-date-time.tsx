"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";

type LocalizedDateTimeProps = {
  value: string | null | undefined;
  locale: Locale;
  variant?: "detail" | "short" | "medium";
  emptyLabel?: string;
};

function formatValue(value: string, locale: Locale, variant: "detail" | "short" | "medium") {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (variant === "detail") {
    return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    dateStyle: variant,
    timeStyle: "short",
  }).format(date);
}

export function LocalizedDateTime({
  value,
  locale,
  variant = "detail",
  emptyLabel = "-",
}: LocalizedDateTimeProps) {
  const [formatted, setFormatted] = useState<string>(emptyLabel);

  useEffect(() => {
    if (!value || value === "-") {
      setFormatted(emptyLabel);
      return;
    }

    setFormatted(formatValue(value, locale, variant));
  }, [emptyLabel, locale, value, variant]);

  return <span suppressHydrationWarning>{formatted}</span>;
}
