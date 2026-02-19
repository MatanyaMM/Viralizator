import { useState, useCallback } from 'react';

const API_BASE = '/api';

export function useApi() {
  const [loading, setLoading] = useState(false);

  const request = useCallback(async <T>(
    path: string,
    options?: RequestInit
  ): Promise<{ success: boolean; data?: T; error?: string }> => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const json = await res.json();
      return json;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' };
    } finally {
      setLoading(false);
    }
  }, []);

  const get = useCallback(<T>(path: string) => request<T>(path), [request]);

  const post = useCallback(<T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }), [request]);

  const put = useCallback(<T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }), [request]);

  const del = useCallback(<T>(path: string) =>
    request<T>(path, { method: 'DELETE' }), [request]);

  return { get, post, put, del, loading };
}
