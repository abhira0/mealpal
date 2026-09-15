"use client";

import { useEffect } from "react";
import { shouldRegisterServiceWorker } from "@/lib/online-status";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!shouldRegisterServiceWorker()) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed", err);
    });
  }, []);

  return null;
}
