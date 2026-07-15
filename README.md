# Sanatorio Pringles — Sistema de Gestión

Aplicación web para gestión de Recursos Humanos e Insumos del Sanatorio Pringles.  
Stack: **React 18 + TypeScript + Vite + Supabase**

---

## Instalación

### 1. Pre-requisitos
- Node.js 18 o superior
- Cuenta en [supabase.com](https://supabase.com) (gratuita)

### 2. Crear el proyecto en Supabase

1. Ir a [supabase.com](https://supabase.com) → "New project"
2. Elegir nombre: `sanatorio-pringles`
3. Elegir región: **South America (São Paulo)**
4. Una vez creado, ir a **SQL Editor** → **New query**
5. Pegar el contenido completo de `sanatorio_pringles.sql` y ejecutar

### 3. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Editar `.env.local` con los datos de tu proyecto Supabase:
- URL: `Settings → API → Project URL`
- Anon Key: `Settings → API → anon public`

### 4. Instalar dependencias y correr

```bash
npm install
npm run dev
```

La aplicación corre en `http://localhost:5173`

---

## Crear el primer usuario (admin)

1. En Supabase → **Authentication → Users → Invite user**
2. Ingresar el email del administrador
3. El usuario recibe un mail con link de activación
4. Luego en **SQL Editor** ejecutar:

```sql
-- Reemplazar 'UUID_DEL_USUARIO' con el ID real del usuario creado
-- (lo encontrás en Authentication → Users)
INSERT INTO public.usuarios (id, nombre, apellido, email, rol)
VALUES (
  'UUID_DEL_USUARIO',
  'Nombre',
  'Apellido', 
  'email@sanatorio.com',
  'admin'
);
```

---

## Estructura del proyecto

```
src/
├── components/
│   ├── layout/       # AppLayout, Sidebar, PageHeader
│   └── ui/           # Button, Badge, Card, Table, Modal, Input...
├── hooks/
│   └── useAuth.ts    # Autenticación con Supabase
├── lib/
│   └── supabase.ts   # Cliente + todos los tipos TypeScript
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── rrhh/
│   │   ├── EmpleadosPage.tsx
│   │   ├── TurnosPage.tsx        (por desarrollar)
│   │   ├── LicenciasPage.tsx     (por desarrollar)
│   │   ├── CapacitacionesPage.tsx (por desarrollar)
│   │   └── MediacionesPage.tsx   (por desarrollar)
│   └── insumos/
│       ├── StockPage.tsx
│       ├── GasesPage.tsx
│       ├── MovimientosPage.tsx   (por desarrollar)
│       ├── ProveedoresPage.tsx   (por desarrollar)
│       └── AlertasPage.tsx
└── AppRouter.tsx     # Rutas + protección por autenticación
```

---

## Roles y permisos

| Rol       | RRHH | Insumos | Descripción                              |
|-----------|------|---------|------------------------------------------|
| `admin`   | ✅   | ✅      | Acceso completo                          |
| `rrhh`    | ✅   | 👁️      | Gestiona personal, solo lee insumos      |
| `insumos` | 👁️   | ✅      | Gestiona stock, solo lee empleados       |
| `lectura` | 👁️   | 👁️      | Solo lectura en todo el sistema          |

---

## Deploy en producción

### Vercel (recomendado)

```bash
npm install -g vercel
vercel
```

Agregar las variables de entorno en el dashboard de Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## Módulos por desarrollar (Fase 2)

- [ ] Turnos: calendario mensual, carga masiva de guardias
- [ ] Licencias: workflow de aprobación, cálculo de días disponibles
- [ ] Capacitaciones: vencimientos, notificaciones automáticas
- [ ] Mediaciones: carga de expedientes confidenciales
- [ ] Proveedores: CRUD completo, historial de compras
- [ ] Movimientos: listado con filtros y exportación a Excel
- [ ] Reportes: generación de PDFs para auditorías
