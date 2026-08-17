import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export interface ComboBoxOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  options: ComboBoxOption[];
  /** Called as the user types, for server-side search. Omit for local filtering. */
  onSearch?: (term: string) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  emptyText?: string;
  id?: string;
}

export default function ComboBox({
  value, onChange, options, onSearch,
  placeholder = 'Search…', loading = false, disabled = false,
  emptyText = 'No matches', id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  /** Remembered so the label survives a search that no longer returns it. */
  const [picked, setPicked] = useState<ComboBoxOption | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `${id || 'combo'}-list`;

  const selected = useMemo(
    () => options.find((o) => o.id === value) || (picked?.id === value ? picked : null),
    [options, value, picked],
  );

  // With onSearch the server already filtered; otherwise filter locally.
  const visible = useMemo(() => {
    if (onSearch || !term) return options;
    const t = term.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(t) || o.sublabel?.toLowerCase().includes(t),
    );
  }, [options, term, onSearch]);

  useEffect(() => { setActive(0); }, [visible.length]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setTerm('');
    onSearch?.('');
  };

  const pick = (o: ComboBoxOption) => {
    setPicked(o);
    onChange(o.id);
    close();
  };

  const clear = () => {
    setPicked(null);
    onChange('');
    setTerm('');
    onSearch?.('');
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return (next + visible.length) % Math.max(visible.length, 1);
      });
    } else if (e.key === 'Enter') {
      if (open && visible[active]) { e.preventDefault(); pick(visible[active]); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); close(); }
    } else if (e.key === 'Tab') {
      if (open) close();
    }
  };

  return (
    <div className={`combobox ${disabled ? 'is-disabled' : ''}`} ref={wrapRef}>
      <div className="combobox-control" onClick={() => !disabled && (setOpen(true), inputRef.current?.focus())}>
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && visible[active] ? `${listId}-${visible[active].id}` : undefined}
          autoComplete="off"
          disabled={disabled}
          className="combobox-input"
          placeholder={selected ? selected.label : placeholder}
          value={open ? term : selected?.label || ''}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
            onSearch?.(e.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        {value && !disabled ? (
          <button type="button" className="combobox-clear" onClick={clear} aria-label="Clear selection">
            <X size={13} />
          </button>
        ) : (
          <ChevronDown size={14} className="combobox-caret" aria-hidden="true" />
        )}
      </div>

      {open && (
        <ul className="combobox-list" id={listId} role="listbox">
          {loading && <li className="combobox-empty">Loading…</li>}
          {!loading && visible.length === 0 && <li className="combobox-empty">{emptyText}</li>}
          {!loading && visible.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${o.id}`}
              role="option"
              aria-selected={o.id === value}
              className={`combobox-option ${i === active ? 'active' : ''} ${o.id === value ? 'selected' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
            >
              <span className="combobox-option-label">{o.label}</span>
              {o.sublabel && <span className="combobox-option-sub">{o.sublabel}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
