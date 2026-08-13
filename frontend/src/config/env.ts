const apiUrl = import.meta.env.VITE_API_URL;
export const env = {
  apiUrl: apiUrl ?? 'http://localhost:3000/api',
};
