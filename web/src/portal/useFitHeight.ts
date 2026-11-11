import { useLayoutEffect, useRef, useState } from 'react';

const DESKTOP = '(min-width: 881px)';

/**
 * The height left in the window below an element, so a page can end with it and not scroll.
 * Undefined on a phone, where the page scrolls and the element takes its own height.
 */
export function useFitHeight<T extends HTMLElement>(minimum = 520, margin = 24) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const measure = () => {
      const element = ref.current;
      if (!element || !window.matchMedia(DESKTOP).matches) {
        setHeight(undefined);
        return;
      }
      const top = element.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(minimum, Math.round(window.innerHeight - top - margin)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [minimum, margin]);
  return [ref, height] as const;
}
