// The categories building management publishes documents under. The admin upload offers exactly
// these, and the residents' Documents page lists them in this order. Documents published earlier
// under another category keep it and are listed after these.
export const DOCUMENT_CATEGORIES = ['Quarterly letters', 'Updates'] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Orders category names: the current categories first (in list order), then any older ones. */
export function categoryRank(category: string): number {
  const index = (DOCUMENT_CATEGORIES as readonly string[]).indexOf(category);
  return index === -1 ? DOCUMENT_CATEGORIES.length : index;
}
