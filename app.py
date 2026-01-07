import streamlit as st
import pandas as pd
from datetime import datetime
from sqlalchemy import text
import time

# --- 1. إعداد الصفحة ---
st.set_page_config(page_title="WMS Pro", layout="wide", initial_sidebar_state="expanded")

# --- 2. إدارة الجلسة ---
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.user_info = {}

# --- 3. الثوابت (Cached for Performance) ---
@st.cache_data
def get_constants():
    return {
        "CATS": ["Electrical", "Chemical", "Hand Tools", "Consumables", "Safety", "Others"],
        "LOCS": ["NTCC", "SNC"],
        "PROJS": ["KASCH", "KAMC", "KSSH Altaif"],
        "AREAS": [
            "OPD", "Imeging", "Neurodiangnostic", "E.R", 
            "1s floor", "Service Area", "ICU 28", "ICU 29", 
            "O.R", "Recovery", "RT and Waiting area", 
            "Ward 30-31", "Ward 40-41", "Ward50-51"
        ]
    }

CONST = get_constants()

# تم إعادة النصوص المفقودة هنا لحل مشكلة KeyError
txt = {
    "app_title": "Unified WMS System",
    "login_page": "Login", "register_page": "Register",
    "username": "Username", "password": "Password",
    "fullname": "Full Name", "region": "Region",
    "login_btn": "Login", "register_btn": "Sign Up", "logout": "Logout",
    "manager_role": "Manager", "supervisor_role": "Supervisor", "storekeeper_role": "Store Keeper",
    "create_item_title": "➕ Create New Item", "create_btn": "Create Item",
    "ext_tab": "🔄 External & Loans", "project_loans": "🤝 Project Loans",
    "cww_supply": "🏭 Central Supply (CWW)", "exec_trans": "Execute Transfer",
    "refresh_data": "🔄 Refresh Data", "notes": "Notes / Remarks",
    "save_mod": "💾 Save Changes", "insufficient_stock_sk": "❌ STOP: Issue Qty > NTCC Stock!",
    "error_login": "Invalid Username or Password", "success_reg": "Registered successfully",
    "local_inv": "Branch Inventory Reports", "req_form": "Bulk Order Form", 
    "select_item": "Select Item", "qty_req": "Request Qty", "send_req": "🚀 Send Bulk Order",
    "approved_reqs": "📦 Pending Issue (Bulk)", "issue": "Confirm Issue 📦",
    "transfer_btn": "Transfer Stock", "edit_profile": "Edit Profile", 
    "new_name": "New Name", "new_pass": "New Password", "save_changes": "Save Changes",
    "update_btn": "Update", "cancel_req": "Cancel Request 🗑️"
}

# --- 4. الاتصال بقاعدة البيانات ---
try:
    conn = st.connection("supabase", type="sql")
except:
    st.error("⚠️ Connection Error. Please check secrets.")
    st.stop()

# --- 5. دوال قاعدة البيانات المحسنة (Optimized DB Functions) ---

def run_query(query, params=None):
    """Fetch data (Read Only)"""
    try: return conn.query(query, params=params, ttl=0)
    except Exception as e: st.error(f"DB Read Error: {e}"); return pd.DataFrame()

def run_action(query, params=None):
    """Single Action (Write)"""
    try:
        with conn.session as session:
            session.execute(text(query), params); session.commit()
        return True
    except Exception as e: st.error(f"DB Write Error: {e}"); return False

def run_batch_actions(actions_list):
    """
    🚀 PERFORMANCE BOOSTER: Executes multiple queries in ONE transaction.
    actions_list = [{'query':Str, 'params':Dict}, ...]
    """
    if not actions_list: return True
    try:
        with conn.session as session:
            for action in actions_list:
                session.execute(text(action['query']), action['params'])
            session.commit()
        return True
    except Exception as e:
        st.error(f"Batch Error: {e}")
        return False

# --- 6. دوال المنطق (Business Logic) ---

def login_user(u, p):
    df = run_query("SELECT * FROM users WHERE username = :u AND password = :p", {"u": u, "p": p})
    return df.iloc[0].to_dict() if not df.empty else None

def register_user(u, p, n, r):
    return run_action("INSERT INTO users (username, password, name, role, region) VALUES (:u, :p, :n, 'supervisor', :r)",
                      {"u": u, "p": p, "n": n, "r": r})

def update_user_profile_full(old_u, new_u, new_n, new_p):
    if new_u != old_u:
        if not run_query("SELECT username FROM users WHERE username = :u", {"u": new_u}).empty: return False, "Taken"
    return run_action("UPDATE users SET username=:nu, name=:nn, password=:np WHERE username=:ou",
                      {"nu": new_u, "nn": new_n, "np": new_p, "ou": old_u}), "Updated"

def get_inventory(loc):
    return run_query("SELECT * FROM inventory WHERE location = :loc ORDER BY name_en", {"loc": loc})

# دالة التحديث المركزية (محسنة)
def update_central_stock(item, loc, chg, user, desc, unit):
    chg = int(chg)
    # Check Stock First
    df = run_query("SELECT qty FROM inventory WHERE name_en = :n AND location = :l", {"n": item, "l": loc})
    if df.empty: return False, "Item Not Found"
    
    cur_q = int(df.iloc[0]['qty'])
    # Validation logic (skip if borrowing/adding)
    if chg < 0 and abs(chg) > cur_q: return False, "Low Stock"
    
    # Prepare Batch
    ops = [
        {
            "query": "UPDATE inventory SET qty = :nq WHERE name_en = :n AND location = :l",
            "params": {"nq": cur_q + chg, "n": item, "l": loc}
        },
        {
            "query": "INSERT INTO stock_logs (log_date, user_name, action_type, item_name, location, change_amount, new_qty) VALUES (NOW(), :u, :a, :i, :l, :c, :nq)",
            "params": {"u": user, "a": f"{desc} ({unit})", "i": item, "l": loc, "c": chg, "nq": cur_q + chg}
        }
    ]
    return run_batch_actions(ops), "Success"

def get_local_qty(reg, item):
    df = run_query("SELECT qty FROM local_inventory WHERE region=:r AND item_name=:i", {"r": reg, "i": item})
    return int(df.iloc[0]['qty']) if not df.empty else 0

# --- 7. الواجهات (UI) ---

def show_login():
    st.title(f"🔐 {txt['app_title']}")
    t1, t2 = st.tabs(["Login", "Register"])
    with t1:
        with st.form("log"):
            u = st.text_input("Username"); p = st.text_input("Password", type="password")
            if st.form_submit_button("Login", use_container_width=True):
                user = login_user(u.strip(), p.strip())
                if user:
                    st.session_state.logged_in = True
                    st.session_state.user_info = user
                    st.rerun()
                else: st.error("Invalid")
    with t2:
        with st.form("reg"):
            nu = st.text_input("User"); np = st.text_input("Pass", type="password"); nn = st.text_input("Name")
            nr = st.selectbox("Region", CONST["AREAS"])
            if st.form_submit_button("Register", use_container_width=True):
                if register_user(nu.strip(), np.strip(), nn, nr): st.success("Success")
                else: st.error("Error")

def show_main_app():
    info = st.session_state.user_info
    
    with st.sidebar:
        st.header(f"👤 {info['name']}")
        st.caption(f"{info['role']} | {info['region']}")
        if st.button("🔄 Refresh"): st.rerun()
        with st.expander("Edit Profile"):
            nu = st.text_input("User", info['username'])
            nn = st.text_input("Name", info['name'])
            np = st.text_input("Pass", info['password'], type="password")
            if st.button("Save"):
                res, msg = update_user_profile_full(info['username'], nu, nn, np)
                if res: st.success(msg); st.session_state.logged_in=False; time.sleep(1); st.rerun()
                else: st.error(msg)
        if st.button("Logout"): st.session_state.logged_in=False; st.rerun()

    if info['role'] == 'manager': manager_view()
    elif info['role'] == 'storekeeper': storekeeper_view()
    else: supervisor_view()

# --- Helper: Render Bulk Stock Take (Optimized) ---
def render_stock_take(loc, user, key):
    inv = get_inventory(loc)
    if inv.empty: st.warning(f"No Items in {loc}"); return
    
    df = inv[['name_en', 'category', 'qty', 'unit']].copy()
    df['Physical'] = df['qty'] # Default
    
    edited = st.data_editor(
        df, key=key,
        column_config={
            "name_en": st.column_config.TextColumn("Item", disabled=True),
            "qty": st.column_config.NumberColumn("System", disabled=True),
            "Physical": st.column_config.NumberColumn("Actual", min_value=0, required=True)
        },
        disabled=["name_en", "category", "unit", "qty"],
        hide_index=True, width="stretch"
    )
    
    if st.button(f"Update {loc}", key=f"btn_{key}"):
        batch_ops = []
        count = 0
        # Calculate diffs
        for idx, row in edited.iterrows():
            diff = int(row['Physical']) - int(row['qty'])
            if diff != 0:
                # Add Update Op
                batch_ops.append({
                    "query": "UPDATE inventory SET qty = :nq WHERE name_en = :n AND location = :l",
                    "params": {"nq": int(row['Physical']), "n": row['name_en'], "l": loc}
                })
                # Add Log Op
                batch_ops.append({
                    "query": "INSERT INTO stock_logs (log_date, user_name, action_type, item_name, location, change_amount, new_qty) VALUES (NOW(), :u, 'Stock Take', :i, :l, :c, :nq)",
                    "params": {"u": user, "i": row['name_en'], "l": loc, "c": diff, "nq": int(row['Physical'])}
                })
                count += 1
        
        if batch_ops:
            if run_batch_actions(batch_ops):
                st.success(f"Updated {count} items!"); time.sleep(1); st.rerun()
        else: st.info("No changes")

# ================= VIEWS =================

def manager_view():
    st.subheader(f"🚀 Manager Dashboard")
    t1, t2, t3, t4, t5 = st.tabs(["📦 Stock", txt['ext_tab'], "⏳ Requests", txt['local_inv'], "📜 Logs"])
    
    with t1: # Stock
        with st.expander(txt['create_item_title']):
            c1, c2, c3, c4 = st.columns(4)
            n = c1.text_input("Name"); c = c2.selectbox("Cat", CONST["CATS"]); l = c3.selectbox("Loc", CONST["LOCS"]); q = c4.number_input("Qty", 0)
            u = st.selectbox("Unit", ["Piece", "Carton", "Set"])
            if st.button(txt['create_btn']):
                if run_query("SELECT id FROM inventory WHERE name_en=:n AND location=:l", {"n":n, "l":l}).empty:
                    run_action("INSERT INTO inventory (name_en, category, unit, location, qty, status) VALUES (:n, :c, :u, :l, :q, 'Available')",
                              {"n":n, "c":c, "u":u, "l":l, "q":int(q)})
                    st.success("Done"); st.rerun()
                else: st.error("Exists")
        st.divider()
        c1, c2 = st.columns(2)
        with c1: render_stock_take("NTCC", st.session_state.user_info['name'], "mgr_ntcc")
        with c2: render_stock_take("SNC", st.session_state.user_info['name'], "mgr_snc")

    with t2: # External
        c1, c2 = st.columns(2)
        with c1:
            st.markdown(f"**{txt['project_loans']}**")
            with st.container(border=True):
                wh = st.selectbox("WH", CONST["LOCS"]); proj = st.selectbox("Proj", CONST["PROJS"])
                inv = get_inventory(wh)
                if not inv.empty:
                    it = st.selectbox("Item", inv['name_en'].unique())
                    row = inv[inv['name_en']==it].iloc[0]
                    op = st.radio("Op", ["Lend (-)", "Borrow (+)"], horizontal=True)
                    amt = st.number_input("Qty", 1)
                    if st.button(txt['exec_trans']):
                        chg = -int(amt) if "Lend" in op else int(amt)
                        desc = f"Loan {op.split()[0]} {proj}"
                        ok, msg = update_central_stock(it, wh, chg, st.session_state.user_info['name'], desc, row['unit'])
                        if ok: st.success("Done"); st.rerun()
                        else: st.error(msg)
        with c2:
            st.markdown(f"**{txt['cww_supply']}**")
            with st.container(border=True):
                dest = st.selectbox("Dest", CONST["LOCS"], key="cww_d")
                inv = get_inventory(dest)
                if not inv.empty:
                    it = st.selectbox("Item", inv['name_en'].unique(), key="cww_i")
                    row = inv[inv['name_en']==it].iloc[0]
                    amt = st.number_input("Qty", 1, key="cww_q")
                    if st.button("Receive"):
                        ok, msg = update_central_stock(it, dest, int(amt), st.session_state.user_info['name'], "From CWW", row['unit'])
                        if ok: st.success("Done"); st.rerun()
    
    with t3: # Requests (PERFORMANCE FIX: Select Region instead of Tabs)
        st.info("💡 Select a region to view and process requests.")
        sel_reg = st.selectbox("Select Region to Review", CONST["AREAS"])
        
        # Fetch only pending for this region
        reqs = run_query("SELECT * FROM requests WHERE region=:r AND status='Pending' ORDER BY request_date DESC", {"r": sel_reg})
        
        if reqs.empty:
            st.success(f"No pending requests for {sel_reg}")
        else:
            bulk_act = st.radio(f"Action for {sel_reg}:", ["Keep Pending", "Approve All", "Reject All"], horizontal=True)
            
            # Prepare Editor
            reqs['Action'] = "Approve" if bulk_act == "Approve All" else ("Reject" if bulk_act == "Reject All" else "Keep Pending")
            reqs['Mgr Qty'] = reqs['qty']
            reqs['Mgr Note'] = reqs['notes']
            
            edited = st.data_editor(
                reqs[['req_id', 'item_name', 'qty', 'unit', 'supervisor_name', 'Mgr Qty', 'Mgr Note', 'Action']],
                column_config={
                    "req_id": None, "qty": st.column_config.NumberColumn("Req Qty", disabled=True),
                    "item_name": st.column_config.TextColumn(disabled=True),
                    "supervisor_name": st.column_config.TextColumn(disabled=True),
                    "unit": st.column_config.TextColumn(disabled=True),
                    "Mgr Qty": st.column_config.NumberColumn(min_value=1, required=True),
                    "Action": st.column_config.SelectboxColumn(options=["Keep Pending", "Approve", "Reject"], required=True)
                },
                hide_index=True, width="stretch", key=f"edit_{sel_reg}"
            )
            
            if st.button(f"Process {sel_reg}"):
                batch_ops = []
                count = 0
                
                # Pre-fetch inventory for validation to avoid N+1
                stock_df = get_inventory("NTCC")
                stock_map = dict(zip(stock_df['name_en'], stock_df['qty']))
                
                for _, row in edited.iterrows():
                    action = row['Action']
                    if action == "Keep Pending": continue
                    
                    rid = row['req_id']
                    nq = int(row['Mgr Qty'])
                    note = row['Mgr Note']
                    
                    if action == "Approve":
                        avail = stock_map.get(row['item_name'], 0)
                        if avail >= nq:
                            fn = f"Manager: {note}" if note else ""
                            batch_ops.append({
                                "query": "UPDATE requests SET status='Approved', qty=:q, notes=:n WHERE req_id=:id",
                                "params": {"q": nq, "n": fn, "id": rid}
                            })
                            count += 1
                        else:
                            st.toast(f"Low Stock: {row['item_name']}", icon="⚠️")
                    
                    elif action == "Reject":
                        batch_ops.append({
                            "query": "UPDATE requests SET status='Rejected', notes=:n WHERE req_id=:id",
                            "params": {"n": note, "id": rid}
                        })
                        count += 1
                
                if batch_ops:
                    if run_batch_actions(batch_ops):
                        st.success(f"Processed {count} requests!"); time.sleep(1); st.rerun()

    with t4: # Reports (Lazy Load)
        st.subheader("Inventory View")
        # Use Tabs for Areas as requested
        area_tabs = st.tabs(CONST["AREAS"])
        for i, area in enumerate(CONST["AREAS"]):
            with area_tabs[i]:
                df = run_query("SELECT item_name, qty, last_updated, updated_by FROM local_inventory WHERE region=:r ORDER BY item_name", {"r": area})
                if df.empty: st.info("No items")
                else: st.dataframe(df, width="stretch")

    with t5:
        st.dataframe(run_query("SELECT * FROM stock_logs ORDER BY log_date DESC LIMIT 50"), width="stretch")

# ================= STOREKEEPER =================

def storekeeper_view():
    st.header(txt['storekeeper_role'])
    t1, t2, t3, t4 = st.tabs([txt['approved_reqs'], "Issued Today", "NTCC Stock", "SNC Stock"])
    
    with t1: # Bulk Issue
        st.info("💡 Select a region to process issues.")
        sel_reg = st.selectbox("Select Region", CONST["AREAS"], key="sk_reg_sel")
        
        reqs = run_query("SELECT * FROM requests WHERE region=:r AND status='Approved'", {"r": sel_reg})
        
        if reqs.empty:
            st.success("No items to issue for this region.")
        else:
            sel_all = st.checkbox("Select All")
            
            reqs['Issue Qty'] = reqs['qty']
            reqs['SK Note'] = ""
            reqs['Process'] = sel_all
            
            edited = st.data_editor(
                reqs[['req_id', 'item_name', 'qty', 'unit', 'notes', 'Issue Qty', 'SK Note', 'Process']],
                column_config={
                    "req_id": None, "qty": st.column_config.NumberColumn("Appr Qty", disabled=True),
                    "item_name": st.column_config.TextColumn(disabled=True),
                    "unit": st.column_config.TextColumn(disabled=True),
                    "notes": st.column_config.TextColumn("Mgr Note", disabled=True),
                    "Issue Qty": st.column_config.NumberColumn(min_value=1, required=True),
                    "Process": st.column_config.CheckboxColumn(default=False)
                },
                hide_index=True, width="stretch", key="sk_edit"
            )
            
            if st.button("Confirm Issue"):
                batch_ops = []
                count = 0
                
                for _, row in edited.iterrows():
                    if row['Process']:
                        rid = row['req_id']
                        iq = int(row['Issue Qty'])
                        sn = row['SK Note']
                        fn = f"{row['notes'] or ''} | SK: {sn}" if sn else (row['notes'] or "")
                        
                        batch_ops.append({
                            "query": "UPDATE inventory SET qty = qty - :q WHERE name_en = :n AND location = 'NTCC'",
                            "params": {"q": iq, "n": row['item_name']}
                        })
                        batch_ops.append({
                            "query": "INSERT INTO stock_logs (log_date, user_name, action_type, item_name, location, change_amount, new_qty) VALUES (NOW(), :u, :a, :i, 'NTCC', :c, (SELECT qty FROM inventory WHERE name_en=:i AND location='NTCC'))",
                            "params": {"u": st.session_state.user_info['name'], "a": f"Issued {sel_reg}", "i": row['item_name'], "c": -iq}
                        })
                        batch_ops.append({
                            "query": "UPDATE requests SET status='Issued', qty=:q, notes=:n WHERE req_id=:id",
                            "params": {"q": iq, "n": fn, "id": rid}
                        })
                        count += 1
                
                if batch_ops:
                    if run_batch_actions(batch_ops):
                        st.success(f"Issued {count} items!"); time.sleep(1); st.rerun()

    with t2:
        st.dataframe(run_query("SELECT item_name, qty, unit, region, supervisor_name, request_date FROM requests WHERE status IN ('Issued', 'Received') AND request_date::date = CURRENT_DATE"), width="stretch")
    
    with t3: render_stock_take("NTCC", st.session_state.user_info['name'], "sk_ntcc")
    with t4: render_stock_take("SNC", st.session_state.user_info['name'], "sk_snc")

# ================= SUPERVISOR =================

def supervisor_view():
    user = st.session_state.user_info
    st.header(txt['supervisor_role'])
    t1, t2, t3, t4 = st.tabs([txt['req_form'], "🚚 Pickup", "⏳ Pending", txt['local_inv']])
    
    with t1: # Bulk Request
        st.info("Ordering for: " + user['region'])
        inv = get_inventory("NTCC")
        if not inv.empty:
            df = inv[['name_en', 'category', 'unit']].copy()
            df['Order'] = 0
            
            edited = st.data_editor(
                df, 
                column_config={
                    "name_en": st.column_config.TextColumn("Item", disabled=True),
                    "category": st.column_config.TextColumn(disabled=True),
                    "unit": st.column_config.TextColumn(disabled=True),
                    "Order": st.column_config.NumberColumn("Qty Needed", min_value=0)
                },
                hide_index=True, width="stretch", height=500
            )
            
            if st.button(txt['send_req']):
                to_order = edited[edited['Order'] > 0]
                if not to_order.empty:
                    batch_ops = []
                    for _, row in to_order.iterrows():
                        batch_ops.append({
                            "query": "INSERT INTO requests (supervisor_name, region, item_name, category, qty, unit, status, request_date) VALUES (:s, :r, :i, :c, :q, :u, 'Pending', NOW())",
                            "params": {"s": user['name'], "r": user['region'], "i": row['name_en'], "c": row['category'], "q": int(row['Order']), "u": row['unit']}
                        })
                    if run_batch_actions(batch_ops):
                        st.balloons(); st.success("Sent!"); time.sleep(1); st.rerun()
                else: st.warning("No items selected")

    with t2: # Ready for Pickup
        ready = run_query("SELECT * FROM requests WHERE supervisor_name=:s AND status='Issued'", {"s": user['name']})
        if ready.empty: st.info("Nothing to pickup")
        else:
            # Group by region tabs if Supervisor manages multiple (rare but handled)
            # Or just show all if single region
            sel_all = st.checkbox("Select All")
            ready['Confirm'] = sel_all
            
            edited = st.data_editor(
                ready[['req_id', 'item_name', 'qty', 'unit', 'notes', 'Confirm']],
                column_config={"req_id": None, "item_name": st.column_config.TextColumn(disabled=True), "qty": st.column_config.NumberColumn(disabled=True), "notes": st.column_config.TextColumn(disabled=True)},
                hide_index=True, width="stretch"
            )
            
            if st.button("Confirm Receipt"):
                batch_ops = []
                for _, row in edited.iterrows():
                    if row['Confirm']:
                        batch_ops.append({
                            "query": "UPDATE requests SET status='Received' WHERE req_id=:id",
                            "params": {"id": row['req_id']}
                        })
                        
                        # Upsert Check
                        cur_qty = get_local_qty(user['region'], row['item_name'])
                        chk = run_query("SELECT id FROM local_inventory WHERE region=:r AND item_name=:i", {"r": user['region'], "i": row['item_name']})
                        
                        if chk.empty:
                            batch_ops.append({
                                "query": "INSERT INTO local_inventory (region, item_name, qty, last_updated, updated_by) VALUES (:r, :i, :q, NOW(), :u)",
                                "params": {"r": user['region'], "i": row['item_name'], "q": int(row['qty']), "u": user['name']}
                            })
                        else:
                             batch_ops.append({
                                    "query": "UPDATE local_inventory SET qty = qty + :q, last_updated=NOW(), updated_by=:u WHERE region=:r AND item_name=:i",
                                    "params": {"q": int(row['qty']), "u": user['name'], "r": user['region'], "i": row['item_name']}
                                })
                
                if batch_ops:
                    if run_batch_actions(batch_ops):
                        st.balloons(); st.success("Inventory Updated!"); time.sleep(1); st.rerun()

    with t3: # Edit Pending
        pending = run_query("SELECT req_id, item_name, qty, unit FROM requests WHERE supervisor_name=:s AND status='Pending'", {"s": user['name']})
        if not pending.empty:
            bulk_act = st.radio("Bulk Action:", ["Maintain", "Cancel All"], horizontal=True)
            pending['New Qty'] = pending['qty']
            pending['Delete'] = True if bulk_act == "Cancel All" else False
            
            edited = st.data_editor(
                pending,
                column_config={"req_id": None, "item_name": st.column_config.TextColumn(disabled=True), "qty": st.column_config.NumberColumn(disabled=True), "New Qty": st.column_config.NumberColumn(min_value=1)},
                hide_index=True, width="stretch"
            )
            
            if st.button("Apply Updates"):
                batch_ops = []
                for _, row in edited.iterrows():
                    if row['Delete']:
                        batch_ops.append({"query": "DELETE FROM requests WHERE req_id=:id", "params": {"id": row['req_id']}})
                    elif int(row['New Qty']) != int(row['qty']):
                        batch_ops.append({"query": "UPDATE requests SET qty=:q WHERE req_id=:id", "params": {"q": int(row['New Qty']), "id": row['req_id']}})
                
                if batch_ops:
                    if run_batch_actions(batch_ops): st.success("Updated"); st.rerun()
        else: st.info("No pending requests")

    with t4: # Stock Take (Tabs for Areas)
        st.info("Update actual quantities (Weekly Stock Take)")
        # Supervisors usually manage 1 region, but if multiregion, tabs help.
        # We assume 1 region for simplicity based on user profile, but code supports robust view.
        
        # 1. Get Master (NTCC) list to allow counting items not yet in local DB
        master = get_inventory("NTCC")[['name_en']].drop_duplicates()
        local = run_query("SELECT item_name, qty FROM local_inventory WHERE region=:r", {"r": user['region']})
        
        if not local.empty:
            df = pd.merge(master, local, left_on='name_en', right_on='item_name', how='left')
            df['qty'] = df['qty'].fillna(0).astype(int)
            df['item_name'] = df['name_en']
        else:
            df = master.copy()
            df['qty'] = 0
            df['item_name'] = df['name_en']
            
        df = df[['item_name', 'qty']]
        df['Actual'] = df['qty']
        
        edited = st.data_editor(
            df,
            column_config={
                "item_name": st.column_config.TextColumn(disabled=True),
                "qty": st.column_config.NumberColumn("System", disabled=True),
                "Actual": st.column_config.NumberColumn(min_value=0)
            },
            hide_index=True, width="stretch", height=500
        )
        
        if st.button("Submit Count"):
            batch_ops = []
            for _, row in edited.iterrows():
                sys = int(row['qty'])
                act = int(row['Actual'])
                
                if sys != act or sys == 0: 
                    chk = run_query("SELECT id FROM local_inventory WHERE region=:r AND item_name=:i", {"r": user['region'], "i": row['item_name']})
                    if chk.empty:
                        batch_ops.append({
                            "query": "INSERT INTO local_inventory (region, item_name, qty, last_updated, updated_by) VALUES (:r, :i, :q, NOW(), :u)",
                            "params": {"r": user['region'], "i": row['item_name'], "q": act, "u": user['name']}
                        })
                    else:
                        if sys != act:
                            batch_ops.append({
                                "query": "UPDATE local_inventory SET qty=:q, last_updated=NOW(), updated_by=:u WHERE region=:r AND item_name=:i",
                                "params": {"q": act, "u": user['name'], "r": user['region'], "i": row['item_name']}
                            })
            
            if batch_ops:
                if run_batch_actions(batch_ops): st.success(f"Stock updated"); time.sleep(1); st.rerun()

# --- 8. تشغيل التطبيق ---
if st.session_state.logged_in:
    show_main_app()
else:
    show_login()
