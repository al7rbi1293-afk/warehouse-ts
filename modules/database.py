
import streamlit as st
import pandas as pd
from sqlalchemy import text

# Database Connection
# Lazy loading to prevent import errors and st.stop() at module level
_conn = None

def get_connection():
    global _conn
    if _conn is not None:
        return _conn
    try:
        _conn = st.connection("supabase", type="sql")
        return _conn
    except Exception as e:
        st.error(f"⚠️ Connection Error: {e}")
        return None

def run_query(query, params=None, ttl=600):
    c = get_connection()
    if not c: return pd.DataFrame()
    try: 
        # Caching strategy: Default strict cache (10 mins) for extreme speed.
        # Writes will auto-invalidate via st.cache_data.clear()
        return c.query(query, params=params, ttl=ttl)
    except Exception as e: 
        st.error(f"DB Error: {e}")
        return pd.DataFrame()

def run_action(query, params=None):
    c = get_connection()
    if not c: return False
    try:
        with c.session as session:
            session.execute(text(query) if isinstance(query, str) else query, params)
            session.commit()
            st.cache_data.clear() # Auto-invalidate cache on write
        return True
    except Exception as e: 
        st.error(f"DB Action Error: {e}")
        return False

def log_audit(user_name: str, action: str, details: str = None, module: str = None):
    """Log user action to audit_logs table for tracking."""
    try:
        run_action(
            "INSERT INTO audit_logs (user_name, action, details, module) VALUES (:u, :a, :d, :m)",
            {"u": user_name, "a": action, "d": details, "m": module}
        )
    except Exception:
        pass  # Silent fail - audit logging should not break main functionality

def run_batch_action(actions):
    """
    Executes a list of (query, params) tuples in a single transaction.
    actions: list of (query_string, params_dict)
    """
    c = get_connection()
    if not c: return False
    try:
        with st.spinner("Processing..."):
            with c.session as session:
                for q, p in actions:
                    session.execute(text(q), p)
                session.commit()
                st.cache_data.clear() # Auto-invalidate cache on batch write
            return True
    except Exception as e: st.error(f"Batch DB Error: {e}"); return False

def init_db():
    # Users Table
    run_action("""
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            name TEXT,
            role TEXT,
            region TEXT,
            shift_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """)

    # Inventory Table
    run_action("""
        CREATE TABLE IF NOT EXISTS inventory (
            id SERIAL PRIMARY KEY,
            name_en TEXT NOT NULL,
            category TEXT,
            unit TEXT,
            qty INTEGER DEFAULT 0,
            location TEXT NOT NULL,
            status TEXT,
            last_updated TIMESTAMP DEFAULT NOW(),
            UNIQUE(name_en, location)
        );
    """)

    # Requests Table
    run_action("""
        CREATE TABLE IF NOT EXISTS requests (
            req_id SERIAL PRIMARY KEY,
            supervisor_name TEXT,
            region TEXT,
            item_name TEXT,
            category TEXT,
            qty INTEGER,
            unit TEXT,
            status TEXT,
            request_date TIMESTAMP DEFAULT NOW(),
            notes TEXT
        );
    """)

    # Workers Table
    run_action("""
        CREATE TABLE IF NOT EXISTS workers (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT,
            region TEXT,
            status TEXT DEFAULT 'Active',
            created_at TIMESTAMP DEFAULT NOW()
        );
    """)
    # Shifts Table
    run_action("""
        CREATE TABLE IF NOT EXISTS shifts (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT
        );
    """)
    # Attendance Table
    run_action("""
        CREATE TABLE IF NOT EXISTS attendance (
            id SERIAL PRIMARY KEY,
            worker_id INTEGER REFERENCES workers(id),
            date DATE NOT NULL,
            status TEXT,
            shift_id INTEGER,
            return_date DATE,
            notes TEXT,
            supervisor TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """)
    
    # 4.2 Migration (Safe Add Columns)
    try:
        run_action("ALTER TABLE workers ADD COLUMN IF NOT EXISTS shift_id INTEGER;")
        run_action("ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_id INTEGER;")
        run_action("ALTER TABLE workers ADD COLUMN IF NOT EXISTS emp_id TEXT;") # Add EMP ID
        run_action("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP DEFAULT NOW();") # Fix for UndefinedColumn error
        
        # Performance Indexes
        run_action("CREATE INDEX IF NOT EXISTS idx_inv_loc ON inventory(location);")
        run_action("CREATE INDEX IF NOT EXISTS idx_inv_name ON inventory(name_en);")
        run_action("CREATE INDEX IF NOT EXISTS idx_workers_reg ON workers(region);")
        run_action("CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(date);")
        run_action("CREATE INDEX IF NOT EXISTS idx_req_stat ON requests(status);")
        
        # Support for Batch Upsert in Warehouse
        run_action("CREATE TABLE IF NOT EXISTS local_inventory (region TEXT, item_name TEXT, qty INTEGER, last_updated TIMESTAMP, updated_by TEXT);")
        run_action("CREATE UNIQUE INDEX IF NOT EXISTS idx_local_inv_uniq ON local_inventory (region, item_name);")
        
        # Stock Logs Table (Fix for UndefinedColumn)
        run_action("""
            CREATE TABLE IF NOT EXISTS stock_logs (
                id SERIAL PRIMARY KEY,
                log_date TIMESTAMP DEFAULT NOW(),
                item_name TEXT,
                change_amount INTEGER,
                location TEXT,
                action_by TEXT,
                action_type TEXT,
                unit TEXT,
                new_qty INTEGER,
                user_name TEXT -- Legacy support
            );
        """)
        # Safe migrations for stock_logs
        run_action("ALTER TABLE stock_logs ADD COLUMN IF NOT EXISTS action_by TEXT;")
        run_action("ALTER TABLE stock_logs ADD COLUMN IF NOT EXISTS unit TEXT;")
        run_action("ALTER TABLE stock_logs ADD COLUMN IF NOT EXISTS new_qty INTEGER;")
        run_action("ALTER TABLE stock_logs ADD COLUMN IF NOT EXISTS user_name TEXT;")
        
        # Audit Logs Table - Track all user actions
        run_action("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT NOW(),
                user_name TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                module TEXT
            );
        """)
        run_action("CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp DESC);")
        
    except Exception as e:
        # Log migration errors but don't crash - these are often just "column already exists"
        print(f"[DB Migration] Non-critical warning: {e}")
