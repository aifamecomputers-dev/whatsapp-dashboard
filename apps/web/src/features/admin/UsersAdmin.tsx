import { useEffect, useState, type FormEvent } from "react";
import type { UserDTO } from "@whatsapp-dashboard/shared";
import { apiJson } from "../../lib/api";

export default function UsersAdmin() {
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [form, setForm] = useState({ email: "", name: "", password: "", isSuperAdmin: false });
  const [saving, setSaving] = useState(false);

  async function load() {
    const data = await apiJson<{ users: UserDTO[] }>("/api/users");
    setUsers(data.users);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiJson("/api/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ email: "", name: "", password: "", isSuperAdmin: false });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(id: string) {
    if (!confirm("Remove this user?")) return;
    await apiJson(`/api/users/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500">Users</h2>
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm">
              <span>
                {u.name} <span className="text-gray-400">({u.email})</span>
                {u.isSuperAdmin && <span className="ml-2 rounded bg-gray-800 px-1.5 py-0.5 text-xs text-white">admin</span>}
              </span>
              <button onClick={() => deleteUser(u.id)} className="text-xs text-red-600 hover:underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 rounded border border-gray-200 p-4">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Add a user</h2>
        <label className="block text-sm">
          <span className="mb-1 block text-gray-600">Name</span>
          <input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-gray-600">Email</span>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-gray-600">Temporary password</span>
          <input
            required
            minLength={8}
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isSuperAdmin}
            onChange={(e) => setForm((f) => ({ ...f, isSuperAdmin: e.target.checked }))}
          />
          Super admin
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create user"}
        </button>
      </form>
    </div>
  );
}
