const apiUrl = import.meta.env.VITE_API_URL;
export const env = {
  apiUrl: import.meta.env.PROD ? '/api' : (apiUrl ?? 'http://localhost:3000/api'),
};
