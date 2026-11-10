import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { Globe } from 'lucide-react';
import { type SupportedLang, translatePhrase } from './dictionary';

interface LanguageContextValue {
  lang: SupportedLang;
  setLang: (lang: SupportedLang) => void;
}

const STORAGE_KEY = 'pms_ui_lang';

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
});

export function useLanguage() {
  return useContext(LanguageContext);
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT', 'SVG', 'PATH']);

interface TextCache {
  raw: string;
  rendered: string;
}

interface AttrCache {
  placeholder?: { raw: string; rendered: string };
  title?: { raw: string; rendered: string };
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<SupportedLang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'my' || saved === 'th' || saved === 'en' ? saved : 'en';
  });

  const textMapRef = useRef(new WeakMap<Text, TextCache>());
  const attrMapRef = useRef(new WeakMap<Element, AttrCache>());
  const isApplyingRef = useRef(false);

  const setLang = (next: SupportedLang) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  };

  useEffect(() => {
    document.documentElement.lang = lang;

    const shouldSkipElement = (el: Element | null): boolean => {
      if (!el) return true;
      if (SKIP_TAGS.has(el.tagName.toUpperCase())) return true;
      if (el.closest('[data-no-translate="true"]')) return true;
      return false;
    };

    const translateTextNode = (node: Text) => {
      const parent = node.parentElement;
      if (shouldSkipElement(parent)) return;

      const currentVal = node.nodeValue ?? '';
      if (!currentVal.trim()) return;

      const cached = textMapRef.current.get(node);
      // If React updated the node underneath us, refresh raw English source
      const rawSource = cached && cached.rendered === currentVal ? cached.raw : currentVal;
      const nextVal = lang === 'en' ? rawSource : translatePhrase(rawSource, lang);

      textMapRef.current.set(node, { raw: rawSource, rendered: nextVal });
      if (node.nodeValue !== nextVal) {
        node.nodeValue = nextVal;
      }
    };

    const translateElementAttrs = (el: Element) => {
      if (shouldSkipElement(el)) return;
      const cached: AttrCache = attrMapRef.current.get(el) || {};

      const ph = el.getAttribute('placeholder');
      if (ph && ph.trim()) {
        const rawPh = cached.placeholder && cached.placeholder.rendered === ph ? cached.placeholder.raw : ph;
        const nextPh = lang === 'en' ? rawPh : translatePhrase(rawPh, lang);
        cached.placeholder = { raw: rawPh, rendered: nextPh };
        if (ph !== nextPh) el.setAttribute('placeholder', nextPh);
      }

      const title = el.getAttribute('title');
      if (title && title.trim()) {
        const rawTitle = cached.title && cached.title.rendered === title ? cached.title.raw : title;
        const nextTitle = lang === 'en' ? rawTitle : translatePhrase(rawTitle, lang);
        cached.title = { raw: rawTitle, rendered: nextTitle };
        if (title !== nextTitle) el.setAttribute('title', nextTitle);
      }

      attrMapRef.current.set(el, cached);
    };

    const walkAndTranslate = (root: Node) => {
      if (isApplyingRef.current) return;
      isApplyingRef.current = true;
      try {
        if (root.nodeType === Node.TEXT_NODE) {
          translateTextNode(root as Text);
          return;
        }
        if (root.nodeType === Node.ELEMENT_NODE) {
          translateElementAttrs(root as Element);
        }
        const walker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        );
        let current: Node | null = walker.nextNode();
        while (current) {
          if (current.nodeType === Node.TEXT_NODE) {
            translateTextNode(current as Text);
          } else if (current.nodeType === Node.ELEMENT_NODE) {
            translateElementAttrs(current as Element);
          }
          current = walker.nextNode();
        }
      } finally {
        isApplyingRef.current = false;
      }
    };

    walkAndTranslate(document.body);

    let rafId: number | null = null;
    const scheduleFullPass = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        walkAndTranslate(document.body);
      });
    };

    const observer = new MutationObserver((mutations) => {
      if (isApplyingRef.current) return;
      let hasChanges = false;
      for (const m of mutations) {
        if (m.type === 'characterData' || (m.type === 'childList' && m.addedNodes.length > 0)) {
          hasChanges = true;
          break;
        }
      }
      if (hasChanges) {
        scheduleFullPass();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

const LANG_OPTIONS: { code: SupportedLang; buttonLabel: string; fullLabel: string }[] = [
  { code: 'en', buttonLabel: 'English', fullLabel: 'English' },
  { code: 'my', buttonLabel: 'မြန်မာ', fullLabel: 'မြန်မာ (Myanmar)' },
  { code: 'th', buttonLabel: 'ไทย', fullLabel: 'ไทย (Thai)' },
];

export function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const current = LANG_OPTIONS.find((o) => o.code === lang) || LANG_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <div
      ref={menuRef}
      data-no-translate="true"
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Change Language"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          height: 32,
          padding: '0 12px',
          borderRadius: 999,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
          background: 'var(--surface-card, rgba(148, 163, 184, 0.12))',
          color: 'var(--text-primary)',
          border: '1px solid var(--border, rgba(148, 163, 184, 0.25))',
          transition: 'all 0.15s ease',
        }}
      >
        <Globe size={14} style={{ color: 'var(--accent, #10b981)', flexShrink: 0 }} />
        <span>{current.buttonLabel}</span>
        <span style={{ fontSize: 9, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
          ▼
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 165,
            padding: 6,
            borderRadius: 12,
            background: 'var(--surface-card, #1e293b)',
            border: '1px solid var(--border, rgba(148, 163, 184, 0.25))',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.22)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {LANG_OPTIONS.map((opt) => {
            const active = lang === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => {
                  setLang(opt.code);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  textAlign: 'left',
                  background: active ? 'rgba(16, 185, 129, 0.14)' : 'transparent',
                  color: active ? 'var(--accent, #10b981)' : 'var(--text-primary)',
                  transition: 'background 0.12s ease',
                }}
              >
                <span>{opt.fullLabel}</span>
                {active && <span style={{ fontSize: 12, fontWeight: 800 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
