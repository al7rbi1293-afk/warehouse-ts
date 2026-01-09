
import streamlit as st
import pandas as pd
from sqlalchemy import text

# Database Connection
def get_connection():
    try:
        return st.connection("supabase", type="sql")
    except Exception as e:
        st.error(f"⚠️ Connection Error: {e}")
        st.stop()

conn = get_connection()

def run_query(query, params=None, ttl=None):
    try: 
        # Caching strategy: if ttl is NOT provided, it might default to strict cache.
        # We explicitly map None -> default streamlist cache behavior for static data
        return conn.query(query, params=params, ttl=ttl)
    except Exception as e: 
        st.error(f"DB Error: {e}")
        return pd.DataFrame()

def run_action(query, params=None):
    try:
        with conn.session as session:
            session.execute(text(query), params)
            session.commit()
        return True
    except Exception as e: 
        st.error(f"DB Action Error: {e}")
        return False

def run_batch_action(actions):
    """
    Executes a list of (query, params) tuples in a single transaction.
    actions: list of (query_string, params_dict)
    """
    try:
        with st.spinner("Processing..."):
            with conn.session as session:
                for q, p in actions:
                    session.execute(text(q), p)
                session.commit()
            return True
    except Exception as e: st.error(f"Batch DB Error: {e}"); return False

def init_db():
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
    except: pass
