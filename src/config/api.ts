// Central place to manage backend API URL

// Change this value to update the backend link everywhere
export const BACKEND_BASE_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ||
  'http://127.0.0.1:4000'; // fallback default
