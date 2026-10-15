// The panel and the output both render in the browser. The panel reaches the
// database through remote commands and the output through its own endpoints, so
// there is nothing for the server to render ahead of time.
export const ssr = false;
export const prerender = false;
