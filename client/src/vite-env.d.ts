/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare global {
  interface Window {
    metabaseConfig?: {
      instanceUrl?: string;
      preferredAuthMethod?: string;
      fetchRequestToken?: () => Promise<{ jwt: string }>;
    };
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "metabase-browser": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          "initial-collection"?: string;
          "read-only"?: string;
        },
        HTMLElement
      >;
    }
  }
}

export {};
