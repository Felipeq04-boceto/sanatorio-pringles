import React from 'react'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin, type Empleado, type Sector, type Cargo } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/layout/AppLayout'
import { Button, Badge, Card, Table, Th, Td, Input, Select, Modal, Spinner, Empty, Textarea } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'

const ESTADO_BADGE: Record<string, any> = {
  activo: 'green', licencia: 'amber', suspendido: 'red', egresado: 'slate'
}

const CONTRATO_LABEL: Record<string, string> = {
  planta_permanente: 'Planta permanente', contrato: 'Contrato', guardia: 'Guardia',
  pasantia: 'Pasantía', otro: 'Otro'
}

const ROL_LABEL: Record<string, string> = {
  admin:                       'Administrador',
  rrhh:                        'RRHH',
  empleado:                    'Empleado',
  administrativo:              'Administrativo',
  enfermeria:                  'Enfermería',
  instrumentadora:             'Instrumentadora',
  referente_empleados:         'Ref. Empleados',
  referente_enfermeria:        'Ref. Enfermería',
  referente_instrumentadores:  'Ref. Instrumentadores',
  mediador:                    'Mediador',
  lectura:                     'Solo lectura',
  insumos:                     'Insumos',
}

const ROL_BADGE: Record<string, string> = {
  admin:                       'red',
  rrhh:                        'blue',
  empleado:                    'slate',
  administrativo:              'amber',
  enfermeria:                  'green',
  instrumentadora:             'green',
  referente_empleados:         'teal',
  referente_enfermeria:        'teal',
  referente_instrumentadores:  'teal',
  mediador:                    'blue',
  lectura:                     'slate',
  insumos:                     'teal',
}

type Form = Partial<Omit<Empleado, 'id' | 'created_at' | 'updated_at' | 'sectores' | 'cargos'>>

export function EmpleadosPage() {
  const { usuario } = useAuth()
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [sectores,  setSectores]  = useState<Sector[]>([])
  const [cargos,    setCargos]    = useState<Cargo[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [open,      setOpen]      = useState(false)
  const [editing,   setEditing]   = useState<Empleado | null>(null)
  const [form,      setForm]      = useState<Form>({})
  const [saving,    setSaving]    = useState(false)
  const [openAcceso,  setOpenAcceso]  = useState(false)
  const [empAcceso,   setEmpAcceso]   = useState<any>(null)
  const [accesoForm,  setAccesoForm]  = useState<any>({})
  const [savingAcceso,setSavingAcceso]= useState(false)
  const [errorAcceso, setErrorAcceso] = useState<string|null>(null)

  useEffect(() => { loadAll() }, [])

  async function crearAcceso() {
    setErrorAcceso(null)
    if (!empAcceso?.email) { setErrorAcceso('El empleado no tiene email cargado. Editá su ficha primero.'); return }
    if (!accesoForm.password || accesoForm.password.length < 6) { setErrorAcceso('La contraseña debe tener al menos 6 caracteres'); return }
    if (!accesoForm.rol) { setErrorAcceso('Seleccioná un rol'); return }
    setSavingAcceso(true)
    try {
      let userId: string | undefined

      // Crear usuario con signUp
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: empAcceso.email,
        password: accesoForm.password,
      })
      if (signUpErr) {
        if (signUpErr.message.toLowerCase().includes('already registered')) {
          setErrorAcceso('Este email ya tiene una cuenta. Usá la opción de cambiar contraseña.')
        } else {
          setErrorAcceso(`Error: ${signUpErr.message}`)
        }
        return
      }
      userId = signUpData?.user?.id
      if (!userId) { setErrorAcceso('No se pudo crear el usuario. Intentá de nuevo.'); return }

      // Confirmar email automáticamente
      await supabase.rpc('confirmar_usuario_email', { p_email: empAcceso.email })

      // 3. Insertar en tabla usuarios
      const { error: usrErr } = await supabase.from('usuarios').insert({
        id: userId,
        email: empAcceso.email,
        nombre: empAcceso.nombre,
        apellido: empAcceso.apellido,
        rol: accesoForm.rol,
      })
      if (usrErr && !usrErr.message.includes('duplicate')) {
        setErrorAcceso(`Error al crear perfil: ${usrErr.message}`); return
      }

      // 4. Vincular usuario al empleado
      const { error: empErr } = await supabase.from('empleados').update({ usuario_id: userId }).eq('id', empAcceso.id)
      if (empErr) { setErrorAcceso(`Error al vincular: ${empErr.message}`); return }

		// 5. Vincular empleado al usuario (relación inversa)
		const { error: usrLinkErr } = await supabase.from('usuarios').update({ empleado_id: empAcceso.id }).eq('id', userId)
		if (usrLinkErr) { setErrorAcceso(`Error al vincular usuario: ${usrLinkErr.message}`); return }

      alert(`✅ Usuario creado correctamente.\n\nEmail: ${empAcceso.email}\nContraseña: ${accesoForm.password}\nRol: ${accesoForm.rol}`)
      setOpenAcceso(false)
      setAccesoForm({})
      loadAll()
    } finally { setSavingAcceso(false) }
  }

  async function cambiarRol(empId: string, usuarioId: string, nuevoRol: string) {
    setSavingAcceso(true)
    try {
      const { error } = await supabase.from('usuarios').update({ rol: nuevoRol }).eq('id', usuarioId)
      if (error) { setErrorAcceso(`Error al cambiar rol: ${error.message}`); return }
      setOpenAcceso(false)
      loadAll()
    } finally { setSavingAcceso(false) }
  }

  async function cambiarPasswordManual(nuevoPassword: string) {
    if (!empAcceso?.usuario_id) { setErrorAcceso('Este empleado no tiene usuario vinculado'); return }
    if (nuevoPassword.length < 6) { setErrorAcceso('La contraseña debe tener al menos 6 caracteres'); return }
    setSavingAcceso(true)
    try {
      const { error } = await supabase.rpc('cambiar_password_usuario', {
        p_user_id: empAcceso.usuario_id,
        p_nueva_password: nuevoPassword
      })
      if (error) { setErrorAcceso(`Error: ${error.message}`); return }
      alert(`✅ Contraseña actualizada para ${empAcceso.email}`)
      setOpenAcceso(false)
    } finally { setSavingAcceso(false) }
  }

  async function resetearPassword() {
    if (!empAcceso?.email) { setErrorAcceso('El empleado no tiene email cargado'); return }
    setSavingAcceso(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(empAcceso.email, {
        redirectTo: window.location.origin + '/login',
      })
      if (error) { setErrorAcceso(`Error: ${error.message}`); return }
      alert(`✅ Se envió email de restablecimiento a ${empAcceso.email}`)
      setOpenAcceso(false)
    } finally { setSavingAcceso(false) }
  }

  const [rolesMap, setRolesMap] = useState<Record<string, string>>({})

  async function loadAll() {
    setLoading(true)
    const [{ data: emp }, { data: sec }, { data: car }, { data: usr }] = await Promise.all([
      supabase.from('empleados').select('*, sectores(nombre), cargos(nombre, categoria), usuario_id').order('apellido'),
      supabase.from('sectores').select('*').order('nombre'),
      supabase.from('cargos').select('*').order('nombre'),
      supabase.from('usuarios').select('id, rol'),
    ])
    setEmpleados((emp ?? []) as Empleado[])
    setSectores(sec ?? [])
    setCargos(car ?? [])
    // Mapa usuario_id → rol
    const map: Record<string, string> = {}
    ;(usr ?? []).forEach((u: any) => { map[u.id] = u.rol })
    setRolesMap(map)
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm({ estado: 'activo', fecha_ingreso: new Date().toISOString().split('T')[0] })
    setOpen(true)
  }

  function openEdit(e: Empleado) {
    setEditing(e)
    setForm({ ...e })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.nombre || !form.apellido || !form.dni || !form.legajo) return
    setSaving(true)
    try {
      if (editing) {
        // Excluir campos relacionales que no van en la tabla
        const { sectores: _s, cargos: _c, created_at: _ca, updated_at: _ua, ...datosUpdate } = form as any
        const { error: errUpd } = await supabase.from('empleados').update(datosUpdate).eq('id', editing.id)
        if (errUpd) { alert(`Error al guardar: ${errUpd.message}`); return }
        setOpen(false)
        loadAll()
      } else {
        const { data: nuevoEmp } = await supabase.from('empleados').insert(form).select().single()
        if (nuevoEmp && form.email) {
          const { data: session } = await supabase.auth.getSession()
          const resp = await fetch('https://chwcytrexetekcryndqy.supabase.co/functions/v1/crear-usuario-empleado', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.session?.access_token}`,
            },
            body: JSON.stringify({
              empleado_id: nuevoEmp.id,
              nombre: form.nombre,
              apellido: form.apellido,
              email: form.email,
              legajo: form.legajo,
            })
          })
          const result = await resp.json()
          if (result.ok) {
            alert(`Usuario creado exitosamente.\n\nEmail: ${form.email}\nContraseña temporal: ${result.password}\n\nEl empleado deberá cambiarla al primer ingreso.`)
          }
        }
        setOpen(false)
        loadAll()
      }
    } finally {
      setSaving(false)
    }
  }

  const canEdit = usuario?.rol && ['admin', 'rrhh'].includes(usuario.rol)

  const filtered = empleados.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = !q || [e.nombre, e.apellido, e.legajo, e.dni].some(v => v?.toLowerCase().includes(q))
    const matchEstado = !filtroEstado || e.estado === filtroEstado
    return matchSearch && matchEstado
  })

  function f(k: keyof Form) { return (form[k] ?? '') as string }
  function set(k: keyof Form, v: string) { setForm(p => ({ ...p, [k]: v || null })) }

  return (
    <Page>
      <PageHeader
        title="Empleados"
        subtitle={`${filtered.length} registros`}
        action={canEdit ? <Button onClick={openNew}>+ Nuevo empleado</Button> : undefined}
      />

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <Input
          placeholder="Buscar por nombre, legajo o DNI..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <Select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ width: 160 }}>
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="licencia">Licencia</option>
          <option value="suspendido">Suspendido</option>
          <option value="egresado">Egresado</option>
        </Select>
      </div>

      <Card>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <Empty message="No se encontraron empleados" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Legajo</Th>
                <Th>Nombre</Th>
                <Th>Sector</Th>
                <Th>Cargo</Th>
                <Th>Contrato</Th>
                <Th>Estado</Th>
                <Th>Rol</Th>
                {canEdit && <Th />}
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => canEdit && openEdit(e)}>
                  <Td><code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{e.legajo}</code></Td>
                  <Td>
                    <div>
                      <p style={{ fontWeight: 500 }}>{e.apellido}, {e.nombre}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-3)' }}>DNI {e.dni}</p>
                    </div>
                  </Td>
                  <Td>{e.sectores?.nombre ?? <span style={{ color: 'var(--text-3)' }}>—</span>}</Td>
                  <Td>{e.cargos?.nombre ?? <span style={{ color: 'var(--text-3)' }}>—</span>}</Td>
                  <Td style={{ fontSize: '12px' }}>{e.tipo_contrato ? CONTRATO_LABEL[e.tipo_contrato] : '—'}</Td>
                  <Td><Badge variant={ESTADO_BADGE[e.estado]}>{e.estado}</Badge></Td>
                  <Td>
                    {(e as any).usuario_id && rolesMap[(e as any).usuario_id] ? (
                      <Badge variant={ROL_BADGE[rolesMap[(e as any).usuario_id]] as any}>
                        {ROL_LABEL[rolesMap[(e as any).usuario_id]] ?? rolesMap[(e as any).usuario_id]}
                      </Badge>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>Sin acceso</span>
                    )}
                  </Td>
                  {canEdit && <Td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Button variant="ghost" size="sm" onClick={ev => { ev.stopPropagation(); openEdit(e) }}>Editar</Button>
                      {!(e as any).usuario_id ? (
                        <Button variant="ghost" size="sm"
                          onClick={ev => { ev.stopPropagation(); setEmpAcceso(e); setAccesoForm({ rol: 'empleado' }); setErrorAcceso(null); setOpenAcceso(true) }}
                          style={{ color: 'var(--blue-600)', fontSize: '11px' }}>
                          🔑 Crear acceso
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm"
                          onClick={async ev => {
                            ev.stopPropagation()
                            const { data } = await supabase.from('usuarios').select('rol').eq('id', (e as any).usuario_id).single()
                            setEmpAcceso(e)
                            setAccesoForm({ rol: data?.rol ?? 'empleado' })
                            setErrorAcceso(null)
                            setOpenAcceso(true)
                          }}
                          style={{ color: 'var(--green-600)', fontSize: '11px' }}>
                          ✓ Acceso
                        </Button>
                      )}
                    </div>
                  </Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Modal form */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar empleado' : 'Nuevo empleado'} width={620}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <Input label="Legajo *"    value={f('legajo')}    onChange={e => set('legajo', e.target.value)} />
          <Input label="DNI *"       value={f('dni')}       onChange={e => set('dni', e.target.value)} />
          <Input label="Nombre *"    value={f('nombre')}    onChange={e => set('nombre', e.target.value)} />
          <Input label="Apellido *"  value={f('apellido')}  onChange={e => set('apellido', e.target.value)} />
          <Input label="CUIL"        value={f('cuil')}      onChange={e => set('cuil', e.target.value)} />
          <Input label="Fecha nacimiento" type="date" value={f('fecha_nacimiento')} onChange={e => set('fecha_nacimiento', e.target.value)} />
          <Input label="Email"       value={f('email')}     onChange={e => set('email', e.target.value)} />
          <Input label="Teléfono"    value={f('telefono')}  onChange={e => set('telefono', e.target.value)} />

          <Select label="Sector" value={f('sector_id')} onChange={e => set('sector_id', e.target.value)}>
            <option value="">Seleccionar...</option>
            {sectores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </Select>

          <Select label="Cargo" value={f('cargo_id')} onChange={e => set('cargo_id', e.target.value)}>
            <option value="">Seleccionar...</option>
            {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>

          <Select label="Tipo de contrato" value={f('tipo_contrato')} onChange={e => set('tipo_contrato', e.target.value)}>
            <option value="">Seleccionar...</option>
            {Object.entries(CONTRATO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>

          <Select label="Estado" value={f('estado') || 'activo'} onChange={e => set('estado', e.target.value)}>
            <option value="activo">Activo</option>
            <option value="licencia">Licencia</option>
            <option value="suspendido">Suspendido</option>
            <option value="egresado">Egresado</option>
          </Select>

          <Input label="Fecha ingreso *" type="date" value={f('fecha_ingreso')} onChange={e => set('fecha_ingreso', e.target.value)} />
          <Input label="Fecha egreso"    type="date" value={f('fecha_egreso')}  onChange={e => set('fecha_egreso', e.target.value)} />

          <div style={{ gridColumn: '1 / -1' }}>
            <Textarea label="Dirección" value={f('direccion')} onChange={e => set('direccion', e.target.value)} style={{ minHeight: 60 }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving}>Guardar</Button>
        </div>
      </Modal>

      {/* Modal crear/editar acceso */}
      <Modal open={openAcceso} onClose={() => setOpenAcceso(false)} title={empAcceso?.usuario_id ? 'Gestionar acceso' : 'Crear acceso al sistema'} width={460}>
        {empAcceso && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {errorAcceso && (
              <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                <p style={{ color: 'var(--red-700)', fontSize: '13px' }}>⚠️ {errorAcceso}</p>
              </div>
            )}

            <div style={{ background: 'var(--slate-50)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
              <p style={{ fontWeight: 600, fontSize: '14px' }}>{empAcceso.apellido}, {empAcceso.nombre}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '4px' }}>
                📧 {empAcceso.email ?? <span style={{ color: 'var(--red-600)' }}>Sin email — editá la ficha primero</span>}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>Leg. {empAcceso.legajo}</p>
            </div>

            <Select label="Rol *" value={accesoForm.rol ?? 'empleado'} onChange={e => setAccesoForm((p: any) => ({ ...p, rol: e.target.value }))}>
              <optgroup label="Personal de base">
                <option value="empleado">Empleado — portal básico</option>
                <option value="enfermeria">Enfermería — portal + prestaciones</option>
                <option value="instrumentadora">Instrumentadora — portal + prestaciones</option>
                <option value="administrativo">Administrativo — portal + prestaciones</option>
              </optgroup>
              <optgroup label="Referentes">
                <option value="referente_empleados">Referente empleados — portal + carga de turnos</option>
                <option value="referente_enfermeria">Ref. enfermería — portal + turnos + insumos + prestaciones</option>
                <option value="referente_instrumentadores">Ref. instrumentadores — portal + turnos + insumos + prestaciones</option>
              </optgroup>
              <optgroup label="Gestión">
                <option value="rrhh">RRHH — panel completo + prestaciones</option>
                <option value="mediador">Mediador — portal + mediaciones</option>
                <option value="admin">Administrador — acceso completo</option>
              </optgroup>
            </Select>

            {!empAcceso.usuario_id && (
              <>
                <Input label="Contraseña temporal *" type="password" value={accesoForm.password ?? ''}
                  onChange={e => setAccesoForm((p: any) => ({ ...p, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres" />
                <div style={{ background: 'var(--amber-50)', border: '1px solid var(--amber-200)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--amber-800)' }}>
                    ⚠️ Comunicá las credenciales al empleado en persona. Email: <strong>{empAcceso.email}</strong>
                  </p>
                </div>
              </>
            )}

            {empAcceso.usuario_id && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--green-800)' }}>✅ Este empleado ya tiene acceso al sistema.</p>
                </div>
                <Input label="Nueva contraseña (opcional)" type="password"
                  value={accesoForm.nuevaPassword ?? ''}
                  onChange={e => setAccesoForm((p: any) => ({ ...p, nuevaPassword: e.target.value }))}
                  placeholder="Dejar vacío para no cambiar" />
                {accesoForm.nuevaPassword && accesoForm.nuevaPassword.length < 6 && (
                  <p style={{ fontSize: '11px', color: 'var(--red-600)' }}>Mínimo 6 caracteres</p>
                )}
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <Button variant="secondary" onClick={() => setOpenAcceso(false)}>Cancelar</Button>
          {!empAcceso?.usuario_id ? (
            <Button onClick={crearAcceso} loading={savingAcceso}>Crear acceso</Button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" onClick={resetearPassword} loading={savingAcceso}>
                📧 Enviar reset de contraseña
              </Button>
              <Button onClick={async () => {
                if (accesoForm.nuevaPassword && accesoForm.nuevaPassword.length >= 6) {
                  await cambiarPasswordManual(accesoForm.nuevaPassword)
                }
                await cambiarRol(empAcceso.id, empAcceso.usuario_id, accesoForm.rol)
              }} loading={savingAcceso}>
                Guardar cambios
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </Page>
  )
}
