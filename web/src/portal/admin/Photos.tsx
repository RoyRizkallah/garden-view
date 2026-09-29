import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, mediaUrl, type BlockImage } from '../api';
import { preparePhoto, PhotoPrepError, ACCEPTED_TYPES } from '../preparePhoto';
import EmptyState from '../EmptyState';
import { IconImage } from '../../components/Icons';

// Extra photos of a block for its residents (new works, a refurbished lobby...). Residents already
// see their block's professional photos and film on My Residence; these are added alongside.
// Photos are resized in the browser before upload, like owners' listing photos.

const BLOCKS = ['A', 'B', 'C'] as const;

export default function AdminPhotos() {
  const [images, setImages] = useState<BlockImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [block, setBlock] = useState<(typeof BLOCKS)[number]>('A');
  const [caption, setCaption] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function load() {
    api
      .get<{ blockImages: BlockImage[] }>('/admin/block-images')
      .then((res) => setImages(res.blockImages))
      .catch((err) => setError(err.message));
  }
  useEffect(load, []);

  async function upload(files: FileList) {
    setError(null);
    const list = [...files];
    setProgress({ done: 0, total: list.length });
    const problems: string[] = [];
    for (const [i, file] of list.entries()) {
      try {
        const photo = await preparePhoto(file);
        await api.post('/admin/block-images', { block, dataUrl: photo.dataUrl, caption: caption.trim() || undefined });
      } catch (err) {
        problems.push(err instanceof PhotoPrepError || err instanceof ApiError ? err.message : `"${file.name}" could not be uploaded.`);
      }
      setProgress({ done: i + 1, total: list.length });
    }
    setProgress(null);
    setCaption('');
    if (problems.length) setError(problems.join(' '));
    load();
  }

  async function remove(id: string) {
    await api.delete(`/admin/block-images/${id}`);
    load();
  }

  const grouped = useMemo(() => {
    const map = new Map<string, BlockImage[]>();
    for (const img of images ?? []) map.set(img.block, [...(map.get(img.block) ?? []), img]);
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [images]);

  return (
    <div className="portal-page">
      <p className="eyebrow">Photos</p>
      <h1>Block Photos</h1>
      <p className="portal-page-lede">
        Residents already see their block's professional photos and film. Add more here, such as finished works or a
        refurbished lobby, and they appear on My Residence for that block.
      </p>

      <div className="portal-request-panel ad-upload">
        <div className="portal-inline-form">
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="block">Block</label>
              <select id="block" value={block} onChange={(e) => setBlock(e.target.value as (typeof BLOCKS)[number])}>
                {BLOCKS.map((b) => (
                  <option key={b} value={b}>
                    Block {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="caption">Caption</label>
              <input id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={140} placeholder="e.g. New lobby lighting, 2026" />
            </div>
          </div>
          <button type="button" className="ad-drop" onClick={() => input.current?.click()} disabled={!!progress}>
            <IconImage size={22} />
            <strong>{progress ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : 'Choose photos to upload'}</strong>
            <span>JPEG, PNG or WebP · resized automatically</span>
          </button>
          <input
            ref={input}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files);
              e.target.value = '';
            }}
          />
          {error && <div className="note-card">{error}</div>}
        </div>
      </div>

      {images && images.length === 0 && (
        <EmptyState icon={<IconImage size={22} />} title="No extra photos yet">
          Photos you upload appear here, grouped by block.
        </EmptyState>
      )}

      {grouped.map(([b, imgs]) => (
        <div key={b} style={{ marginBottom: 32 }}>
          <p className="portal-booking-step" style={{ marginTop: 0 }}>
            Block {b} · {imgs.length} {imgs.length === 1 ? 'photo' : 'photos'}
          </p>
          <div className="admin-photo-grid">
            {imgs.map((img) => (
              <figure key={img.id} className="admin-photo-tile">
                <img src={mediaUrl(img.url)} alt={img.caption ?? `Block ${img.block}`} loading="lazy" decoding="async" />
                <figcaption>
                  <span>{img.caption ?? 'No caption'}</span>
                  <button type="button" className="admin-delete-link" onClick={() => remove(img.id)}>
                    Delete
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
