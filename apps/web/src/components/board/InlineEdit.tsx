"use client";

import { useState } from "react";

/** Text that turns into an input on click; commits on Enter/blur, cancels on Escape. */
export function InlineEdit({
  value,
  onCommit,
  className = "",
  inputClassName = "",
  maxLength = 200,
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  inputClassName?: string;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <button type="button" onClick={() => setDraft(value)} className={`truncate text-left ${className}`} title="Renommer">
        {value}
      </button>
    );
  }

  const commit = () => {
    const next = draft.trim();
    setDraft(null);
    if (next && next !== value) onCommit(next);
  };

  return (
    <input
      autoFocus
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
      onFocus={(e) => e.target.select()}
      className={`min-w-0 rounded-md border border-indigo-400 bg-slate-950 px-2 py-0.5 outline-none ${inputClassName}`}
    />
  );
}

/** "+ Add …" button that expands into a textarea; stays open after submit for fast entry. */
export function Composer({
  label,
  placeholder,
  onSubmit,
  className = "",
}: {
  label: string;
  placeholder: string;
  onSubmit: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-200 ${className}`}
      >
        + {label}
      </button>
    );
  }

  const submit = () => {
    if (value.trim()) onSubmit(value.trim());
    setValue("");
  };

  return (
    <div className={className}>
      <textarea
        autoFocus
        rows={2}
        value={value}
        maxLength={200}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => !value.trim() && setOpen(false)}
        className="w-full resize-none rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400"
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={submit}
          className="rounded-md bg-indigo-500 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-400"
        >
          Ajouter
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-white">
          Annuler
        </button>
      </div>
    </div>
  );
}
