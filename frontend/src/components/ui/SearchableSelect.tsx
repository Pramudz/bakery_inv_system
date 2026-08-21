import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type SearchableSelectOption = {
  value: string | number;
  label: string;
  code?: string;
};

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  emptyMessage: string;
  required?: boolean;
  clearLabel?: string;
  selectedLabel?: string;
  disabled?: boolean;
};

export function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  emptyMessage,
  required,
  clearLabel,
  selectedLabel,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selected = options.find((option) => String(option.value) === value);
  const selectedText = selected?.label ?? selectedLabel ?? "";
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      `${option.label} ${option.code ?? ""}`.toLocaleLowerCase().includes(needle),
    );
  }, [options, query]);
  const choices: Array<SearchableSelectOption & { clear?: boolean }> = [
    ...(clearLabel ? [{ value: "", label: clearLabel, clear: true }] : []),
    ...filtered,
  ];

  const positionMenu = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = Math.min(244, 44 + choices.length * 38);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const showAbove = spaceBelow < Math.min(menuHeight, 180) && rect.top > spaceBelow;
    setMenuStyle({
      position: "fixed",
      left: rect.left,
      top: showAbove ? Math.max(8, rect.top - menuHeight - 5) : rect.bottom + 5,
      width: rect.width,
      maxHeight: showAbove ? Math.max(120, rect.top - 13) : Math.max(120, spaceBelow),
      zIndex: 2000,
    });
  };

  const openMenu = () => {

    if (disabled) return;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  };

  const choose = (option: SearchableSelectOption & { clear?: boolean }) => {
    onChange(String(option.value));
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    positionMenu();
    const reposition = () => positionMenu();
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!inputRef.current?.parentElement?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [open, choices.length]);

  useEffect(() => {
    if (activeIndex >= choices.length) setActiveIndex(Math.max(0, choices.length - 1));
  }, [activeIndex, choices.length]);

  return <div className="field searchable-select-field">
    <label htmlFor={`${listboxId}-input`}>{label}{required && <span className="required">*</span>}</label>
    <div className="searchable-select-control">
      <input
        ref={inputRef}
        id={`${listboxId}-input`}
        className="control"
        disabled={disabled}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={!disabled && open}
        aria-controls={listboxId}
        aria-activedescendant={open && choices[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
        value={open ? query : selectedText}
        placeholder={placeholder}
        required={required && !value}
        autoComplete="off"
        onClick={() => { if (!open) openMenu(); }}
        onFocus={() => { if (!open) openMenu(); }}
        onChange={(event) => { if (!open) setOpen(true); setQuery(event.target.value); setActiveIndex(0); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); setQuery(""); return; }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) { openMenu(); return; }
            if (!choices.length) return;
            setActiveIndex((index) => event.key === "ArrowDown" ? (index + 1) % choices.length : (index - 1 + choices.length) % choices.length);
            return;
          }
          if (event.key === "Enter" && open && choices[activeIndex]) { event.preventDefault(); choose(choices[activeIndex]); }
        }}
      />
      <button type="button" className="searchable-select-toggle"  disabled={disabled} aria-label={`${open ? "Close" : "Open"} ${label}`} onMouseDown={(event) => event.preventDefault()} onClick={() => open ? setOpen(false) : openMenu()}>⌄</button>
    </div>
    {open && createPortal(
      <div ref={menuRef} id={listboxId} className="searchable-select-menu" role="listbox" style={menuStyle}>
        {choices.map((option, index) => <button
          type="button"
          id={`${listboxId}-${index}`}
          role="option"
          aria-selected={String(option.value) === value}
          className={`searchable-select-option${index === activeIndex ? " active" : ""}${option.clear ? " clear" : ""}`}
          key={option.clear ? "clear" : String(option.value)}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(option)}
        >
          <span>{option.label}</span>{option.code && <small>{option.code}</small>}
        </button>)}
        {filtered.length === 0 && <div className="searchable-select-empty">{emptyMessage}</div>}
      </div>,
      document.body,
    )}
  </div>;
}
