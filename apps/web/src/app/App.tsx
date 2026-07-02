import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../lib/auth";
import Login from "./Login";
import Layout from "./Layout";
import InboxPage from "../features/inbox/InboxPage";
import CallsPage from "../features/calls/CallsPage";
import AdminPage from "../features/admin/AdminPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-full items-center justify-center text-gray-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="inbox" replace />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="inbox/:conversationId" element={<InboxPage />} />
        <Route path="calls" element={<CallsPage />} />
        <Route path="admin/*" element={<AdminPage />} />
      </Route>
    </Routes>
  );
}
