import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { freshAccessToken } from "./api";
import { API_URL } from "./config";

let socket: Socket | null = null;

/** One shared socket; it re-authenticates with a fresh token on every reconnect. */
export function getSocket(): Socket {
  socket ??= io(API_URL, {
    path: "/realtime",
    transports: ["websocket"],
    auth: (cb) => {
      void freshAccessToken().then((token) => cb({ token }));
    },
  });
  return socket;
}

export function closeSocket() {
  socket?.close();
  socket = null;
}

/** Subscribes to a booking's live events while the screen is mounted. */
export function useBookingEvents(bookingId: string | undefined, handlers: Record<string, (data: any) => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!bookingId) return;
    const s = getSocket();
    const subscribe = () => s.emit("booking:subscribe", { bookingId }, (res: { ok: boolean; data?: unknown }) => {
      if (res.ok) ref.current.snapshot?.(res.data);
    });
    const events = ["staff:location", "booking:status"] as const;
    const wrapped = events.map((e) => [e, (d: { bookingId?: string }) => d.bookingId === bookingId && ref.current[e]?.(d)] as const);
    wrapped.forEach(([e, fn]) => s.on(e, fn));
    s.on("connect", subscribe);
    if (s.connected) subscribe();
    return () => {
      s.emit("booking:unsubscribe", { bookingId });
      s.off("connect", subscribe);
      wrapped.forEach(([e, fn]) => s.off(e, fn));
    };
  }, [bookingId]);
}
