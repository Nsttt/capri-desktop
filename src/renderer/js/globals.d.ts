// What the preload script (src/preload.ts) puts on window, and the --dev handles app.ts adds.
interface Window {
  host: any;
  dev?: Record<string, unknown>;
}

// A button on one of her panels (panel.ts).
interface PanelAction {
  id: string;
  label: string;
  primary?: boolean;
  [more: string]: unknown;
}
