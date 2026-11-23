const API_BASE = 'http://localhost:8000'

export async function apiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  const data = text ? (JSON.parse(text) as T | { detail?: unknown }) : null
  if (!response.ok) {
    const detail =
      data && typeof data === 'object' && 'detail' in data
        ? String(data.detail)
        : `Request failed (${response.status})`
    throw new Error(detail)
  }
  return data as T
}
