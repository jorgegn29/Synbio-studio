'use client';

import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { chooseLang, readStoredLang, translate, translateLine, writeLang, type Lang } from '../../../../client/src/locale';

const LocaleContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({
  lang: 'en',
  setLang: () => {},
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === 'undefined') return 'en';
    return chooseLang(readStoredLang(), window.navigator.language);
  });
  const setLang = useCallback((next: Lang) => {
    writeLang(next);
    setLangState(next);
    if (typeof document !== 'undefined') document.documentElement.lang = next;
  }, []);
  useLayoutEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function LanguageSwitch() {
  const { lang, setLang } = useLocale();
  return (
    <span className="lang-switch" role="group" aria-label={lang === 'en' ? 'Language' : 'Idioma'}>
      <button type="button" className={lang === 'es' ? 'on' : ''} aria-pressed={lang === 'es'} onClick={() => setLang('es')}>ES</button>
      <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
    </span>
  );
}

const SKIP = 'textarea, input, script, style, code, svg, .code-card, .monaco-editor, .lang-switch, [contenteditable="true"]';

function skipNode(node: Node): boolean {
  const el = node.parentElement;
  if (!el) return true;
  return Boolean(el.closest(SKIP));
}

export function applyDomLocale(root: ParentNode, lang: Lang) {
  if (lang !== 'en') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    texts.push(current as Text);
    current = walker.nextNode();
  }
  for (const text of texts) {
    if (skipNode(text)) continue;
    const inLog = Boolean(text.parentElement?.closest('.bottom pre'));
    const next = inLog
      ? text.data.split('\n').map(line => translateLine(line, 'en')).join('\n')
      : translateLine(text.data, 'en');
    if (next !== text.data) text.data = next;
  }
  root.querySelectorAll<HTMLElement>('[placeholder], [title], [aria-label]').forEach(el => {
    if (el.closest('.lang-switch, .monaco-editor, .code-card')) return;
    (['placeholder', 'title', 'aria-label'] as const).forEach(attr => {
      const value = el.getAttribute(attr);
      if (!value) return;
      const next = translate(value, 'en');
      if (next !== value) el.setAttribute(attr, next);
    });
  });
}

export function useDomLocale(rootRef: React.RefObject<HTMLElement | null>) {
  const { lang } = useLocale();
  const applying = useRef(false);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || lang !== 'en') return;
    const run = () => {
      if (applying.current) return;
      applying.current = true;
      try {
        applyDomLocale(root, lang);
      } finally {
        applying.current = false;
      }
    };
    run();
    const observer = new MutationObserver(() => {
      queueMicrotask(run);
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label'],
    });
    return () => observer.disconnect();
  }, [lang, rootRef]);
}
