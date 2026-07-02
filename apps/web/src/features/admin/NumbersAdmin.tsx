import { useEffect, useState, type FormEvent } from "react";
import type { PhoneNumberDTO, TeamDTO } from "@whatsapp-dashboard/shared";
import { apiJson } from "../../lib/api";

const emptyForm = {
  label: "",
  displayPhoneNumber: "",
  whatsappPhoneNumberId: "",
  whatsappWabaId: "",
  whatsappAccessToken: "",
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioPhoneSid: "",
  twilioTwimlAppSid: "",
  twilioApiKeySid: "",
  twilioApiKeySecret: "",
  voiceEnabled: false,
};

export default function NumbersAdmin() {
  const [numbers, setNumbers] = useState<PhoneNumberDTO[]>([]);
  const [teams, setTeams] = useState<TeamDTO[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [n, t] = await Promise.all([
      apiJson<{ numbers: PhoneNumberDTO[] }>("/api/numbers"),
      apiJson<{ teams: TeamDTO[] }>("/api/teams"),
    ]);
    setNumbers(n.numbers);
    setTeams(t.teams);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiJson("/api/numbers", {
        method: "POST",
        body: JSON.stringify({ ...form, teamIds: selectedTeamIds }),
      });
      setForm(emptyForm);
      setSelectedTeamIds([]);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create number");
    } finally {
      setSaving(false);
    }
  }

  async function syncTemplates(numberId: string) {
    await apiJson(`/api/numbers/${numberId}/templates/sync`, { method: "POST" }).catch((err) =>
      alert(err instanceof Error ? err.message : "Template sync failed"),
    );
    alert("Templates synced.");
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500">Existing numbers</h2>
        <div className="space-y-3">
          {numbers.map((n) => (
            <div key={n.id} className="rounded border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{n.label}</div>
                  <div className="text-sm text-gray-500">{n.displayPhoneNumber}</div>
                </div>
                <button onClick={() => syncTemplates(n.id)} className="text-sm text-green-700 hover:underline">
                  Sync templates
                </button>
              </div>
              <div className="mt-2 flex gap-3 text-xs text-gray-500">
                <span>WhatsApp: {n.whatsappStatus}</span>
                <span>Voice: {n.voiceEnabled ? "enabled" : "disabled"}</span>
                <span>Teams: {n.teamIds.length}</span>
              </div>
            </div>
          ))}
          {numbers.length === 0 && <p className="text-sm text-gray-400">No numbers configured yet.</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 rounded border border-gray-200 p-4">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Add a number</h2>
        {(
          [
            ["label", "Label"],
            ["displayPhoneNumber", "Display phone number (E.164)"],
            ["whatsappPhoneNumberId", "WhatsApp phone_number_id"],
            ["whatsappWabaId", "WhatsApp WABA id"],
            ["whatsappAccessToken", "WhatsApp access token"],
            ["twilioAccountSid", "Twilio Account SID"],
            ["twilioAuthToken", "Twilio Auth Token"],
            ["twilioPhoneSid", "Twilio Phone SID"],
            ["twilioTwimlAppSid", "Twilio TwiML App SID"],
            ["twilioApiKeySid", "Twilio API Key SID"],
            ["twilioApiKeySecret", "Twilio API Key Secret"],
          ] as const
        ).map(([key, labelText]) => (
          <label key={key} className="block text-sm">
            <span className="mb-1 block text-gray-600">{labelText}</span>
            <input
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-green-500 focus:outline-none"
            />
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.voiceEnabled}
            onChange={(e) => setForm((f) => ({ ...f, voiceEnabled: e.target.checked }))}
          />
          Voice (Twilio) enabled
        </label>
        <div>
          <span className="mb-1 block text-sm text-gray-600">Teams with access</span>
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => (
              <label key={t.id} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={selectedTeamIds.includes(t.id)}
                  onChange={(e) =>
                    setSelectedTeamIds((prev) =>
                      e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id),
                    )
                  }
                />
                {t.name}
              </label>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create number"}
        </button>
      </form>
    </div>
  );
}
