import type { ReactNode } from 'react';
import { CONTACT } from '../data/contact';
import { IconMail, IconMapPin, IconPhone, IconWhatsapp } from './Icons';

export type ContactItem = { key: string; icon: ReactNode; label: string; value: string; href?: string };

/** The contact details that are set in data/contact.ts, as links; nothing when none are set. */
export function contactItems(iconSize = 18): ContactItem[] {
  const items: ContactItem[] = [];
  if (CONTACT.phone) items.push({ key: 'phone', icon: <IconPhone size={iconSize} />, label: 'Call us', value: CONTACT.phone, href: `tel:${CONTACT.phone.replace(/[^\d+]/g, '')}` });
  if (CONTACT.email) items.push({ key: 'email', icon: <IconMail size={iconSize} />, label: 'Email us', value: CONTACT.email, href: `mailto:${CONTACT.email}` });
  if (CONTACT.whatsapp) items.push({ key: 'whatsapp', icon: <IconWhatsapp size={iconSize} />, label: 'WhatsApp', value: 'Chat on WhatsApp', href: `https://wa.me/${CONTACT.whatsapp.replace(/\D/g, '')}` });
  if (CONTACT.office) items.push({ key: 'office', icon: <IconMapPin size={iconSize} />, label: 'Office', value: CONTACT.office });
  return items;
}
