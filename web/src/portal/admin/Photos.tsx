import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, type BlockImage } from '../api';

const BLOCKS = ['A', 'B', 'C'];

export default function AdminPhotos() {
  const [images, setImages] = useState<BlockImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    api
      .get<{ blockImages: BlockImage[] }>('/admin/block-images')
      .then((res) => setImages(res.blockImages))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/admin/block-images', {
        block: form.get('block'),
        url: form.get('url'),
        caption: form.get('caption') || undefined,
      });
      (e.target as HTMLFormElement).reset();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add photo. Make sure the URL is valid.');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteImage(id: string) {
    await api.delete(`/admin/block-images/${id}`);
    load();
  }

  const grouped = useMemo(() => {
    const map = new Map<string, BlockImage[]>();
    for (const img of images ?? []) {
      const list = map.get(img.block) ?? [];
      list.push(img);
      map.set(img.block, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [images]);

  return (
    <div className="portal-page">
      <p className="eyebrow">Photos</p>
      <h1>Block Photo Library</h1>
      <p className="portal-page-lede">
        Photos added here appear on the matching block's page in the resident portal.
      </p>

      <form className="portal-request-panel" onSubmit={handleCreate} style={{ marginBottom: 44 }}>
        <div className="portal-inline-form">
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="block">Block</label>
              <select id="block" name="block" defaultValue="A">
                {BLOCKS.map((b) => (
                  <option key={b} value={b}>
                    Block {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="caption">Caption</label>
              <input id="caption" name="caption" placeholder="Optional" />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="url">Image URL</label>
            <input id="url" name="url" type="url" placeholder="https://…" required />
          </div>
          {error && <div className="note-card">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add Photo'}
          </button>
        </div>
      </form>

      {grouped.map(([block, imgs]) => (
        <div key={block} style={{ marginBottom: 32 }}>
          <p className="portal-booking-step" style={{ marginTop: 0 }}>
            Block {block}
          </p>
          <div className="admin-photo-grid">
            {imgs.map((img) => (
              <figure key={img.id} className="admin-photo-tile">
                <img src={img.url} alt={img.caption ?? `Block ${img.block}`} />
                <figcaption>
                  <span>{img.caption ?? '—'}</span>
                  <button type="button" className="admin-delete-link" onClick={() => deleteImage(img.id)}>
                    Delete
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
      {grouped.length === 0 && <p className="portal-empty-note">No photos added yet.</p>}
    </div>
  );
}
