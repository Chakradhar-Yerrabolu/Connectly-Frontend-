'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { API, getAccessToken } from '../lib/api';
import { THEMES, useTheme } from '../providers';

export function Avatar({ name, size = 40, online, className = '', pictureKey }: { name?: string | null; size?: number; online?: boolean; className?: string; pictureKey?: string | null }) {
  const initials = (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const palette = ['a', 'b', 'c', 'd', 'e', 'f'];
  const tone = palette[(name || '?').charCodeAt(0) % palette.length];
  const [imageUrl, setImageUrl] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (pictureKey) {
      fetch(`${API}/api/v1/users/avatar/${encodeURIComponent(pictureKey)}`, { headers: { Authorization: `Bearer ${getAccessToken() || ''}` }, credentials: 'include' })
        .then((response) => response.ok ? response.blob() : Promise.reject(new Error('avatar unavailable')))
        .then((blob) => { objectUrl = URL.createObjectURL(blob); if (active) setImageUrl(objectUrl); })
        .catch(() => { if (active) setImageUrl(''); });
    } else setImageUrl('');
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [pictureKey]);
  return (
    <span className={`avatar avatar-${tone} ${online ? 'is-online' : ''} ${className}`} style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }} aria-hidden="true">
      {imageUrl ? <img src={imageUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit'}} /> : initials}
      {online !== undefined && <span className={`presence-dot ${online ? 'online' : 'offline'}`} />}
    </span>
  );
}

export function Badge({ count, label }: { count?: number; label?: string }) {
  if (!count || count < 1) return null;
  return (
    <span className="badge" aria-label={label || `${count} unread`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function EmptyState({ icon = 'spark', title, description, action }: { icon?: IconName; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href]');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const timer = setTimeout(() => panelRef.current?.querySelector<HTMLElement>('input, textarea, select')?.focus() || panelRef.current?.querySelector<HTMLElement>('button')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(timer);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panelRef} className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = THEMES.find((option) => option.id === theme) || THEMES[0];
  const icon = theme === 'dark' ? 'moon' : theme === 'github' ? 'github' : 'sun';

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`theme-toggle ${compact ? 'compact' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`icon-button theme-trigger ${open ? 'active' : ''}`}
        aria-label={`Theme: ${current.label}. Choose a theme`}
        title={`Theme: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={icon} size={19} />
      </button>
      {open && (
        <div className="theme-popover" role="menu" aria-label="Color theme">
          <span className="theme-popover-label">Theme</span>
          {THEMES.map((option) => {
            const optionIcon = option.id === 'dark' ? 'moon' : option.id === 'github' ? 'github' : 'sun';
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={theme === option.id}
                className={`theme-popover-option ${theme === option.id ? 'selected' : ''}`}
                onClick={() => {
                  setTheme(option.id);
                  setOpen(false);
                }}
              >
                <Icon name={optionIcon} size={17} />
                <span>{option.label}</span>
                {theme === option.id && <Icon name="check" size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
