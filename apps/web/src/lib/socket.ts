import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { getAccessToken } from "./api";

let socket: Socket | null = null;

/**
 * A single shared socket for the whole app, created lazily once a user is logged in.
 * `auth` is passed as a function so socket.io-client re-evaluates it (picking up a
 * freshly refreshed access token) on every reconnect attempt, not just the first.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      auth: (cb) => cb({ token: getAccessToken() }),
      autoConnect: false,
    });
  }
  return socket;
}

export function useSocket(enabled: boolean): Socket | null {
  const ref = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const s = getSocket();
    ref.current = s;
    if (!s.connected) s.connect();
    return () => {
      // Keep the connection alive across page navigations within the app;
      // only disconnected explicitly on logout (see auth.tsx clearSession
      // callers, which should call disconnectSocket()).
    };
  }, [enabled]);

  return ref.current;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
