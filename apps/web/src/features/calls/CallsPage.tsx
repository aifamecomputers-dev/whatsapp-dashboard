import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
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
  return (
    <tr className="border-b border-gray-100">
      <td className="px-3 py-2 text-sm capitalize">{call.direction}</td>
      <td className="px-3 py-2 text-sm">{call.direction === "inbound" ? call.fromWaId : call.toWaId}</td>
      <td className="px-3 py-2 text-sm capitalize">{call.status}</td>
      <td className="px-3 py-2 text-sm">{formatDuration(call.durationSeconds)}</td>
      <td className="px-3 py-2 text-xs text-gray-400">{call.startedAt ? new Date(call.startedAt).toLocaleString() : ""}</td>
    </tr>
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
    socket.on(SOCKET_EVENTS.CALL_STATUS, reload);
    return () => {
      socket.off(SOCKET_EVENTS.CALL_STATUS, reload);
    };
  }, [socket, selectedNumberId]);

  if (!selectedNumberId) {
    return <div className="p-4 text-gray-400">Select a phone number first.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        Call activity log only — this dashboard doesn't answer calls or handle audio.
        Calls ring on the caller's WhatsApp app as usual; this just records that they happened.
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Direction</th>
              <th className="px-3 py-2">Number</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Duration</th>
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
