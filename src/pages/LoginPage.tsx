import React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(email, password)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: u } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
        if (u?.rol === 'empleado' || u?.rol === 'insumos') {
          navigate('/mi-portal')
        } else if (['administrativo','enfermeria','instrumentadora','referente_empleados','referente_enfermeria','referente_instrumentadores','mediador'].includes(u?.rol ?? '')) {
          navigate('/mi-portal')
        } else if (['rrhh'].includes(u?.rol ?? '')) {
          navigate('/')
        } else {
          navigate('/')
        }
      } else {
        navigate('/')
      }
    } catch {
      setError('Email o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--slate-900)', padding: '20px'
    }}>
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--surface)', borderRadius: 'var(--radius-xl)',
        padding: '40px', boxShadow: 'var(--shadow-lg)'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <div style={{
            width: 44, height: 44, borderRadius: '10px', background: 'var(--blue-600)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', color: '#fff', fontWeight: 700
          }}>+</div>
          <div>
            <p style={{ fontWeight: 700, fontSize: '16px' }}>Sanatorio Pringles</p>
            <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>Sistema de gestión</p>
          </div>
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>Iniciar sesión</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '24px' }}>
          Ingresá con tu cuenta institucional
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="usuario@pringles.com"
            required
          />
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          {error && (
            <p style={{ fontSize: '12px', color: 'var(--red-600)', background: 'var(--red-50)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
              {error}
            </p>
          )}
          <Button type="submit" loading={loading} size="lg" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}>
            Ingresar
          </Button>
        </form>
      </div>
    </div>
  )
}
