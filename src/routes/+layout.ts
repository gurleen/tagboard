// Tagboard runs as a Tauri desktop application: there is no server to render on
// and every route reaches the database through Tauri IPC in the browser context.
export const ssr = false;
export const prerender = false;
