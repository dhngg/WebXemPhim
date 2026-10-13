import axios from 'axios';
import { API_PREFIX } from '@rental/shared';

export const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || `/${API_PREFIX}`,
  timeout: 8000,
  headers: { Accept: 'application/json' },
});
