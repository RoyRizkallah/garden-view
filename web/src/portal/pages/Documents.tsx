import { useEffect, useMemo, useState } from 'react';
import { api, mediaUrl, type GvDocument } from '../api';
import { shortDate } from '../format';
import PageHeader from '../PageHeader';
import { IconDocument, IconMail, IconSparkle, IconPieChart, IconChevronRight, IconArrowRight } from '../../components/Icons';
import { categoryRank } from '../../data/documentCategories';

const CATEGORY_ICON: Record<string, typeof IconDocument> = {
  'Quarterly letters': IconMail,
  Updates: IconSparkle,
  Budget: IconPieChart,
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

  // the quarterly letters, then the updates, then anything filed under an older category; newest first
  const grouped = useMemo(() => {
    const map = new Map<string, GvDocument[]>();
    for (const document of documents ?? []) {
      const list = map.get(document.category) ?? [];
      list.push(document);
      map.set(document.category, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Array.from(map.entries()).sort(([a], [b]) => categoryRank(a) - categoryRank(b));
  }, [documents]);

  const latestLetter = grouped.find(([category]) => category === 'Quarterly letters')?.[1].find((d) => d.fileUrl) ?? null;

  return (
    <div className="rs-page">
      <PageHeader
        kicker="Documents"
        title="Building documents"
        lede="The quarterly letters, updates and budget from building management, to open or download."
      />

      {latestLetter && (
        <a className="rs-letter" href={mediaUrl(latestLetter.fileUrl)} target="_blank" rel="noreferrer">
          <span className="rs-letter-icon">
            <IconMail size={22} />
          </span>
          <span className="rs-letter-text">
            <span className="rs-letter-label">Latest quarterly letter</span>
            <strong>{latestLetter.title}</strong>
            <span>Published {shortDate(latestLetter.createdAt)}</span>
          </span>
          <span className="rs-letter-open">
            Open <IconArrowRight size={15} />
          </span>
        </a>
      )}

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
            Building management publishes the quarterly letters, updates and budget here. You will be able to open
            and download each one.
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
