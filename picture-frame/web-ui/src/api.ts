export interface DirNode {
  name: string;
  path: string;
  image_count: number;
  children: DirNode[];
}

export interface FrameState {
  active_directory: string | null;
}

export interface SyncStatus {
  running: boolean;
  last_error: string | null;
}

const check = async (r: Response) => {
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try { const body = await r.json(); if (body?.error) msg = body.error; } catch {}
    throw new Error(msg);
  }
  return r;
};

export const getTree = (): Promise<DirNode> =>
  fetch('/api/tree').then(check).then(r => r.json());

export const getState = (): Promise<FrameState> =>
  fetch('/api/state').then(check).then(r => r.json());

export const setState = (active_directory: string): Promise<void> =>
  fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active_directory }),
  }).then(check).then(() => undefined);

export const triggerSync = (): Promise<void> =>
  fetch('/api/sync', { method: 'POST' }).then(r => {
    if (!r.ok && r.status !== 409) throw new Error(`${r.status} ${r.statusText}`);
  });

export const getSyncStatus = (): Promise<SyncStatus> =>
  fetch('/api/sync/status').then(check).then(r => r.json());

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  previewable: boolean;
}

export const listFiles = (dir: string): Promise<FileInfo[]> =>
  fetch(`/api/files?dir=${encodeURIComponent(dir)}`).then(check).then(r => r.json());

export const imageUrl = (path: string): string =>
  `/api/image?path=${encodeURIComponent(path)}`;

export const uploadFiles = (dir: string, files: FileList): Promise<{ saved: string[] }> => {
  const form = new FormData();
  for (const file of files) form.append('file', file);
  return fetch(`/api/upload?dir=${encodeURIComponent(dir)}`, {
    method: 'POST',
    body: form,
  }).then(check).then(r => r.json());
};

export const deleteFile = (path: string): Promise<void> =>
  fetch(`/api/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
    .then(check).then(() => undefined);

export const createDirectory = (name: string): Promise<{ path: string }> =>
  fetch('/api/directory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then(check).then(r => r.json());
