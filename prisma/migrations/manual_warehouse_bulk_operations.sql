ALTER TABLE inventory
    ADD COLUMN IF NOT EXISTS name_ar TEXT,
    ADD COLUMN IF NOT EXISTS item_code TEXT;

CREATE INDEX IF NOT EXISTS inventory_item_code_idx
    ON inventory(item_code);

ALTER TABLE warehouses
    ADD COLUMN IF NOT EXISTS type TEXT;

ALTER TABLE loan
    ADD COLUMN IF NOT EXISTS original_quantity INTEGER,
    ADD COLUMN IF NOT EXISTS returned_quantity INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS expected_return_date TIMESTAMP,
    ADD COLUMN IF NOT EXISTS return_date TIMESTAMP,
    ADD COLUMN IF NOT EXISTS reference TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE loan
SET original_quantity = COALESCE(original_quantity, quantity)
WHERE original_quantity IS NULL;

CREATE TABLE IF NOT EXISTS warehouse_bulk_operations (
    id SERIAL PRIMARY KEY,
    operation_no TEXT NOT NULL UNIQUE,
    operation_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Completed',
    created_by TEXT NOT NULL,
    created_by_user_id INTEGER,
    notes TEXT,
    metadata JSONB,
    submitted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS warehouse_bulk_operations_operation_type_idx
    ON warehouse_bulk_operations(operation_type);

CREATE INDEX IF NOT EXISTS warehouse_bulk_operations_status_idx
    ON warehouse_bulk_operations(status);

CREATE INDEX IF NOT EXISTS warehouse_bulk_operations_created_at_idx
    ON warehouse_bulk_operations(created_at DESC);

CREATE TABLE IF NOT EXISTS warehouse_bulk_operation_lines (
    id SERIAL PRIMARY KEY,
    bulk_operation_id INTEGER NOT NULL REFERENCES warehouse_bulk_operations(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    status TEXT NOT NULL DEFAULT 'Pending',
    item_id INTEGER,
    item_name TEXT NOT NULL,
    item_code TEXT,
    category TEXT,
    unit TEXT,
    quantity INTEGER NOT NULL,
    approved_qty INTEGER,
    fulfilled_qty INTEGER,
    available_qty_snapshot INTEGER,
    from_warehouse TEXT,
    to_warehouse TEXT,
    region TEXT,
    project_name TEXT,
    expected_return_date TIMESTAMP,
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT warehouse_bulk_operation_lines_bulk_line_no_key UNIQUE (bulk_operation_id, line_no)
);

CREATE INDEX IF NOT EXISTS warehouse_bulk_operation_lines_entity_idx
    ON warehouse_bulk_operation_lines(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS warehouse_bulk_operation_lines_status_idx
    ON warehouse_bulk_operation_lines(status);

CREATE INDEX IF NOT EXISTS warehouse_bulk_operation_lines_item_name_idx
    ON warehouse_bulk_operation_lines(item_name);

CREATE INDEX IF NOT EXISTS warehouse_bulk_operation_lines_route_idx
    ON warehouse_bulk_operation_lines(from_warehouse, to_warehouse);
