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

# --- 3. الثوابت ---
CATS_EN = ["Electrical", "Chemical", "Hand Tools", "Consumables", "Safety", "Others"]
LOCATIONS = ["NTCC", "SNC"]
EXTERNAL_PROJECTS = ["KASCH", "KAMC", "KSSH Altaif"]
AREAS = [
    "OPD", "Imeging", "Neurodiangnostic", "E.R", 
    "1s floor", "Service Area", "ICU 28", "ICU 29", 
    "O.R", "Recovery", "RT and Waiting area", 
    "Ward 30-31", "Ward 40-41", "Ward50-51"
]

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
    "local_inv": "Branch Inventory Reports", "req_form": "Request Items", 
    "select_item": "Select Item", "qty_req": "Request Qty", "send_req": "Send Request",
    "approved_reqs": "📦 Pending Issue (By Area)", "issue": "Confirm Issue 📦",
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

# --- 5. دوال قاعدة البيانات ---
def run_query(query, params=None):
    try: return conn.query(query, params=params, ttl=0)
    except Exception as e: st.error(f"DB Error: {e}"); return pd.DataFrame()

def run_action(query, params=None):
    try:
        with conn.session as session:
            session.execute(text(query), params); session.commit()
        return True
    except Exception as e: st.error(f"DB Action Error: {e}"); return False

# --- 6. المنطق (Logic) ---
def login_user(username, password):
    df = run_query("SELECT * FROM users WHERE username = :u AND password = :p", params={"u": username, "p": password})
    return df.iloc[0].to_dict() if not df.empty else None

def register_user(username, password, name, region):
    return run_action("INSERT INTO users (username, password, name, role, region) VALUES (:u, :p, :n, 'supervisor', :r)",
                      params={"u": username, "p": password, "n": name, "r": region})

def update_user_profile_full(old_username, new_username, new_name, new_pass):
    if new_username != old_username:
        if not run_query("SELECT username FROM users WHERE username = :u", params={"u": new_username}).empty:
            return False, "Username taken!"
    return run_action("UPDATE users SET username = :nu, name = :nn, password = :np WHERE username = :ou",
                      {"nu": new_username, "nn": new_name, "np": new_pass, "ou": old_username}), "Updated"

def get_inventory(location):
    return run_query("SELECT * FROM inventory WHERE location = :loc ORDER BY name_en", params={"loc": location})

# تم التعديل: تحويل change إلى int()
def update_central_stock(item_name, location, change, user, action_desc, unit):
    change = int(change) # Fix numpy error
    df = run_query("SELECT qty FROM inventory WHERE name_en = :name AND location = :loc", params={"name": item_name, "loc": location})
    if df.empty: return False, "Item not found"
    current_qty = int(df.iloc[0]['qty'])
    if change < 0 and abs(change) > current_qty: return False, "Insufficient stock"
    new_qty = current_qty + change
    try:
        with conn.session as s:
            s.execute(text("UPDATE inventory SET qty = :nq WHERE name_en = :name AND location = :loc"), {"nq": new_qty, "name": item_name, "loc": location})
            s.execute(text("INSERT INTO stock_logs (log_date, user_name, action_type, item_name, location, change_amount, new_qty) VALUES (NOW(), :u, :act, :item, :loc, :chg, :nq)"),
                      {"u": user, "act": f"{action_desc} ({unit})", "item": item_name, "loc": location, "chg": change, "nq": new_qty})
            s.commit()
        return True, "Success"
    except Exception as e: return False, str(e)

# تم التعديل: تحويل qty إلى int()
def transfer_stock(item_name, qty, user, unit):
    qty = int(qty) # Fix numpy error
    ok, msg = update_central_stock(item_name, "SNC", -qty, user, "Transfer Out", unit)
    if not ok: return False, msg
    df = run_query("SELECT * FROM inventory WHERE name_en = :n AND location = 'NTCC'", params={"n": item_name})
    if df.empty: run_action("INSERT INTO inventory (name_en, category, unit, qty, location) VALUES (:n, 'Transferred', :u, 0, 'NTCC')", params={"n": item_name, "u": unit})
    ok2, msg2 = update_central_stock(item_name, "NTCC", qty, user, "Transfer In", unit)
    if not ok2: return False, msg2
    return True, "Transfer Complete"

def handle_external_transfer(item_name, my_loc, ext_proj, action, qty, user, unit):
    desc = f"Loan {action} {ext_proj}"
    change = -int(qty) if action == "Lend" else int(qty)
    return update_central_stock(item_name, my_loc, change, user, desc, unit)

def receive_from_cww(item_name, dest_loc, qty, user, unit):
    return update_central_stock(item_name, dest_loc, int(qty), user, "Received from CWW", unit)

# تم التعديل: تحويل new_qty إلى int() (هذا هو سبب الخطأ الرئيسي)
def update_local_inventory(region, item_name, new_qty, user):
    new_qty = int(new_qty) # Fix numpy error
    df = run_query("SELECT id FROM local_inventory WHERE region = :r AND item_name = :i", params={"r": region, "i": item_name})
    if not df.empty:
        return run_action("UPDATE local_inventory SET qty = :q, last_updated = NOW(), updated_by = :u WHERE region = :r AND item_name = :i", 
                          params={"q": new_qty, "u": user, "r": region, "i": item_name})
    else:
        return run_action("INSERT INTO local_inventory (region, item_name, qty, last_updated, updated_by) VALUES (:r, :i, :q, NOW(), :u)", 
                          params={"r": region, "i": item_name, "q": new_qty, "u": user})

# تم التعديل: تحويل qty إلى int()
def create_request(supervisor, region, item, category, qty, unit):
    return run_action("INSERT INTO requests (supervisor_name, region, item_name, category, qty, unit, status, request_date) VALUES (:s, :r, :i, :c, :q, :u, 'Pending', NOW())",
                      params={"s": supervisor, "r": region, "i": item, "c": category, "q": int(qty), "u": unit})

# تم التعديل: تحويل new_qty إلى int()
def update_request_details(req_id, new_qty, notes):
    query = "UPDATE requests SET qty = :q"
    params = {"q": int(new_qty), "id": req_id}
    if notes is not None:
        query += ", notes = :n"
        params['n'] = notes
    query += " WHERE req_id = :id"
    return run_action(query, params)

# تم التعديل: تحويل final_qty إلى int()
def update_request_status(req_id, status, final_qty=None, notes=None):
    query = "UPDATE requests SET status = :s"
    params = {"s": status, "id": req_id}
    if final_qty is not None: 
        query += ", qty = :q"
        params["q"] = int(final_qty)
    if notes is not None: 
        query += ", notes = :n"
        params["n"] = notes
    query += " WHERE req_id = :id"
    return run_action(query, params)

def delete_request(req_id):
    return run_action("DELETE FROM requests WHERE req_id = :id", params={"id": req_id})

def get_local_inventory_by_item(region, item_name):
    df = run_query("SELECT qty FROM local_inventory WHERE region = :r AND item_name = :i", params={"r": region, "i": item_name})
    return int(df.iloc[0]['qty']) if not df.empty else 0

# --- 7. الواجهات (Views) ---

def show_login():
    st.title(f"🔐 {txt['app_title']}")
    t1, t2 = st.tabs([txt['login_page'], txt['register_page']])
    
    with t1:
        with st.form("login_form"):
            u = st.text_input(txt['username'])
            p = st.text_input(txt['password'], type="password")
            if st.form_submit_button(txt['login_btn'], use_container_width=True):
                user_data = login_user(u.strip(), p.strip())
                if user_data:
                    st.session_state.logged_in = True
                    st.session_state.user_info = user_data
                    st.rerun()
                else: st.error(txt['error_login'])

    with t2:
        with st.form("register_form"):
            nu = st.text_input(txt['username'])
            np = st.text_input(txt['password'], type='password')
            nn = st.text_input(txt['fullname'])
            nr = st.selectbox(txt['region'], AREAS)
            if st.form_submit_button(txt['register_btn'], use_container_width=True):
                if register_user(nu.strip(), np.strip(), nn, nr): st.success(txt['success_reg'])
                else: st.error("Error: Username might exist")

def show_main_app():
    info = st.session_state.user_info
    
    # Sidebar
    st.sidebar.title(f"👤 {info['name']}")
    st.sidebar.caption(f"📍 {info['region']} | 🔑 {info['role']}")
    
    if st.sidebar.button(txt['refresh_data'], use_container_width=True): st.rerun()
    
    with st.sidebar.expander(f"🛠 {txt['edit_profile']}"):
        new_u = st.text_input(txt['username'], value=info['username'])
        new_n = st.text_input(txt['new_name'], value=info['name'])
        new_p = st.text_input(txt['new_pass'], type="password", value=info['password'])
        if st.button(txt['save_changes'], use_container_width=True):
            res, msg = update_user_profile_full(info['username'], new_u, new_n, new_p)
            if res:
                st.success(msg)
                st.session_state.logged_in = False
                st.rerun()
            else: st.error(msg)

    if st.sidebar.button(txt['logout'], use_container_width=True):
        st.session_state.logged_in = False
        st.session_state.user_info = {}
        st.rerun()

    if info['role'] == 'manager': manager_view()
    elif info['role'] == 'storekeeper': storekeeper_view()
    else: supervisor_view()

# ==========================================
# ============ MANAGER VIEW ================
# ==========================================
def manager_view():
    st.header(txt['manager_role'])
    tab1, tab2, tab3, tab4, tab5 = st.tabs(["📦 Stock", txt['ext_tab'], "⏳ Requests", txt['local_inv'], "📜 Logs"])
    
    with tab1: # Central Stock
        with st.expander(txt['create_item_title'], expanded=False):
            c1, c2, c3, c4 = st.columns(4)
            n = c1.text_input("Name")
            c = c2.selectbox("Category", CATS_EN)
            l = c3.selectbox("Location", LOCATIONS)
            q = c4.number_input("Qty", 0, 10000)
            u = st.selectbox("Unit", ["Piece", "Carton", "Set"])
            if st.button(txt['create_btn'], use_container_width=True):
                if n and run_query("SELECT id FROM inventory WHERE name_en=:n AND location=:l", {"n":n, "l":l}).empty:
                    run_action("INSERT INTO inventory (name_en, category, unit, location, qty, status) VALUES (:n, :c, :u, :l, :q, 'Available')",
                              {"n":n, "c":c, "u":u, "l":l, "q":int(q)})
                    st.success("Added"); st.rerun()
                else: st.error("Exists")
        st.divider()
        c1, c2 = st.columns(2)
        with c1:
            st.markdown("### 🏢 NTCC")
            st.dataframe(get_inventory("NTCC"), use_container_width=True)
        with c2:
            st.markdown("### 🏭 SNC")
            st.dataframe(get_inventory("SNC"), use_container_width=True)

    with tab2: # External
        c1, c2 = st.columns(2)
        with c1:
            st.subheader(txt['project_loans'])
            with st.container(border=True):
                wh = st.selectbox("From Warehouse", LOCATIONS, key="l_wh")
                proj = st.selectbox("External Project", EXTERNAL_PROJECTS)
                inv = get_inventory(wh)
                if not inv.empty:
                    it = st.selectbox("Select Item", inv['name_en'].unique(), key="l_it")
                    row = inv[inv['name_en']==it].iloc[0]
                    st.caption(f"Stock: {row['qty']} {row['unit']}")
                    op = st.radio("Operation", ["Lend", "Borrow"], horizontal=True)
                    amt = st.number_input("Quantity", 1, 10000, key="l_q")
                    if st.button(txt['exec_trans'], use_container_width=True, key="btn_l"):
                        change = -amt if op=="Lend" else amt
                        res, msg = update_central_stock(it, wh, change, st.session_state.user_info['name'], f"Loan {op} {proj}", row['unit'])
                        if res: st.success("Done"); st.rerun()
                        else: st.error(msg)
        with c2:
            st.subheader(txt['cww_supply'])
            with st.container(border=True):
                dest = st.selectbox("To Warehouse", LOCATIONS, key="c_wh")
                inv = get_inventory(dest)
                if not inv.empty:
                    it = st.selectbox("Item Received", inv['name_en'].unique(), key="c_it")
                    row = inv[inv['name_en']==it].iloc[0]
                    amt = st.number_input("Quantity", 1, 10000, key="c_q")
                    if st.button("Receive from CWW", use_container_width=True, key="btn_c"):
                        res, msg = update_central_stock(it, dest, amt, st.session_state.user_info['name'], "From CWW", row['unit'])
                        if res: st.success("Done"); st.rerun()
                        else: st.error(msg)
        
        st.divider()
        st.markdown("### 📊 Project Loan History")
        loan_logs = run_query("SELECT log_date, item_name, change_amount, location, action_type FROM stock_logs WHERE action_type LIKE '%Loan%' ORDER BY log_date DESC")
        if not loan_logs.empty:
            c_lent, c_borrowed = st.columns(2)
            with c_lent:
                st.markdown("**➡️ Lend (Out)**")
                st.dataframe(loan_logs[loan_logs['action_type'].str.contains("Lend")], use_container_width=True)
            with c_borrowed:
                st.markdown("**⬅️ Borrow (In)**")
                st.dataframe(loan_logs[loan_logs['action_type'].str.contains("Borrow")], use_container_width=True)

    with tab3: # Requests
        reqs = run_query("SELECT * FROM requests WHERE status='Pending' ORDER BY request_date DESC")
        if reqs.empty: st.info("No pending requests")
        else:
            regions = reqs['region'].unique()
            region_tabs = st.tabs(list(regions))
            for i, region in enumerate(regions):
                with region_tabs[i]:
                    region_reqs = reqs[reqs['region'] == region]
                    for _, r in region_reqs.iterrows():
                        with st.container(border=True):
                            c1, c2 = st.columns([1, 1])
                            with c1:
                                st.markdown(f"**{r['item_name']}**")
                                st.caption(f"Requested: **{r['qty']} {r['unit']}** | By: {r['supervisor_name']}")
                                stock = run_query("SELECT qty FROM inventory WHERE name_en=:n AND location='NTCC'", {"n":r['item_name']})
                                avail = stock.iloc[0]['qty'] if not stock.empty else 0
                                st.info(f"NTCC Stock: {avail}")
                            with c2:
                                new_q = st.number_input("Approve Qty", 1, 10000, int(r['qty']), key=f"q_{r['req_id']}")
                                note = st.text_input("Manager Note (Reason if Short)", key=f"n_{r['req_id']}")
                                c_a, c_b, c_c = st.columns(3)
                                if c_a.button("✅ Approve", key=f"ap_{r['req_id']}"):
                                    if avail >= new_q:
                                        final_note = f"Manager: {note}" if note else ""
                                        run_action("UPDATE requests SET status='Approved', qty=:q, notes=:n WHERE req_id=:id", {"q":int(new_q), "n":final_note, "id":r['req_id']})
                                        st.rerun()
                                    else: st.error("Low Stock")
                                if c_b.button("❌ Reject", key=f"rj_{r['req_id']}"):
                                    run_action("UPDATE requests SET status='Rejected', notes=:n WHERE req_id=:id", {"n":note, "id":r['req_id']})
                                    st.rerun()
                                if c_c.button("💾 Save", key=f"sv_{r['req_id']}"):
                                    update_request_details(r['req_id'], int(new_q), note)
                                    st.success("Saved"); st.rerun()

    with tab4: # Reports
        st.subheader("📊 Detailed Branch Inventory")
        area = st.selectbox("Select Area", AREAS)
        df = run_query("SELECT item_name, qty, last_updated, updated_by FROM local_inventory WHERE region=:r ORDER BY item_name", {"r":area})
        st.dataframe(df, use_container_width=True)

    with tab5: # Logs
        st.dataframe(run_query("SELECT * FROM stock_logs ORDER BY log_date DESC LIMIT 50"), use_container_width=True)

# ==========================================
# ============ STOREKEEPER VIEW ============
# ==========================================
def storekeeper_view():
    st.header(txt['storekeeper_role'])
    t1, t2, t3, t4 = st.tabs([txt['approved_reqs'], "📋 Issued Today", "NTCC", "SNC"])
    
    with t1:
        reqs = run_query("SELECT * FROM requests WHERE status='Approved'")
        if reqs.empty: st.info("No tasks")
        else:
            regions = reqs['region'].unique()
            if len(regions) > 0:
                rtabs = st.tabs(list(regions))
                for i, region in enumerate(regions):
                    with rtabs[i]:
                        r_data = reqs[reqs['region'] == region]
                        for _, r in r_data.iterrows():
                            with st.container(border=True):
                                c1, c2 = st.columns([1, 1])
                                with c1:
                                    st.markdown(f"**{r['item_name']}**")
                                    st.markdown(f"Approved Qty: **{r['qty']} {r['unit']}**")
                                    if r['notes']: st.warning(f"📝 {r['notes']}")
                                with c2:
                                    final_issue_qty = st.number_input("Final Issue Qty", 1, 10000, int(r['qty']), key=f"sk_q_{r['req_id']}")
                                    sk_note = st.text_input("Storekeeper Note", key=f"sk_n_{r['req_id']}")
                                    
                                    if st.button("Confirm Issue 📦", key=f"iss_{r['req_id']}"):
                                        existing_note = r['notes'] if r['notes'] else ""
                                        final_note = f"{existing_note} | Storekeeper: {sk_note}" if sk_note else existing_note
                                        
                                        res, msg = update_central_stock(r['item_name'], "NTCC", -final_issue_qty, st.session_state.user_info['name'], f"Issued {r['region']}", r['unit'])
                                        if res:
                                            run_action("UPDATE requests SET status='Issued', qty=:q, notes=:n WHERE req_id=:id", 
                                                      {"q":int(final_issue_qty), "n":final_note, "id":r['req_id']})
                                            st.success("Issued & Ready for Pickup"); st.rerun()
                                        else: st.error(msg)

    with t2: # Issued Today
        st.subheader("📋 Items Issued Today")
        today_log = run_query("""
            SELECT item_name, qty, unit, region, supervisor_name, notes, request_date 
            FROM requests 
            WHERE status IN ('Issued', 'Received') 
            AND request_date::date = CURRENT_DATE
            ORDER BY request_date DESC
        """)
        if today_log.empty: st.info("Nothing issued today yet.")
        else: st.dataframe(today_log, use_container_width=True)

    with t3:
        st.dataframe(get_inventory("NTCC"), use_container_width=True)
    with t4:
        st.dataframe(get_inventory("SNC"), use_container_width=True)

# ==========================================
# ============ SUPERVISOR VIEW =============
# ==========================================
def supervisor_view():
    user = st.session_state.user_info
    st.header(txt['supervisor_role'])
    t1, t2, t3, t4 = st.tabs([txt['req_form'], "🚚 Ready for Pickup", "⏳ My Pending", txt['local_inv']])
    
    with t1:
        reg = st.selectbox("Region", AREAS, index=AREAS.index(user['region']) if user['region'] in AREAS else 0)
        inv = get_inventory("NTCC")
        if not inv.empty:
            it = st.selectbox("Item", inv['name_en'].unique())
            row = inv[inv['name_en']==it].iloc[0]
            q = st.number_input("Qty", 1, 1000)
            if st.button(txt['send_req'], use_container_width=True):
                run_action("INSERT INTO requests (supervisor_name, region, item_name, category, qty, unit, status, request_date) VALUES (:s, :r, :i, :c, :q, :u, 'Pending', NOW())",
                          {"s":user['name'], "r":reg, "i":it, "c":row['category'], "q":int(q), "u":row['unit']})
                st.success("Sent"); st.rerun()

    with t2: # Ready for Pickup
        ready = run_query("SELECT * FROM requests WHERE supervisor_name=:s AND status='Issued'", {"s": user['name']})
        if ready.empty: st.info("No items ready for pickup.")
        else:
            for _, r in ready.iterrows():
                with st.container(border=True):
                    st.success(f"✅ **Ready:** {r['item_name']} ({r['qty']} {r['unit']})")
                    if r['notes']: st.warning(f"📝 Notes: {r['notes']}")
                    
                    if st.button("Confirm Receipt & Add to Inventory 📥", key=f"rec_{r['req_id']}", use_container_width=True):
                        run_action("UPDATE requests SET status='Received' WHERE req_id=:id", {"id":r['req_id']})
                        cur = run_query("SELECT qty FROM local_inventory WHERE region=:r AND item_name=:i", {"r":r['region'], "i":r['item_name']})
                        old_q = cur.iloc[0]['qty'] if not cur.empty else 0
                        
                        if cur.empty:
                            run_action("INSERT INTO local_inventory (region, item_name, qty, last_updated, updated_by) VALUES (:r, :i, :q, NOW(), :u)",
                                      {"r":r['region'], "i":r['item_name'], "q":old_q+int(r['qty']), "u":user['name']})
                        else:
                            run_action("UPDATE local_inventory SET qty=:q, last_updated=NOW(), updated_by=:u WHERE region=:r AND item_name=:i",
                                      {"q":old_q+int(r['qty']), "u":user['name'], "r":r['region'], "i":r['item_name']})
                        
                        st.balloons()
                        st.success("Received and Inventory Updated!"); time.sleep(1); st.rerun()

    with t3: # Edit Pending
        pending = run_query("SELECT * FROM requests WHERE supervisor_name=:s AND status='Pending' ORDER BY request_date DESC", {"s": user['name']})
        if pending.empty: st.info("No pending requests.")
        else:
            for _, r in pending.iterrows():
                with st.container(border=True):
                    c1, c2 = st.columns([2, 1])
                    with c1:
                        st.markdown(f"**{r['item_name']}**")
                    with c2:
                        new_q_sup = st.number_input("Edit Qty", 1, 1000, int(r['qty']), key=f"sup_q_{r['req_id']}")
                        c_up, c_del = st.columns(2)
                        if c_up.button("Update", key=f"sup_up_{r['req_id']}"):
                            update_request(r['req_id'], int(new_q_sup))
                            st.success("Updated"); st.rerun()
                        if c_del.button("Cancel 🗑️", key=f"sup_del_{r['req_id']}"):
                            delete_request(r['req_id'])
                            st.success("Deleted"); st.rerun()

    with t4: # Local Inventory
        st.info("Update Local Inventory")
        inv = get_inventory("NTCC")
        it = st.selectbox("Item Update", inv['name_en'].unique(), key="up_it")
        cur = run_query("SELECT qty FROM local_inventory WHERE region=:r AND item_name=:i", {"r":user['region'], "i":it})
        curr_q = cur.iloc[0]['qty'] if not cur.empty else 0
        
        c1, c2 = st.columns([1, 2])
        c1.metric("Current", curr_q)
        new_v = c2.number_input("New Count", 0, 10000, curr_q)
        
        if st.button("Update Count"):
            if cur.empty:
                run_action("INSERT INTO local_inventory (region, item_name, qty, last_updated, updated_by) VALUES (:r, :i, :q, NOW(), :u)",
                          {"r":user['region'], "i":it, "q":int(new_v), "u":user['name']})
            else:
                run_action("UPDATE local_inventory SET qty=:q, last_updated=NOW(), updated_by=:u WHERE region=:r AND item_name=:i",
                          {"r":user['region'], "i":it, "q":int(new_v), "u":user['name']})
            st.success("Updated"); st.rerun()
            
        st.divider()
        st.markdown("### 📋 My Count History")
        my_counts = run_query("SELECT region, item_name, qty, last_updated FROM local_inventory WHERE updated_by=:u ORDER BY last_updated DESC", {"u":user['name']})
        if not my_counts.empty:
            regions_counted = my_counts['region'].unique()
            ctabs = st.tabs(list(regions_counted))
            for i, reg in enumerate(regions_counted):
                with ctabs[i]:
                    st.dataframe(my_counts[my_counts['region'] == reg], use_container_width=True)
        else: st.info("No counts recorded yet.")

# --- 8. تشغيل التطبيق ---
if st.session_state.logged_in:
    show_main_app()
else:
    show_login()
