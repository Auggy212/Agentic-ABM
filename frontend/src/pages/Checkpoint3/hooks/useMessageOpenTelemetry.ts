import { useEffect, useRef } from "react";

export function useMessageOpenTelemetry(messageId: string, onOpened: (messageId: string) => void) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const key = `cp3-opened:${messageId}`;
    if (sessionStorage.getItem(key)) return;

    let timer: number | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          timer = window.setTimeout(() => {
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, "1");
              onOpened(messageId);
            }
          }, 2000);
        } else if (timer) {
          window.clearTimeout(timer);
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(node);
    return () => {
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [messageId, onOpened]);

  return ref;
}
