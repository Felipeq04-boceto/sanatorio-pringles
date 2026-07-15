import React from 'react'

// ── Button ──────────────────────────────────────────────────
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading, children, disabled, style, ...props }: ButtonProps) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    fontFamily: 'inherit', fontWeight: 500, borderRadius: 'var(--radius-sm)',
    border: '1px solid transparent', cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.6 : 1, transition: 'all 0.15s',
    whiteSpace: 'nowrap',
    ...(size === 'sm' ? { padding: '5px 10px', fontSize: '12px' } :
        size === 'lg' ? { padding: '10px 20px', fontSize: '15px' } :
                        { padding: '7px 14px', fontSize: '13px' }),
    ...(variant === 'primary' ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } :
        variant === 'secondary' ? { background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border-2)' } :
        variant === 'danger' ? { background: 'var(--red-600)', color: '#fff', borderColor: 'var(--red-600)' } :
        { background: 'transparent', color: 'var(--text-2)', borderColor: 'transparent' }),
    ...style,
  }
  return (
    <button style={base} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size={14} /> : null}
      {children}
    </button>
  )
}

// ── Badge ───────────────────────────────────────────────────
type BadgeVariant = 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'teal'
export function Badge({ children, variant = 'slate' }: { children: React.ReactNode; variant?: BadgeVariant }) {
  const colors: Record<BadgeVariant, React.CSSProperties> = {
    green: { background: 'var(--green-50)', color: 'var(--green-600)' },
    red:   { background: 'var(--red-50)',   color: 'var(--red-600)' },
    amber: { background: 'var(--amber-50)', color: 'var(--amber-600)' },
    blue:  { background: 'var(--blue-50)',  color: 'var(--blue-700)' },
    teal:  { background: 'var(--teal-50)',  color: 'var(--teal-700)' },
    slate: { background: 'var(--slate-100)', color: 'var(--slate-600)' },
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '99px',
      fontSize: '11px', fontWeight: 500, letterSpacing: '0.02em',
      ...colors[variant]
    }}>
      {children}
    </span>
  )
}

// ── Input / Select / Textarea ───────────────────────────────
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }
export function Input({ label, error, style, ...props }: InputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-2)' }}>{label}</label>}
      <input
        style={{
          padding: '8px 10px', borderRadius: 'var(--radius-sm)',
          border: `1px solid ${error ? 'var(--red-500)' : 'var(--border-2)'}`,
          background: 'var(--surface)', color: 'var(--text)',
          outline: 'none', width: '100%', transition: 'border-color 0.15s',
          ...style
        }}
        {...props}
      />
      {error && <span style={{ fontSize: '11px', color: 'var(--red-600)' }}>{error}</span>}
    </div>
  )
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }
export function Select({ label, error, children, style, ...props }: SelectProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-2)' }}>{label}</label>}
      <select
        style={{
          padding: '8px 10px', borderRadius: 'var(--radius-sm)',
          border: `1px solid ${error ? 'var(--red-500)' : 'var(--border-2)'}`,
          background: 'var(--surface)', color: 'var(--text)',
          outline: 'none', width: '100%', cursor: 'pointer',
          ...style
        }}
        {...props}
      >
        {children}
      </select>
      {error && <span style={{ fontSize: '11px', color: 'var(--red-600)' }}>{error}</span>}
    </div>
  )
}

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }
export function Textarea({ label, style, ...props }: TextareaProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-2)' }}>{label}</label>}
      <textarea
        style={{
          padding: '8px 10px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-2)', background: 'var(--surface)',
          color: 'var(--text)', outline: 'none', width: '100%',
          resize: 'vertical', minHeight: '80px', fontFamily: 'inherit',
          ...style
        }}
        {...props}
      />
    </div>
  )
}

// ── Card ────────────────────────────────────────────────────
export function Card({ children, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
      ...style
    }} {...props}>
      {children}
    </div>
  )
}

// ── Table ───────────────────────────────────────────────────
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        {children}
      </table>
    </div>
  )
}
export function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th style={{
      padding: '10px 14px', textAlign: 'left',
      fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em',
      color: 'var(--text-3)', background: 'var(--slate-50)',
      borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
      ...style
    }}>{children}</th>
  )
}
export function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{
      padding: '11px 14px',
      borderBottom: '1px solid var(--border)',
      color: 'var(--text)', verticalAlign: 'middle',
      ...style
    }}>{children}</td>
  )
}

// ── Modal ───────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 520 }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number
}) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: width,
          maxHeight: '90vh', overflow: 'auto'
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid var(--border)'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: '50%', border: 'none',
            background: 'var(--slate-100)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px', color: 'var(--text-2)'
          }}>×</button>
        </div>
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  )
}

// ── Stat Card ───────────────────────────────────────────────
export function StatCard({ label, value, sub, color = 'var(--blue-600)' }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <Card style={{ padding: '20px 24px' }}>
      <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', color: 'var(--text-3)', marginBottom: '8px' }}>
        {label.toUpperCase()}
      </p>
      <p style={{ fontSize: '28px', fontWeight: 600, color, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '6px' }}>{sub}</p>}
    </Card>
  )
}

// ── Spinner ─────────────────────────────────────────────────
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid var(--border)`,
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0
    }} />
  )
}

// ── Empty state ─────────────────────────────────────────────
export function Empty({ message = 'Sin datos para mostrar' }: { message?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 20px', gap: '12px',
      color: 'var(--text-3)'
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
      </svg>
      <p style={{ fontSize: '13px' }}>{message}</p>
    </div>
  )
}

// Global keyframes (injected once)
if (!document.getElementById('ui-keyframes')) {
  const s = document.createElement('style')
  s.id = 'ui-keyframes'
  s.textContent = '@keyframes spin { to { transform: rotate(360deg) } }'
  document.head.appendChild(s)
}
