import { useState } from "react";
import NumbersAdmin from "./NumbersAdmin";
import TeamsAdmin from "./TeamsAdmin";
import UsersAdmin from "./UsersAdmin";

const TABS = [
  { key: "numbers", label: "Numbers", component: NumbersAdmin },
  { key: "teams", label: "Teams", component: TeamsAdmin },
  { key: "users", label: "Users", component: UsersAdmin },
] as const;

export default function AdminPage() {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("numbers");
  const ActiveComponent = TABS.find((t) => t.key === active)!.component;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`px-4 py-2 text-sm font-medium ${
              active === t.key ? "border-b-2 border-green-600 text-green-700" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ActiveComponent />
    </div>
  );
}
