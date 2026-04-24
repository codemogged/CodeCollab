import { useState, useRef, useCallback, useEffect } from "react";
import { StreamEventParser, type ActivityEvent } from "@/lib/stream-event-parser";

/**
 * Hook that wraps StreamEventParser for compact live timeline display.
 *
 * - processChunk()  → feed raw CLI chunks (ANSI is stripped internally)
 * - startStreaming() → reset & start the polling interval
 * - finalize()      → flush and stop
 * - reset()         → full teardown
 *
 * Bodies are passed through fully (hidden in the UI by default);
 * only labels appear in the compact live view.
 */
export function useStreamEvents() {
  const parserRef = useRef(new StreamEventParser());
  const [displayEvents, setDisplayEvents] = useState<ActivityEvent[]>([]);
  const prevCountRef = useRef(0);
  const prevLastLabelRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollCbRef = useRef<(() => void) | null>(null);

  /** Register an optional scroll callback invoked on every poll tick. */
  const setScrollCallback = useCallback((cb: (() => void) | null) => {
    scrollCbRef.current = cb;
  }, []);

  const startStreaming = useCallback(() => {
    parserRef.current.reset();
    prevCountRef.current = 0;
    prevLastLabelRef.current = "";
    setDisplayEvents([]);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      // Flush any pending partial line
      parserRef.current.flushPending();

      const allEvents = parserRef.current.getEvents();
      if (allEvents.length === 0) return;

      const lastEvent = allEvents[allEvents.length - 1];
      const changed =
        allEvents.length !== prevCountRef.current ||
        lastEvent.label !== prevLastLabelRef.current;

      if (changed) {
        prevCountRef.current = allEvents.length;
        prevLastLabelRef.current = lastEvent.label;
        setDisplayEvents([...allEvents]);
        scrollCbRef.current?.();
      }
    }, 200);
  }, []);

  const processChunk = useCallback((chunk: string) => {
    parserRef.current.processChunk(chunk);
  }, []);

  const finalize = useCallback(async () => {
    parserRef.current.flush();
    const allEvents = parserRef.current.getEvents();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setDisplayEvents([...allEvents]);
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    parserRef.current.reset();
    prevCountRef.current = 0;
    prevLastLabelRef.current = "";
    setDisplayEvents([]);
  }, []);

  const getRawText = useCallback(() => parserRef.current.getRawText(), []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return { events: displayEvents, processChunk, startStreaming, finalize, reset, getRawText, setScrollCallback };
}
