import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Device, type Call } from "@twilio/voice-sdk";
import type { CallDTO } from "@whatsapp-dashboard/shared";
import { SOCKET_EVENTS } from "@whatsapp-dashboard/shared";
import { apiJson } from "../../lib/api";
import { useSocket } from "../../lib/socket";
import type { LayoutContext } from "../../app/Layout";

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function CallLogRow({ call }: { call: CallDTO }) {
  const [playing, setPlaying] = useState(false);
  return (
    <tr className="border-b border-gray-100">
      <td className="px-3 py-2 text-sm capitalize">{call.direction}</td>
      <td className="px-3 py-2 text-sm">{call.direction === "inbound" ? call.fromNumber : call.toNumber}</td>
      <td className="px-3 py-2 text-sm capitalize">{call.status}</td>
      <td className="px-3 py-2 text-sm">{formatDuration(call.durationSeconds)}</td>
      <td className="px-3 py-2 text-sm">{call.consentNoticePlayed ? "Yes" : "No"}</td>
      <td className="px-3 py-2 text-sm">
        {call.hasRecording ? (
          <button onClick={() => setPlaying(true)} className="text-green-700 hover:underline">
            {playing ? "Loading…" : "Play recording"}
          </button>
        ) : (
          <span className="text-gray-400">—</span>
        )}
        {playing && <audio className="mt-1" controls autoPlay src={`/api/calls/${call.id}/recording`} />}
      </td>
      <td className="px-3 py-2 text-xs text-gray-400">{call.startedAt ? new Date(call.startedAt).toLocaleString() : ""}</td>
    </tr>
  );
}

function Dialer({ numberId }: { numberId: string }) {
  const [calleeNumber, setCalleeNumber] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "in-call">("idle");
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);

  useEffect(() => {
    return () => {
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, [numberId]);

  async function placeCall() {
    if (!calleeNumber.trim()) return;
    setStatus("connecting");
    try {
      const { token } = await apiJson<{ token: string }>(`/api/numbers/${numberId}/voice-token`);
      const device = new Device(token, { logLevel: "error" });
      deviceRef.current = device;
      await device.register();

      const call = await device.connect({ params: { NumberId: numberId, CalleeNumber: calleeNumber } });
      activeCallRef.current = call;
      call.on("accept", () => setStatus("in-call"));
      call.on("disconnect", () => setStatus("idle"));
      call.on("cancel", () => setStatus("idle"));
      call.on("error", () => setStatus("idle"));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to place call");
      setStatus("idle");
    }
  }

  function hangUp() {
    activeCallRef.current?.disconnect();
    setStatus("idle");
  }

  return (
    <div className="flex items-center gap-2 border-b border-gray-200 p-3">
      <input
        value={calleeNumber}
        onChange={(e) => setCalleeNumber(e.target.value)}
        placeholder="+1 555 000 0000"
        className="w-56 rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
        disabled={status !== "idle"}
      />
      {status === "idle" ? (
        <button
          onClick={placeCall}
          disabled={!calleeNumber.trim()}
          className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          Call
        </button>
      ) : (
        <button onClick={hangUp} className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
          {status === "connecting" ? "Cancel" : "Hang up"}
        </button>
      )}
      {status === "connecting" && <span className="text-sm text-gray-500">Connecting…</span>}
      {status === "in-call" && <span className="text-sm text-green-700">In call</span>}
    </div>
  );
}

export default function CallsPage() {
  const { selectedNumberId } = useOutletContext<LayoutContext>();
  const [calls, setCalls] = useState<CallDTO[]>([]);

  async function loadCalls() {
    if (!selectedNumberId) return;
    const data = await apiJson<{ calls: CallDTO[] }>(`/api/numbers/${selectedNumberId}/calls`);
    setCalls(data.calls);
  }

  useEffect(() => {
    loadCalls();
  }, [selectedNumberId]);

  const socket = useSocket(Boolean(selectedNumberId));
  useEffect(() => {
    if (!socket) return;
    const reload = () => loadCalls();
    socket.on(SOCKET_EVENTS.CALL_NEW, reload);
    socket.on(SOCKET_EVENTS.CALL_STATUS, reload);
    socket.on(SOCKET_EVENTS.CALL_RECORDING_READY, reload);
    return () => {
      socket.off(SOCKET_EVENTS.CALL_NEW, reload);
      socket.off(SOCKET_EVENTS.CALL_STATUS, reload);
      socket.off(SOCKET_EVENTS.CALL_RECORDING_READY, reload);
    };
  }, [socket, selectedNumberId]);

  if (!selectedNumberId) {
    return <div className="p-4 text-gray-400">Select a phone number first.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <Dialer numberId={selectedNumberId} />
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Direction</th>
              <th className="px-3 py-2">Number</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Consent notice</th>
              <th className="px-3 py-2">Recording</th>
              <th className="px-3 py-2">Started</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <CallLogRow key={c.id} call={c} />
            ))}
          </tbody>
        </table>
        {calls.length === 0 && <div className="p-4 text-sm text-gray-400">No calls yet.</div>}
      </div>
    </div>
  );
}
