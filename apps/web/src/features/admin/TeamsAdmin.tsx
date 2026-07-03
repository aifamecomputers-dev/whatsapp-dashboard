import { useEffect, useState, type FormEvent } from "react";
import type { TeamDTO, UserDTO, TeamRole } from "@whatsapp-dashboard/shared";
import { TEAM_ROLES } from "@whatsapp-dashboard/shared";
import { apiJson } from "../../lib/api";

interface TeamMember {
  userId: string;
  email: string;
  name: string;
  role: TeamRole;
}

export default function TeamsAdmin() {
  const [teams, setTeams] = useState<TeamDTO[]>([]);
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [membersByTeam, setMembersByTeam] = useState<Record<string, TeamMember[]>>({});
  const [addMemberForm, setAddMemberForm] = useState<Record<string, { userId: string; role: TeamRole }>>({});

  async function load() {
    const [t, u] = await Promise.all([
      apiJson<{ teams: TeamDTO[] }>("/api/teams"),
      apiJson<{ users: UserDTO[] }>("/api/users"),
    ]);
    setTeams(t.teams);
    setUsers(u.users);
    for (const team of t.teams) {
      apiJson<{ members: TeamMember[] }>(`/api/teams/${team.id}/members`).then((d) =>
        setMembersByTeam((prev) => ({ ...prev, [team.id]: d.members })),
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createTeam(e: FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    await apiJson("/api/teams", { method: "POST", body: JSON.stringify({ name: newTeamName }) });
    setNewTeamName("");
    load();
  }

  async function addMember(teamId: string) {
    const form = addMemberForm[teamId];
    if (!form?.userId) return;
    await apiJson(`/api/teams/${teamId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId: form.userId, role: form.role ?? "agent" }),
    });
    load();
  }

  async function removeMember(teamId: string, userId: string) {
    await apiJson(`/api/teams/${teamId}/members/${userId}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createTeam} className="flex items-center gap-2">
        <input
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          placeholder="New team name"
          className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
        />
        <button type="submit" className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
          Add team
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 overflow-x-auto md:grid-cols-2">
        {teams.map((team) => (
          <div key={team.id} className="rounded border border-gray-200 p-4">
            <h3 className="mb-2 font-medium">{team.name}</h3>
            <ul className="mb-3 space-y-1 text-sm">
              {(membersByTeam[team.id] ?? []).map((m) => (
                <li key={m.userId} className="flex items-center justify-between">
                  <span>
                    {m.name} <span className="text-gray-400">({m.role})</span>
                  </span>
                  <button onClick={() => removeMember(team.id, m.userId)} className="text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <select
                value={addMemberForm[team.id]?.userId ?? ""}
                onChange={(e) =>
                  setAddMemberForm((prev) => ({
                    ...prev,
                    [team.id]: { userId: e.target.value, role: prev[team.id]?.role ?? "agent" },
                  }))
                }
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="">Select user…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <select
                value={addMemberForm[team.id]?.role ?? "agent"}
                onChange={(e) =>
                  setAddMemberForm((prev) => ({
                    ...prev,
                    [team.id]: { userId: prev[team.id]?.userId ?? "", role: e.target.value as TeamRole },
                  }))
                }
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              >
                {TEAM_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button onClick={() => addMember(team.id)} className="rounded bg-gray-800 px-3 py-1 text-sm text-white">
                Add
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
