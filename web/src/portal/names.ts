// Names in the owner directory come as registered: "Mr. Mostafa Berri", "Mrs. Iman Mamlouk",
// "Mr. Antoine Aoun & Mrs Sandra Aoun", "Mr. Walid Rabbat / Mr. Samir Rabbat". The portal greets
// people the way a building would address them: "Mr. Berri"; without a title, by first name.

const TITLES = /^(mr|mrs|ms|miss|dr|eng|me|sheikh|prof)\.?$/i;

/** The first person named, when a unit is registered to several ("A & B", "A / B", "A - B"). */
export function primaryName(full: string): string {
  return full.split(/\s+(?:&|and|\/|-)\s+|\s*\/\s*/i)[0].trim();
}

/** "Mr. Berri" for "Mr. Mostafa Berri", "Rola" for "Rola Haddad". */
export function greetingName(full: string | null | undefined): string {
  if (!full) return '';
  const words = primaryName(full).split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (TITLES.test(words[0])) {
    const title = words[0].replace(/\.?$/, '.').replace(/^./, (c) => c.toUpperCase());
    const surname = words.length > 1 ? words[words.length - 1] : '';
    return surname ? `${title} ${surname}` : '';
  }
  return words[0];
}

/** One or two initials for an avatar, skipping titles: "Mr. Mostafa Berri" -> "MB". */
export function initials(full: string | null | undefined): string {
  if (!full) return '?';
  const words = primaryName(full)
    .split(/\s+/)
    .filter((w) => w && !TITLES.test(w));
  if (words.length === 0) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}
