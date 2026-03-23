import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./App.css";

async function bootstrap(): Promise<void> {
  const rootEl = document.getElementById("root")!;
  rootEl.textContent = "Loading…";

  let res: Response;
  try {
    res = await fetch("/api/config");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    rootEl.textContent = `Failed to reach /api/config: ${msg}`;
    return;
  }

  if (!res.ok) {
    const detail = await res.text();
    rootEl.textContent = `Config failed (${res.status}): ${detail || res.statusText}`;
    return;
  }

  const data = (await res.json()) as { metabaseInstanceUrl?: string };
  const instanceUrl = data.metabaseInstanceUrl?.trim();
  if (!instanceUrl) {
    rootEl.textContent = "Invalid /api/config: missing metabaseInstanceUrl.";
    return;
  }

  window.metabaseConfig = {
    instanceUrl,
    preferredAuthMethod: "jwt",
    fetchRequestToken: async () => {
      const response = await fetch("/api/embed-token", { credentials: "include" });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `Embed JWT failed (${response.status}): ${detail || response.statusText}`,
        );
      }
      return response.json() as Promise<{ jwt: string }>;
    },
  };

  const embedScript = document.createElement("script");
  embedScript.src = `${instanceUrl}/app/embed.js`;
  embedScript.addEventListener("load", () => {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
  embedScript.addEventListener("error", () => {
    rootEl.textContent =
      `Failed to load Metabase embed from ${embedScript.src}. Check METABASE_INSTANCE_URL and CORS.`;
  });
  document.head.appendChild(embedScript);
}

void bootstrap();
