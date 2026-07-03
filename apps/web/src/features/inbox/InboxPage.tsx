import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { ConversationDTO, MessageDTO } from "@whatsapp-dashboard/shared";
import { SOCKET_EVENTS } from "@whatsapp-dashboard/shared";
import { apiJson } from "../../lib/api";
import { useSocket } from "../../lib/socket";
import type { LayoutContext } from "../../app/Layout";

function ConversationList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: ConversationDTO[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto border-r border-gray-200">
      {conversations.length === 0 && <div className="p-4 text-sm text-gray-400">No conversations yet.</div>}
      {conversations.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`block w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${
            activeId === c.id ? "bg-green-50" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900">{c.contactName ?? c.contactWaId}</span>
            {c.status !== "open" && <span className="text-xs uppercase text-gray-400">{c.status}</span>}
          </div>
          <div className="text-xs text-gray-500">{c.contactWaId}</div>
        </button>
      ))}
    </div>
  );
}

function MessageThread({ conversation, messages }: { conversation: ConversationDTO; messages: MessageDTO[] }) {
  const sessionOpen = conversation.sessionExpiresAt ? new Date(conversation.sessionExpiresAt) > new Date() : false;

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-md rounded-lg px-3 py-2 text-sm ${
                m.direction === "outbound" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-900"
              }`}
            >
              {m.messageType === "template" && (
                <div className="mb-1 text-xs opacity-70">Template: {m.templateName}</div>
              )}
              {m.body && <div>{m.body}</div>}
              {m.mediaLocalPath && !m.body && <div className="italic opacity-70">[{m.messageType} attachment]</div>}
              {m.status === "failed" && <div className="mt-1 text-xs text-red-300">Failed: {m.errorMessage}</div>}
            </div>
          </div>
        ))}
      </div>
      {!sessionOpen && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          The 24-hour session window has closed. Send an approved template message to re-engage this contact.
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  const { selectedNumberId } = useOutletContext<LayoutContext>();
  const { conversationId } = useParams();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDTO | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!selectedNumberId) return;
    const data = await apiJson<{ conversations: ConversationDTO[] }>(
      `/api/numbers/${selectedNumberId}/conversations`,
    );
    setConversations(data.conversations);
  }, [selectedNumberId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!conversationId) {
      setActiveConversation(null);
      setMessages([]);
      return;
    }
    apiJson<{ conversation: ConversationDTO }>(`/api/conversations/${conversationId}`).then((d) =>
      setActiveConversation(d.conversation),
    );
    apiJson<{ messages: MessageDTO[] }>(`/api/conversations/${conversationId}/messages`).then((d) =>
      setMessages(d.messages),
    );
  }, [conversationId]);

  const socket = useSocket(Boolean(selectedNumberId));
  useEffect(() => {
    if (!socket) return;
    const onNew = (payload: { conversationId: string }) => {
      loadConversations();
      if (payload.conversationId === conversationId) {
        apiJson<{ messages: MessageDTO[] }>(`/api/conversations/${conversationId}/messages`).then((d) =>
          setMessages(d.messages),
        );
      }
    };
    const onStatus = () => {
      if (conversationId) {
        apiJson<{ messages: MessageDTO[] }>(`/api/conversations/${conversationId}/messages`).then((d) =>
          setMessages(d.messages),
        );
      }
    };
    socket.on(SOCKET_EVENTS.MESSAGE_NEW, onNew);
    socket.on(SOCKET_EVENTS.MESSAGE_STATUS, onStatus);
    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, onNew);
      socket.off(SOCKET_EVENTS.MESSAGE_STATUS, onStatus);
    };
  }, [socket, conversationId, loadConversations]);

  async function sendMessage() {
    if (!conversationId || !draft.trim()) return;
    setSending(true);
    try {
      await apiJson(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ type: "text", body: draft }),
      });
      setDraft("");
      const d = await apiJson<{ messages: MessageDTO[] }>(`/api/conversations/${conversationId}/messages`);
      setMessages(d.messages);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid h-full grid-cols-[320px_1fr] overflow-x-auto">
      <ConversationList
        conversations={conversations}
        activeId={conversationId}
        onSelect={(id) => navigate(`/inbox/${id}`)}
      />
      {activeConversation ? (
        <div className="flex flex-col">
          <MessageThread conversation={activeConversation} messages={messages} />
          <div className="flex gap-2 border-t border-gray-200 p-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message…"
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !draft.trim()}
              className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center text-gray-400">Select a conversation</div>
      )}
    </div>
  );
}
