"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

export function LogoutButton({ style }: { style?: CSSProperties }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn ghost"
      style={style}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
