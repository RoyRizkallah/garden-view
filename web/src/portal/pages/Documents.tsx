import { useEffect, useMemo, useState } from 'react';
import { api, mediaUrl, type GvDocument } from '../api';
import { shortDate } from '../format';
import PageHeader from '../PageHeader';
import {
  IconDocument,
  IconBuilding,
  IconShield,
  IconPieChart,
  IconChevronRight,
} from '../../components/Icons';

const CATEGORY_ICON: Record<string, typeof IconBuilding> = {
  Governance: IconBuilding,
  Safety: IconShield,
  Financial: IconPieChart,
};

function fileType(url: string) {
  if (!url) return 'Pending';
  if (/\.pdf$/i.test(url)) return 'PDF';
  if (/\.(jpe?g|png|webp|avif)$/i.test(url)) return 'Image';
  return 'File';
}

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
    for (const document of documents ?? []) {
      const list = map.get(document.category) ?? [];
      list.push(document);
      map.set(document.category, list);
    }
    return Array.from(map.entries());
  }, [documents]);

  return (
    <div className="rs-page">
      <PageHeader
        kicker="Documents"
        title="Building documents"
        lede="Bylaws, safety guidance, financial summaries and anything else the building shares with residents."
      />

      {error && (
        <div className="rs-note">
          <IconDocument size={15} />
          <span>{error}</span>
        </div>
      )}

      {!documents && !error && (
        <div className="rs-note">
          <IconDocument size={15} />
          <span>Loading documents…</span>
        </div>
      )}

      {documents && documents.length === 0 && (
        <div className="rs-empty">
          <span className="rs-empty-icon">
            <IconDocument size={20} />
          </span>
          <h2>No documents published yet</h2>
          <p>
            Building management publishes the bylaws, meeting minutes, safety guidelines and financial
            summaries here. You will be able to open and download each one.
          </p>
        </div>
      )}

      {grouped.map(([category, docs]) => {
        const CategoryIcon = CATEGORY_ICON[category] ?? IconDocument;
        return (
          <section key={category} className="rs-doc-group">
            <div className="rs-doc-head">
              <span>
                <CategoryIcon size={14} />
              </span>
              <p>{category}</p>
            </div>

            <div className="rs-doc-list">
              {docs.map((document) => {
                const type = fileType(document.fileUrl);
                const body = (
                  <>
                    <span className="rs-doc-icon">
                      <IconDocument size={17} />
                    </span>
                    <div>
                      <strong>{document.title}</strong>
                      <span>Added {shortDate(document.createdAt)}</span>
                    </div>
                    <span className="rs-doc-type">{type}</span>
                    {document.fileUrl && <IconChevronRight size={16} />}
                  </>
                );

                return document.fileUrl ? (
                  <a
                    key={document.id}
                    className="rs-doc"
                    href={mediaUrl(document.fileUrl)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {body}
                  </a>
                ) : (
                  <div key={document.id} className="rs-doc" style={{ opacity: 0.7 }}>
                    {body}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
