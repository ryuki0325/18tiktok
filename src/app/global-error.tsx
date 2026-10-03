"use client";
import { ErrorScreen } from "@/components/ErrorScreen";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0 }}><ErrorScreen error={error} /></body>
    </html>
  );
}
