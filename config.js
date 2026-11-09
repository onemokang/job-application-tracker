// Non-secret config. The actual sync token is NEVER stored here or committed —
// it lives only in your browser's localStorage (entered once per device via
// the "Connect sync" prompt), so it never ends up in this public repo.
const SYNC_CONFIG = {
  owner: "onemokang",
  repo: "job-application-tracker",
  path: "status.json",
  branch: "main",
};
