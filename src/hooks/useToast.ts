import { useState, useCallback, useRef } from 'react';

export function useToast(defaultDurationMs: number = 3000) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string, durationMs: number = defaultDurationMs) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setToastMessage(msg);
    timeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      timeoutRef.current = null;
    }, durationMs);
  }, [defaultDurationMs]);

  const clearToast = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setToastMessage(null);
  }, []);

  return { toastMessage, showToast, clearToast };
}
