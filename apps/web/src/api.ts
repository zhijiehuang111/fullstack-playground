import type { User, Post, Comment } from '@app/shared'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || `request failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const usersApi = {
  list: () => request<User[]>('/users'),
  create: (data: { name: string; email: string }) =>
    request<User>('/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; email?: string }) =>
    request<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: number) =>
    request<void>(`/users/${id}`, { method: 'DELETE' }),
}

export const postsApi = {
  list: () => request<Post[]>('/posts'),
  create: (data: { title: string; content: string; authorId: number }) =>
    request<Post>('/posts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { title?: string; content?: string }) =>
    request<Post>(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: number) =>
    request<void>(`/posts/${id}`, { method: 'DELETE' }),
}

export const commentsApi = {
  list: () => request<Comment[]>('/comments'),
  create: (data: { content: string; postId: number; authorId: number }) =>
    request<Comment>('/comments', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { content?: string }) =>
    request<Comment>(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: number) =>
    request<void>(`/comments/${id}`, { method: 'DELETE' }),
}
