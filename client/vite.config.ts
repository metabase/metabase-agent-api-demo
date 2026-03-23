import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");

  return {
    plugins: [react()],
    server: {
      port: parseInt(env.CLIENT_PORT || "4010"),
      proxy: {
        "/api": `http://localhost:${env.SERVER_PORT || "4011"}`,
      },
    },
  };
});
