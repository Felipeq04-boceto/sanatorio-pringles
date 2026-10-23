-- ============================================================
-- Pedidos de insumos + items
-- ============================================================

-- Tabla principal de pedidos
CREATE TABLE IF NOT EXISTS pedidos_insumos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero           TEXT NOT NULL UNIQUE,
  estado           TEXT NOT NULL DEFAULT 'borrador'
                   CHECK (estado IN ('borrador','solicitado','aprobado','recibido','cancelado')),
  proveedor_id     UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  observaciones    TEXT,
  fecha_solicitud  TIMESTAMPTZ,
  fecha_aprobacion TIMESTAMPTZ,
  fecha_recepcion  TIMESTAMPTZ,
  remito_numero    TEXT,
  creado_por       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ítems de cada pedido
CREATE TABLE IF NOT EXISTS items_pedido (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id            UUID NOT NULL REFERENCES pedidos_insumos(id) ON DELETE CASCADE,
  insumo_id            UUID NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  cantidad_solicitada  NUMERIC(10,2) NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_recibida    NUMERIC(10,2),
  precio_unitario      NUMERIC(12,2),
  observaciones        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pedidos_estado     ON pedidos_insumos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_proveedor  ON pedidos_insumos(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_created    ON pedidos_insumos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_pedido       ON items_pedido(pedido_id);
CREATE INDEX IF NOT EXISTS idx_items_insumo       ON items_pedido(insumo_id);

-- Auto-updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_updated_at ON pedidos_insumos;
CREATE TRIGGER trg_pedidos_updated_at
  BEFORE UPDATE ON pedidos_insumos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RPC para incrementar stock (usada al recibir mercadería)
-- ============================================================
CREATE OR REPLACE FUNCTION incrementar_stock(p_insumo_id UUID, p_cantidad NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE insumos
  SET stock_actual = stock_actual + p_cantidad
  WHERE id = p_insumo_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE pedidos_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_pedido    ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer pedidos
CREATE POLICY "pedidos_select" ON pedidos_insumos FOR SELECT TO authenticated USING (true);
CREATE POLICY "items_select"   ON items_pedido    FOR SELECT TO authenticated USING (true);

-- Admin y referentes pueden crear/modificar
CREATE POLICY "pedidos_insert" ON pedidos_insumos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pedidos_update" ON pedidos_insumos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "items_insert"   ON items_pedido    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "items_update"   ON items_pedido    FOR UPDATE TO authenticated USING (true);

-- Solo admin puede borrar
CREATE POLICY "pedidos_delete" ON pedidos_insumos FOR DELETE TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');
