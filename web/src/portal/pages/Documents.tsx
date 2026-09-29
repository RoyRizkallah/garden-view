import { useEffect, useMemo, useState } from 'react';
import { api, type GvDocument } from '../api';
import Photo from '../../components/Photo';
import {
  IconDocument,
  IconClipboard,
  IconBuilding,
  IconShield,
  IconPieChart,
  IconChevronRight,
} from '../../components/Icons';

// the fade image is 58% of the portal main column (viewport − 264 px sidebar − 2 × 56 px padding)
const FADE_IMAGE_SIZES = '(max-width: 960px) calc(58vw - 28px), calc(58vw - 218px)';

const CATEGORY_ICON: Record<string, typeof IconBuilding> = {
  Governance: IconBuilding,
  Safety: IconShield,
  Financial: IconPieChart,
};

export default function Documents() {
  const [documents, setDocuments] = useState<GvDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ documents: GvDocument[] }>('/resident/documents')
      .then((res) => setDocuments(res.documents))
      .catch((err) => setError(err.message));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, GvDocument[]>();
    for (const d of documents ?? []) {
      const list = map.get(d.category) ?? [];
      list.push(d);
      map.set(d.category, list);
    }
    return Array.from(map.entries());
  }, [documents]);

  return (
    <div className="portal-page">
      <div className="portal-page-hero-fade">
        <Photo src="/images/shoot/block-b-2.jpg" alt="" sizes={FADE_IMAGE_SIZES} priority />
        <div className="portal-page-hero-fade-content">
          <p className="eyebrow">
            <IconClipboard size={14} />
            Documents
          </p>
          <h1>Shared Building Documents</h1>
          <p className="portal-page-lede" style={{ marginTop: 0 }}>
            Important resources and policies for our community.
          </p>
        </div>
      </div>

      {error && <div className="note-card">{error}</div>}

      {grouped.map(([category, docs]) => {
        const CategoryIcon = CATEGORY_ICON[category] ?? IconDocument;
        return (
          <div key={category} style={{ marginBottom: 32 }}>
            <div className="portal-doc-category-head">
              <span className="portal-doc-category-icon">
                <CategoryIcon size={16} />
              </span>
              <p>{category}</p>
            </div>
            <div className="portal-doc-list">
              {docs.map((d) => (
                <div key={d.id} className="portal-doc-row">
                  <IconDocument size={18} />
                  <div>
                    <strong>{d.title}</strong>
                    <span>Added {new Date(d.createdAt).toLocaleDateString()}</span>
                  </div>
                  <IconChevronRight size={16} className="portal-doc-row-arrow" />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
