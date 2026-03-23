import { useState, useEffect, useRef, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const TOOL_LABELS: Record<string, string> = {
  search_data_sources: "Searching for data sources",
  get_table_details: "Inspecting table",
  get_metric_details: "Inspecting metric",
  get_field_values: "Fetching field values",
  run_query: "Running query",
};

type EntityNames = { tables: Record<number, string>; metrics: Record<number, string> };

function extractEntityNames(messages: UIMessage[], into: EntityNames): void {
  for (const msg of messages) {
    for (const part of msg.parts ?? []) {
      if (!("output" in part) || !part.output) continue;
      const output = part.output as Record<string, unknown>;

      // Extract from search results
      if (Array.isArray(output.tables)) {
        for (const t of output.tables) {
          if (t.id && t.name) into.tables[t.id] = t.name;
        }
      }
      if (Array.isArray(output.metrics)) {
        for (const m of output.metrics) {
          if (m.id && m.name) into.metrics[m.id] = m.name;
        }
      }

      // Extract from table/metric detail responses
      if (output.id && output.name) {
        const toolName = part.type?.replace("tool-", "");
        if (toolName === "get_table_details") {
          into.tables[output.id as number] = output.name as string;
        } else if (toolName === "get_metric_details") {
          into.metrics[output.id as number] = output.name as string;
        }
      }
    }
  }
}

function getToolDetail(
  toolName: string,
  input: Record<string, unknown> | undefined,
  entityNames: EntityNames,
): string | null {
  if (!input) return null;
  switch (toolName) {
    case "search_data_sources": {
      const terms = [
        ...((input.term_queries as string[]) ?? []),
        ...((input.semantic_queries as string[]) ?? []),
      ];
      return terms.length > 0 ? terms.map((t) => `"${t}"`).join(", ") : null;
    }
    case "get_table_details": {
      const id = input.table_id as number;
      return entityNames.tables[id] ?? null;
    }
    case "get_metric_details": {
      const id = input.metric_id as number;
      return entityNames.metrics[id] ?? null;
    }
    default:
      return null;
  }
}

function ToolCallStatus({
  toolName,
  state,
  input,
  entityNames,
}: {
  toolName: string;
  state: string;
  input?: Record<string, unknown>;
  entityNames: EntityNames;
}) {
  const label = TOOL_LABELS[toolName] ?? toolName;
  const detail = getToolDetail(toolName, input, entityNames);
  const done = state === "output-available" || state === "output-error";

  return (
    <div className={`tool-card ${done ? "done" : "pending"}`}>
      <span className="tool-card-label">{label}</span>
      {detail && <span className="tool-card-detail">{detail}</span>}
    </div>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const entityNamesRef = useRef<EntityNames>({ tables: {}, metrics: {} });

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );

  const { messages, sendMessage, status, stop, error } = useChat({ transport });

  const isLoading = status === "streaming" || status === "submitted";
  extractEntityNames(messages, entityNamesRef.current);
  const entityNames = entityNamesRef.current;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <div className="app-shell">
      <header className="app-top-header">
        <div className="app-top-header-left">
          <img
            className="app-header-mark"
            src="/appice-logo-square.png"
            alt="Appice"
            width={36}
            height={36}
          />
          <div className="app-header-titles">
            <h1>Appice Analytics Browser</h1>
            <p>Explore and visualize your data in real-time</p>
          </div>
        </div>
        <div className="app-top-header-right app-header">
          <img
            className="app-header-mark"
            src="/appice-icon.png"
            alt=""
            width={36}
            height={36}
          />
          <div className="app-header-titles">
            <h1>Appice Agent</h1>
            <p>Ask questions about your data</p>
          </div>
        </div>
      </header>

      <div className="app-main">
        <section className="appice-pane" aria-label="Appice Analytics Browser">
          <metabase-browser initial-collection="root" read-only="false" />
        </section>

        <div className="chat-pane">
        <div className="messages">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-label">
              {message.role === "user" ? "You" : "Agent"}
            </div>
            <div className="message-body">
              {message.parts?.map((part, i) => {
                if (part.type === "text") {
                  return part.text.length > 0 ? (
                    <Markdown key={`${i}-${part.text.length}`} remarkPlugins={[remarkGfm]}>
                      {part.text}
                    </Markdown>
                  ) : null;
                }
                if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
                  const toolName = part.type === "dynamic-tool"
                    ? (part as { toolName: string }).toolName
                    : part.type.replace("tool-", "");
                  const state = ("state" in part ? part.state : "input-available") as string;
                  const toolInput = ("input" in part ? part.input : undefined) as Record<string, unknown> | undefined;
                  return (
                    <ToolCallStatus
                      key={`${i}-${part.type}`}
                      toolName={toolName}
                      state={state}
                      input={toolInput}
                      entityNames={entityNames}
                    />
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {isLoading && messages.at(-1)?.role === "user" && (
          <div className="message assistant">
            <div className="message-label">Agent</div>
            <div className="message-body thinking">Thinking&hellip;</div>
          </div>
        )}

        {error && (
          <div className="message error">
            <div className="message-label">Error</div>
            <div className="message-body">{error.message}</div>
          </div>
        )}

        <div ref={messagesEndRef} />
        </div>

        <form className="input-area" onSubmit={handleSubmit}>
        <div className={`input-container ${isLoading ? "loading" : ""}`}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your data&#x2026;"
            disabled={isLoading}
          />
          {isLoading ? (
            <button type="button" className="cancel-btn" onClick={stop} aria-label="Cancel">
              &#9632;
            </button>
          ) : (
            <button type="submit" className="send-btn" disabled={!input.trim()} aria-label="Send">
              &#8593;
            </button>
          )}
        </div>
        </form>
        </div>
      </div>
    </div>
  );
}
