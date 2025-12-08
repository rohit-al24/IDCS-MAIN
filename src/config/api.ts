// Central place to manage backend API URL

// Change this value to update the backend link everywhere
export const BACKEND_BASE_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ||
  'https://idcs-main-kucq.onrender.com'; // fallback default now points to Render backend
