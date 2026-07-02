import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import type { PhoneNumberDTO } from "@whatsapp-dashboard/shared";
import { apiJson } from "../lib/api";
import { useAuth } from "../lib/auth";
import { disconnectSocket } from "../lib/socket";

export interface LayoutContext {
  numbers: PhoneNumberDTO[];
  selectedNumberId: string | null;
  setSelectedNumberId: (id: string) => void;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-2 text-sm font-medium ${isActive ? "bg-green-100 text-green-800" : "text-gray-600 hover:bg-gray-100"}`;

export default function Layout() {
  const { user, logout } = useAuth();
  const [numbers, setNumbers] = useState<PhoneNumberDTO[]>([]);
  const [selectedNumberId, setSelectedNumberId] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ numbers: PhoneNumberDTO[] }>("/api/numbers").then((data) => {
      setNumbers(data.numbers);
      if (data.numbers.length > 0) setSelectedNumberId((prev) => prev ?? data.numbers[0].id);
    });
  }, []);

  async function handleLogout() {
    await logout();
    disconnectSocket();
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-4">
          <span className="text-lg font-semibold text-gray-900">WhatsApp Dashboard</span>
          <nav className="flex gap-1">
            <NavLink to="/inbox" className={navLinkClass}>
              Inbox
            </NavLink>
            <NavLink to="/calls" className={navLinkClass}>
              Calls
            </NavLink>
            {user?.isSuperAdmin && (
              <NavLink to="/admin" className={navLinkClass}>
                Admin
              </NavLink>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedNumberId ?? ""}
            onChange={(e) => setSelectedNumberId(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {numbers.length === 0 && <option value="">No numbers available</option>}
            {numbers.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label} ({n.displayPhoneNumber})
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-500">{user?.name}</span>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-800">
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <Outlet context={{ numbers, selectedNumberId, setSelectedNumberId } satisfies LayoutContext} />
      </main>
    </div>
  );
}
