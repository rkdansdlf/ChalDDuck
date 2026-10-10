"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./icon";
import { cn } from "@/lib/cn";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function getServerSnapshot(): boolean {
  return true;
}

/**
 * 네트워크 연결 상태 안내 배너.
 *
 * 모바일 환경에서 Wi-Fi/LTE 전환이나 음영 지역 진입으로 네트워크가 끊겼을 때
 * 사용자에게 현재 오프라인 상태임을 알리고, 복구 시 즉시 피드백을 제공한다.
 */
export function OfflineBanner() {
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      setJustReconnected(true);
      const timer = setTimeout(() => {
        setJustReconnected(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  const isOffline = !isOnline;
  if (!isOffline && !justReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex-none z-50 flex items-center justify-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-all duration-300",
        isOffline ? "bg-amber-500 text-white" : "bg-emerald-600 text-white",
      )}
    >
      <Icon name={isOffline ? "wifi" : "check"} size={14} />
      <span>
        {isOffline
          ? "오프라인 상태입니다. 다시 연결되면 자동으로 동기화됩니다."
          : "네트워크가 다시 연결되었습니다."}
      </span>
    </div>
  );
}
