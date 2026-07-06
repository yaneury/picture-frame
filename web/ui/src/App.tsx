import { useEffect, useRef, useState } from 'react';
import {
  ChevronRight, ChevronDown, Folder, FolderOpen,
  HardDrive, CheckCircle2, Loader2, Monitor, RefreshCw, Wifi,
  Trash2, Upload, ImageOff, FolderPlus, Check, X,
} from 'lucide-react';
import {
  DirNode, FileInfo, SyncStatus,
  getTree, getState, setState, triggerSync, getSyncStatus,
  listFiles, imageUrl, uploadFiles, deleteFile, createDirectory, deleteDirectory,
} from './api';

function TreeNode({
  node, depth, activeDir, selectedDir, hoveredPath, pendingDir,
  onHover, onSetPending, onSelect, onDeleteDir,
}: {
  node: DirNode;
  depth: number;
  activeDir: string | null;
  selectedDir: string | null;
  hoveredPath: string | null;
  pendingDir: string | null;
  onHover: (p: string | null) => void;
  onSetPending: (p: string) => void;
  onSelect: (p: string) => void;
  onDeleteDir: (p: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isActive = node.path === activeDir;
  const isSelected = node.path === selectedDir;
  const isHovered = node.path === hoveredPath;
  const isPending = node.path === pendingDir;
  const hasChildren = node.children.length > 0;
  const isLeaf = node.image_count > 0 || !hasChildren;

  const bg = isPending
    ? 'rgba(234,179,8,0.12)'
    : isActive
    ? 'rgba(59,130,246,0.18)'
    : isSelected
    ? 'rgba(99,102,241,0.15)'
    : isHovered
    ? 'rgba(255,255,255,0.04)'
    : 'transparent';

  const borderLeft = isPending
    ? '2px solid #eab308'
    : isActive
    ? '2px solid #3b82f6'
    : isSelected
    ? '2px solid #6366f1'
    : '2px solid transparent';

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center',
          paddingLeft: `${depth * 16 + 8}px`, paddingRight: '8px',
          height: '32px', backgroundColor: bg, borderLeft,
          cursor: 'pointer', transition: 'background-color 0.1s ease',
        }}
        onMouseEnter={() => onHover(node.path)}
        onMouseLeave={() => onHover(null)}
        onClick={() => {
          onSelect(node.path);
          if (hasChildren) setOpen(o => !o);
        }}
      >
        <div
          style={{ width: 16, marginRight: 4, flexShrink: 0 }}
          onClick={e => { e.stopPropagation(); if (hasChildren) setOpen(o => !o); }}
        >
          {hasChildren
            ? open
              ? <ChevronDown size={12} style={{ color: '#6b7280' }} />
              : <ChevronRight size={12} style={{ color: '#6b7280' }} />
            : null}
        </div>
        <div style={{ marginRight: 6, flexShrink: 0 }}>
          {open && hasChildren
            ? <FolderOpen size={14} style={{ color: isActive ? '#60a5fa' : isSelected ? '#818cf8' : '#6b7280' }} />
            : <Folder size={14} style={{ color: isActive ? '#60a5fa' : isSelected ? '#818cf8' : '#4b5563' }} />}
        </div>
        <span style={{
          flex: 1, fontSize: '12px', fontFamily: "'Inter', sans-serif",
          fontWeight: isActive || isSelected ? 500 : 400,
          color: isActive ? '#e2e8f0' : isSelected ? '#c7d2fe' : '#94a3b8',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {node.name}
        </span>
        {node.image_count > 0 && (
          <span style={{ fontSize: '10px', color: '#374151', marginRight: 6, flexShrink: 0, fontFamily: 'monospace' }}>
            {node.image_count}
          </span>
        )}
        {isActive && (
          <span style={{
            fontSize: '9px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(59,130,246,0.25)', borderRadius: '3px',
            padding: '1px 5px', marginRight: 6, flexShrink: 0,
          }}>ACTIVE</span>
        )}
        {isPending && (
          <span style={{
            fontSize: '9px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: '#eab308', backgroundColor: 'rgba(234,179,8,0.12)',
            border: '1px solid rgba(234,179,8,0.25)', borderRadius: '3px',
            padding: '1px 5px', flexShrink: 0,
          }}>PENDING</span>
        )}
        {isHovered && !isPending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {!isActive && isLeaf && (
              <button
                onClick={e => { e.stopPropagation(); onSetPending(node.path); }}
                style={{
                  fontSize: '10px', fontWeight: 500, color: '#64748b',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px',
                  padding: '1px 7px', cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                }}
              >Set Active</button>
            )}
            <button
              onClick={e => { e.stopPropagation(); onDeleteDir(node.path); }}
              style={{ display: 'flex', alignItems: 'center', padding: '2px 4px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#4b5563', borderRadius: '3px' }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
      {open && hasChildren && node.children.map(child => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          activeDir={activeDir}
          selectedDir={selectedDir}
          hoveredPath={hoveredPath}
          pendingDir={pendingDir}
          onHover={onHover}
          onSetPending={onSetPending}
          onSelect={onSelect}
          onDeleteDir={onDeleteDir}
        />
      ))}
    </div>
  );
}

function ImageCard({ file, onDeleted }: { file: FileInfo; onDeleted: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteFile(file.path);
      onDeleted();
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div
      style={{ position: 'relative', aspectRatio: '1', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#161b22', border: '1px solid #21262d' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (!deleting) setConfirming(false); }}
    >
      {file.previewable ? (
        <img
          src={imageUrl(file.path)}
          alt={file.name}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ImageOff size={22} style={{ color: '#374151' }} />
          <span style={{ fontSize: '10px', color: '#374151', fontFamily: 'monospace', textTransform: 'uppercase' }}>
            {file.name.split('.').pop()}
          </span>
        </div>
      )}

      {confirming ? (
        <div style={{
          position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span style={{ fontSize: '11px', color: '#e2e8f0', fontFamily: "'Inter', sans-serif", textAlign: 'center', padding: '0 8px' }}>
            Delete this photo?
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setConfirming(false)}
              style={{ fontSize: '11px', color: '#6b7280', backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid #374151', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer' }}
            >Cancel</button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ fontSize: '11px', color: '#fff', backgroundColor: deleting ? '#7f1d1d' : '#dc2626', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: deleting ? 'default' : 'pointer' }}
            >{deleting ? '…' : 'Delete'}</button>
          </div>
        </div>
      ) : hovered && (
        <button
          onClick={() => setConfirming(true)}
          style={{
            position: 'absolute', top: 5, right: 5,
            backgroundColor: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '4px', padding: '4px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Trash2 size={12} style={{ color: '#f87171' }} />
        </button>
      )}

      {hovered && !confirming && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
          padding: '16px 6px 5px',
        }}>
          <span style={{ fontSize: '10px', color: '#9ca3af', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
            {file.name}
          </span>
        </div>
      )}
    </div>
  );
}

function formatName(path: string) {
  return path.split('/').filter(Boolean).pop() ?? path;
}

function formatPath(path: string, sourceRoot: string) {
  const rel = path.startsWith(sourceRoot) ? path.slice(sourceRoot.length) : path;
  return rel.split('/').filter(Boolean).join(' / ');
}

export function App() {
  const [tree, setTree] = useState<DirNode | null>(null);
  const [activeDir, setActiveDir] = useState<string | null>(null);
  const [sourceRoot, setSourceRoot] = useState('');
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [pendingDir, setPendingDir] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ running: false, last_error: null });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const [newDirName, setNewDirName] = useState<string | null>(null);
  const [creatingDir, setCreatingDir] = useState(false);
  const newDirRef = useRef<HTMLInputElement>(null);

  const [deletingDir, setDeletingDir] = useState<string | null>(null);
  const [confirmingDirDelete, setConfirmingDirDelete] = useState(false);

  const loadAll = () => {
    setLoadError(null);
    Promise.all([getTree(), getState(), getSyncStatus()])
      .then(([t, s, ss]) => {
        setTree(t);
        setSourceRoot(t.path);
        setActiveDir(s.active_directory);
        setSyncStatus(ss);
      })
      .catch(e => setLoadError(e.message));
  };

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (newDirName !== null) newDirRef.current?.focus();
  }, [newDirName]);

  useEffect(() => {
    if (!syncStatus.running) return;
    const id = setInterval(() => {
      getSyncStatus().then(setSyncStatus).catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, [syncStatus.running]);

  const loadFiles = (dir: string) => {
    setFilesLoading(true);
    setFiles([]);
    listFiles(dir)
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setFilesLoading(false));
  };

  const handleSelect = (path: string) => {
    setSelectedDir(path);
    loadFiles(path);
  };

  const handleFileDeleted = (deletedPath: string) => {
    setFiles(f => f.filter(x => x.path !== deletedPath));
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = e.target.files;
    const dir = selectedDir;
    if (!dir || !pickedFiles || pickedFiles.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadFiles(dir, pickedFiles);
      loadFiles(dir);
      loadAll();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  const handleCreateDir = async () => {
    if (newDirName === null || newDirName.trim() === '' || creatingDir) return;
    setCreatingDir(true);
    try {
      const { path } = await createDirectory(newDirName.trim());
      setNewDirName(null);
      await loadAll();
      handleSelect(path);
    } catch { /* ignore */ } finally {
      setCreatingDir(false);
    }
  };

  const handleResync = async () => {
    if (syncStatus.running) return;
    try {
      await triggerSync();
      setSyncStatus({ running: true, last_error: null });
    } catch { /* ignore */ }
  };

  const handleConfirmDirDelete = async () => {
    if (!deletingDir || confirmingDirDelete) return;
    setConfirmingDirDelete(true);
    try {
      await deleteDirectory(deletingDir);
      if (selectedDir === deletingDir) { setSelectedDir(null); setFiles([]); }
      if (activeDir === deletingDir) setActiveDir(null);
      setDeletingDir(null);
      loadAll();
    } catch { /* ignore */ } finally {
      setConfirmingDirDelete(false);
    }
  };

  const handleConfirmSync = async () => {
    if (!pendingDir || confirming) return;
    setConfirming(true);
    try {
      await setState(pendingDir);
      setActiveDir(pendingDir);
      await triggerSync();
      setSyncStatus({ running: true, last_error: null });
      setPendingDir(null);
    } catch (e: unknown) {
      setSyncStatus(s => ({ ...s, last_error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div style={{ height: '100vh', backgroundColor: '#0d1117', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ backgroundColor: '#161b22', borderBottom: '1px solid #21262d', padding: '0 16px', height: '48px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <Monitor size={15} style={{ color: '#4b5563' }} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', letterSpacing: '0.02em' }}>Frame Controller</span>
        <div style={{ width: '1px', height: '18px', backgroundColor: '#21262d' }} />
        {syncStatus.running ? (
          <>
            <Loader2 size={12} style={{ color: '#f59e0b', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 500 }}>Syncing…</span>
          </>
        ) : (
          <>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 5px rgba(34,197,94,0.5)' }} />
            <Wifi size={12} style={{ color: '#4ade80' }} />
            <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: 500 }}>Ready</span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={loadAll}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'transparent', border: '1px solid #21262d', borderRadius: '4px', padding: '3px 9px', cursor: 'pointer', color: '#4b5563', fontSize: '11px' }}
        >
          <RefreshCw size={10} /> Refresh
        </button>
      </div>

      {/* Error banners */}
      {syncStatus.last_error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.3)', padding: '6px 16px', fontSize: '11px', color: '#f87171', flexShrink: 0 }}>
          Sync error: {syncStatus.last_error}
        </div>
      )}
      {loadError && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.3)', padding: '6px 16px', fontSize: '11px', color: '#f87171', flexShrink: 0 }}>
          Failed to load: {loadError}
        </div>
      )}

      {/* Two-panel body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left — directory tree */}
        <div style={{ width: '260px', flexShrink: 0, borderRight: '1px solid #21262d', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Active dir */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #21262d', flexShrink: 0 }}>
            <div style={{ fontSize: '9px', color: '#374151', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '3px' }}>Active Slideshow</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HardDrive size={12} style={{ color: '#3b82f6', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: activeDir ? '#60a5fa' : '#374151', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeDir ? formatName(activeDir) : 'None'}
              </span>
              {activeDir && (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {syncStatus.running
                    ? <Loader2 size={11} style={{ color: '#f59e0b', animation: 'spin 1s linear infinite' }} />
                    : <CheckCircle2 size={11} style={{ color: '#22c55e' }} />
                  }
                  <button
                    onClick={handleResync}
                    disabled={syncStatus.running}
                    title="Re-sync active folder to frame"
                    style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '10px', color: syncStatus.running ? '#374151' : '#64748b', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', borderRadius: '3px', padding: '2px 6px', cursor: syncStatus.running ? 'default' : 'pointer' }}
                  >
                    <RefreshCw size={9} /> Sync
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tree */}
          <div style={{ flex: 1, overflowY: 'auto', paddingTop: '6px' }}>
            <div style={{ padding: '4px 8px 4px 10px', marginBottom: '2px', display: 'flex', alignItems: 'center' }}>
              <span style={{ flex: 1, fontSize: '9px', color: '#374151', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', paddingLeft: '14px' }}>Directories</span>
              <button
                onClick={() => setNewDirName(prev => prev === null ? '' : null)}
                title="New folder"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', border: 'none', padding: '3px', cursor: 'pointer', color: '#374151', borderRadius: '3px' }}
              >
                <FolderPlus size={13} />
              </button>
            </div>

            {newDirName !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', marginBottom: '2px' }}>
                <Folder size={13} style={{ color: '#6366f1', flexShrink: 0 }} />
                <input
                  ref={newDirRef}
                  value={newDirName}
                  onChange={e => setNewDirName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateDir();
                    if (e.key === 'Escape') setNewDirName(null);
                  }}
                  placeholder="Folder name…"
                  style={{
                    flex: 1, fontSize: '12px', backgroundColor: 'rgba(99,102,241,0.1)',
                    border: '1px solid rgba(99,102,241,0.3)', borderRadius: '4px',
                    padding: '3px 6px', color: '#c7d2fe', outline: 'none',
                    fontFamily: "'Inter', sans-serif",
                  }}
                />
                <button
                  onClick={handleCreateDir}
                  disabled={creatingDir || newDirName.trim() === ''}
                  style={{ display: 'flex', alignItems: 'center', padding: '3px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#4ade80' }}
                >
                  {creatingDir ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                </button>
                <button
                  onClick={() => setNewDirName(null)}
                  style={{ display: 'flex', alignItems: 'center', padding: '3px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#4b5563' }}
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {tree
              ? tree.children.length > 0
                ? tree.children.map(node => (
                    <TreeNode
                      key={node.path}
                      node={node}
                      depth={0}
                      activeDir={activeDir}
                      selectedDir={selectedDir}
                      hoveredPath={hoveredPath}
                      pendingDir={pendingDir}
                      onHover={setHoveredPath}
                      onSetPending={setPendingDir}
                      onSelect={handleSelect}
                      onDeleteDir={setDeletingDir}
                    />
                  ))
                : <div style={{ padding: '16px', fontSize: '12px', color: '#374151', textAlign: 'center' }}>No subdirectories found</div>
              : !loadError && <div style={{ padding: '16px', fontSize: '12px', color: '#374151', textAlign: 'center' }}>Loading…</div>
            }
          </div>
        </div>

        {/* Right — image preview */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedDir ? (
            <>
              {/* Panel header */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <Folder size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatPath(selectedDir, sourceRoot)}
                </span>
                {!filesLoading && (
                  <span style={{ fontSize: '11px', color: '#374151', flexShrink: 0 }}>
                    {files.length} photo{files.length !== 1 ? 's' : ''}
                  </span>
                )}
                <label
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: '11px', fontWeight: 500,
                    color: uploading ? '#374151' : '#94a3b8',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: '1px solid #21262d', borderRadius: '4px',
                    padding: '4px 10px', cursor: uploading ? 'default' : 'pointer', flexShrink: 0,
                  }}
                >
                  {uploading ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={11} />}
                  {uploading ? 'Uploading…' : 'Upload'}
                  <input
                    ref={uploadRef}
                    type="file"
                    multiple
                    accept="image/*"
                    disabled={uploading}
                    style={{ display: 'none' }}
                    onChange={handleUpload}
                  />
                </label>
              </div>

              {/* Upload error */}
              {uploadError && (
                <div style={{ padding: '6px 16px', backgroundColor: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.2)', fontSize: '11px', color: '#f87171', flexShrink: 0 }}>
                  Upload failed: {uploadError}
                </div>
              )}

              {/* Image grid */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                {filesLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                    <Loader2 size={16} style={{ color: '#374151', animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: '12px', color: '#374151' }}>Loading…</span>
                  </div>
                ) : files.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                    <ImageOff size={28} style={{ color: '#1f2937' }} />
                    <span style={{ fontSize: '12px', color: '#374151' }}>No photos in this folder</span>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                    {files.map(file => (
                      <ImageCard
                        key={file.path}
                        file={file}
                        onDeleted={() => handleFileDeleted(file.path)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Folder size={32} style={{ color: '#1f2937' }} />
              <span style={{ fontSize: '13px', color: '#374151' }}>Select a folder to preview</span>
            </div>
          )}
        </div>
      </div>

      {/* Delete directory confirm bar */}
      {deletingDir && (
        <div style={{
          borderTop: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)',
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <Trash2 size={13} style={{ color: '#ef4444', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Delete <span style={{ color: '#fca5a5' }}>{formatName(deletingDir)}</span> and all its photos?
          </span>
          <button
            onClick={() => setDeletingDir(null)}
            style={{ fontSize: '11px', color: '#6b7280', backgroundColor: 'transparent', border: '1px solid #21262d', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer' }}
          >Cancel</button>
          <button
            onClick={handleConfirmDirDelete}
            disabled={confirmingDirDelete}
            style={{ fontSize: '11px', color: '#fff', backgroundColor: confirmingDirDelete ? '#7f1d1d' : '#dc2626', border: 'none', borderRadius: '4px', padding: '4px 14px', cursor: confirmingDirDelete ? 'default' : 'pointer', fontWeight: 500 }}
          >{confirmingDirDelete ? 'Deleting…' : 'Delete Folder'}</button>
        </div>
      )}

      {/* Confirm bar */}
      {pendingDir && (
        <div style={{
          borderTop: '1px solid #21262d', backgroundColor: '#161b22',
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <HardDrive size={13} style={{ color: '#eab308', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Sync <span style={{ color: '#e2e8f0' }}>{formatPath(pendingDir, sourceRoot)}</span> to frame?
          </span>
          <button
            onClick={() => setPendingDir(null)}
            style={{ fontSize: '11px', color: '#6b7280', backgroundColor: 'transparent', border: '1px solid #21262d', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer' }}
          >Cancel</button>
          <button
            onClick={handleConfirmSync}
            disabled={confirming}
            style={{ fontSize: '11px', color: '#fff', backgroundColor: confirming ? '#1d4ed8' : '#3b82f6', border: 'none', borderRadius: '4px', padding: '4px 14px', cursor: confirming ? 'default' : 'pointer', fontWeight: 500 }}
          >{confirming ? 'Starting…' : 'Confirm Sync'}</button>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; background: transparent; }
        ::-webkit-scrollbar-thumb { background: #21262d; border-radius: 2px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
