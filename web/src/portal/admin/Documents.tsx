import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, mediaUrl, type GvDocument } from '../api';
import EmptyState from '../EmptyState';
import { IconDocument } from '../../components/Icons';

// Building documents for residents: bylaws, meeting minutes, financial summaries, notices. A PDF
// (or an image, such as a scanned notice) is uploaded here and appears at once on the residents'
// Documents page and on their home screen.

const CATEGORIES = ['Governance', 'Minutes', 'Financial', 'Safety', 'Notices'];
const MAX_BYTES = 20 * 1024 * 1024;

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export default function AdminDocuments() {
  const [documents, setDocuments] = useState<GvDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    api
      .get<{ documents: GvDocument[] }>('/admin/documents')
      .then((res) => setDocuments(res.documents))
      .catch((err) => setError(err.message));
  }
  useEffect(load, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return setError('Choose the file to publish.');
    if (file.size > MAX_BYTES) return setError('The file is larger than 20 MB.');
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/admin/documents', { title: form.get('title'), category: form.get('category'), dataUrl: await readAsDataUrl(file) });
      formEl.reset();
      setFile(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not publish the document.');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(d: GvDocument) {
    if (!window.confirm(`Remove "${d.title}" from the resident portal?`)) return;
    await api.delete(`/admin/documents/${d.id}`);
    load();
  }

  const grouped = useMemo(() => {
    const map = new Map<string, GvDocument[]>();
    for (const d of documents ?? []) map.set(d.category, [...(map.get(d.category) ?? []), d]);
    return Array.from(map.entries());
  }, [documents]);

  return (
    <div className="portal-page">
      <p className="eyebrow">Documents</p>
      <h1>Building Documents</h1>
      <p className="portal-page-lede">Publish bylaws, meeting minutes, financial summaries and notices. Residents can open them from their portal.</p>

      <form className="portal-request-panel" onSubmit={submit}>
        <div className="portal-inline-form">
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" required maxLength={140} placeholder="e.g. General assembly minutes, June 2026" />
            </div>
            <div className="form-field">
              <label htmlFor="category">Category</label>
              <select id="category" name="category" defaultValue="Governance">
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="file">File</label>
            <input id="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            <small className="ad-hint">PDF, JPEG, PNG or WebP, up to 20 MB.</small>
          </div>
          {error && <div className="note-card">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Publishing…' : 'Publish to residents'}
          </button>
        </div>
      </form>

      {documents && documents.length === 0 && (
        <EmptyState icon={<IconDocument size={22} />} title="Nothing published yet">
          Published documents are listed here by category. Residents see them immediately.
        </EmptyState>
      )}

      {grouped.map(([category, docs]) => (
        <div key={category} style={{ marginBottom: 28 }}>
          <p className="portal-booking-step" style={{ marginTop: 0 }}>
            {category}
          </p>
          <ul className="ad-doc-list">
            {docs.map((d) => (
              <li key={d.id}>
                <IconDocument size={18} />
                <a href={mediaUrl(d.fileUrl)} target="_blank" rel="noreferrer">
                  <strong>{d.title}</strong>
                  <span>Published {new Date(d.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </a>
                <button type="button" className="admin-delete-link" onClick={() => remove(d)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
