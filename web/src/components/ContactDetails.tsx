import { contactItems } from './contactItems';

/** A compact list (icon + value); renders nothing until a detail is set. */
export default function ContactDetails({ className, itemClassName, iconSize }: { className: string; itemClassName?: string; iconSize?: number }) {
  const items = contactItems(iconSize);
  if (items.length === 0) return null;
  return (
    <div className={className}>
      {items.map((i) =>
        i.href ? (
          <a key={i.key} className={itemClassName} href={i.href} target={i.key === 'whatsapp' ? '_blank' : undefined} rel="noreferrer">
            {i.icon}
            <span>{i.value}</span>
          </a>
        ) : (
          <div key={i.key} className={itemClassName}>
            {i.icon}
            <span>{i.value}</span>
          </div>
        ),
      )}
    </div>
  );
}
