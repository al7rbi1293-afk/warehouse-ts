import streamlit as st
import pandas as pd
from datetime import datetime
from sqlalchemy import text
import time

# --- 1. إعداد الصفحة ---
st.set_page_config(page_title="WMS Pro", layout="wide", initial_sidebar_state="expanded")

# --- 2. التصميم المتناسق والاحترافي (CSS) ---
st.markdown("""
    <style>
    /* استيراد خطوط واضحة */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    /* المتغيرات اللونية (Theme Variables) */
    :root {
        --primary: #2563eb; /* Royal Blue */
        --primary-hover: #1d4ed8;
        --bg-color: #f8fafc; /* Slate 50 */
        --card-bg: #ffffff;
        --text-color: #1e293b; /* Slate 800 */
        --border-color: #e2e8f0;
    }

    /* تنسيق الجسم العام */
    .stApp {
        background-color: #f8fafc;
        font-family: 'Inter', sans-serif;
        color: #1e293b;
    }

    /* تحسين القائمة الجانبية */
    section[data-testid="stSidebar"] {
        background-color: #ffffff;
        border-right: 1px solid #e2e8f0;
    }

    /* تحسين البطاقات والحاويات */
    div[data-testid="stVerticalBlock"] > div {
        background-color: transparent;
    }
    
    /* تصميم الحاويات البيضاء (Cards) */
    .css-card {
        background-color: white;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        margin-bottom: 20px;
    }

    /* تنسيق الأزرار الرئيسي */
    .stButton button {
        background-color: #2563eb;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 0.5rem 1rem;
        font-weight: 500;
        transition: all 0.2s ease;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .stButton button:hover {
        background-color: #1d4ed8;
        transform: translateY(-1px);
        box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
    }
    
    /* أزرار ثانوية (مثل التحديث) */
    button[kind="secondary"] {
        background-color: white;
        color: #475569;
        border: 1px solid #cbd5e1;
    }

    /* حقول الإدخال */
    .stTextInput input, .stSelectbox div[data-baseweb="select"], .stNumberInput input {
        background-color: white;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        color: #1e293b;
    }
    .stTextInput input:focus, .stSelectbox div[data-baseweb="select"]:focus {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    /* تحسين التبويبات (Tabs) */
    .stTabs [data-baseweb="tab-list"] {
        gap: 20px;
        border-bottom: 1px solid #e2e8f0;
    }
    .stTabs [data-baseweb="tab"] {
        background-color: transparent;
        border: none;
        color: #64748b;
        font-weight: 600;
        padding-bottom: 10px;
    }
    .stTabs [aria-selected="true"] {
        color: #2563eb;
        border-bottom: 2px solid #2563eb;
    }

    /* إخفاء الهيدر الافتراضي */
    header {visibility: hidden;}

    /* تذييل الصفحة */
    .footer {
        position: fixed; left: 0; bottom: 0; width: 100%;
        background: white; border-top: 1px solid #e2e8f0;
        text-align: center; padding: 10px; font-size: 12px; color: #94a3b8;
        z-index: 100;
    }
    
    /* بطاقة تسجيل الدخول */
    .login-wrapper {
        display: flex; justify-content: center; align-items: center;
        padding-top: 50px;
    }
    .login-box {
        background: white; padding: 40px; border-radius: 16px;
        width: 100%; max-width: 420px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
        border: 1px solid #f1f5f9; text-align: center;
    }
    </style>
    <div class="footer">Professional WMS © 2025</div>
""", unsafe_allow_html=True)

# --- 3. إدارة الجلسة ---
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.user_info = {}

# --- 4. الثوابت ---
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
    "app_title": "WMS Pro",
    "login_page": "Sign In", "register_page": "Register",
    "username": "Username", "password": "Password",
    "fullname": "Full Name", "region": "Region",
    "login_btn": "Access Account", "register_btn": "Create Account", "logout": "Log Out",
    "manager_role": "Manager Dashboard", "supervisor_role": "Supervisor Portal", "storekeeper_role": "Store Keeper Panel",
    "create_item_title": "Add New Item", "create_btn": "Save Item",
    "ext_tab": "External Operations", "project_loans": "Project Loans",
    "cww_supply": "Central Supply (CWW)", "exec_trans": "Execute Transaction",
    "refresh_data": "Refresh Data", "notes": "Notes",
    "save_mod": "Save Changes", "insufficient_stock_sk": "❌ Error: Low Stock!",
    "error_login": "Invalid credentials", "success_reg": "Registration successful! Please login.",
    "local_inv": "Local Inventory", "req_form": "New Request", 
    "select_item": "Select Item", "qty_req": "Quantity", "send_req": "Submit Request",
    "approved_reqs": "Pending Issue", "issue": "Confirm Issue",
    "transfer_btn": "Transfer Stock", "edit_profile": "Profile Settings", 
    "new_name": "Full Name", "new_pass": "New Password", "save_changes": "Update Profile",
    "update_btn": "Update Request"
}

# --- 5. الاتصال والقاعدة ---
try:
    conn = st.connection("supabase", type="sql")
except:
    st.error("⚠️ Database Connection Error. Check secrets.")
    st.stop()

def run_query(query, params=None):
    try: return conn.query(query, params=params, ttl=0)
    except Exception as e: st.error(f"DB Error: {e}"); return pd.DataFrame()

def run_action(query, params=None):
    try:
        with conn.session as session:
            session.execute(text(query), params); session.commit()
        return True
    except Exception as e: st.error(f"Action Error: {e}"); return False

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
                      {"nu": new_username, "nn": new_name, "np": new_pass, "ou": old_username}), "Updated!"

# --- Helpers ---
def get_inventory(location):
    return run_query("SELECT * FROM inventory WHERE location = :loc ORDER BY name_en", params={"loc": location})

def update_central_stock(item_name, location, change, user, action_desc, unit):
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

def transfer_stock(item_name, qty, user, unit):
    ok, msg = update_central_stock(item_name, "SNC", -qty, user, "Transfer Out", unit)
    if not ok: return False, msg
    df = run_query("SELECT * FROM inventory WHERE name_en = :n AND location = 'NTCC'", params={"n": item_name})
    if df.empty: run_action("INSERT INTO inventory (name_en, category, unit, qty, location) VALUES (:n, 'Transferred', :u, 0, 'NTCC')", params={"n": item_name, "u": unit})
    ok2, msg2 = update_central_stock(item_name, "NTCC", qty, user, "Transfer In", unit)
    if not ok2: return False, msg2
    return True, "Transfer Complete"

def handle_external_transfer(item_name, my_loc, ext_proj, action, qty, user, unit):
    desc = f"Loan {action} {ext_proj}"
    change = -qty if action == "Lend" else qty
    return update_central_stock(item_name, my_loc, change, user, desc, unit)

def receive_from_cww(item_name, dest_loc, qty, user, unit):
    return update_central_stock(item_name, dest_loc, qty, user, "From CWW", unit)

def update_local_inventory(region, item_name, new_qty, user):
    df = run_query("SELECT id FROM local_inventory WHERE region = :r AND item_name = :i", params={"r": region, "i": item_name})
    if not df.empty:
        return run_action("UPDATE local_inventory SET qty = :q, last_updated = NOW(), updated_by = :u WHERE region = :r AND item_name = :i", 
                          params={"q": new_qty, "u": user, "r": region, "i": item_name})
    else:
        return run_action("INSERT INTO local_inventory (region, item_name, qty, last_updated, updated_by) VALUES (:r, :i, :q, NOW(), :u)", 
                          params={"r": region, "i": item_name, "q": new_qty, "u": user})

# --- 7. الواجهات (UI Views) ---

def show_login():
    # تصميم صفحة الدخول (Centered Card)
    col1, col2, col3 = st.columns([1, 1.2, 1])
    with col2:
        st.markdown("<br><br>", unsafe_allow_html=True)
        st.markdown(f"""
        <div class="login-box" style="background:white; padding:40px; border-radius:15px; border:1px solid #e2e8f0; text-align:center;">
            <div style="font-size:40px; margin-bottom:10px;">🏭</div>
            <h2 style="color:#1e293b; margin:0;">{txt['app_title']}</h2>
            <p style="color:#64748b; font-size:14px; margin-bottom:20px;">Secure Access Portal</p>
        </div>
        """, unsafe_allow_html=True)
        
        t1, t2 = st.tabs([txt['login_page'], txt['register_page']])
        with t1:
            with st.form("login_form"):
                u = st.text_input(txt['username'], placeholder="Enter username")
                p = st.text_input(txt['password'], type="password", placeholder="Enter password")
                st.markdown("<br>", unsafe_allow_html=True)
                if st.form_submit_button(txt['login_btn'], use_container_width=True):
                    user_data = login_user(u.strip(), p.strip())
                    if user_data:
                        st.session_state.logged_in = True
                        st.session_state.user_info = user_data
                        st.rerun()
                    else: st.error(txt['error_login'])
        
        with t2:
            with st.form("register_form"):
                nu = st.text_input(txt['username'], placeholder="Username")
                np = st.text_input(txt['password'], type="password", placeholder="Password")
                nn = st.text_input(txt['fullname'], placeholder="Full Name")
                nr = st.selectbox(txt['region'], AREAS)
                st.markdown("<br>", unsafe_allow_html=True)
                if st.form_submit_button(txt['register_btn'], use_container_width=True):
                    if register_user(nu.strip(), np.strip(), nn, nr): st.success(txt['success_reg'])
                    else: st.error("Username taken")

def show_main_app():
    info = st.session_state.user_info
    
    # Sidebar: Clean & Minimal
    with st.sidebar:
        st.markdown(f"""
        <div style="padding:15px; background:#f1f5f9; border-radius:10px; margin-bottom:15px;">
            <h3 style="margin:0; color:#0f172a;">{info['name']}</h3>
            <p style="margin:0; font-size:13px; color:#64748b;">{info['role']} • {info['region']}</p>
        </div>
        """, unsafe_allow_html=True)
        
        if st.button(txt['refresh_data'], use_container_width=True): st.rerun()
        
        with st.expander(f"⚙️ {txt['edit_profile']}"):
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
        
        st.markdown("<br>", unsafe_allow_html=True)
        if st.button(txt['logout'], use_container_width=True):
            st.session_state.logged_in = False
            st.session_state.user_info = {}
            st.rerun()

    if info['role'] == 'manager': manager_view()
    elif info['role'] == 'storekeeper': storekeeper_view()
    else: supervisor_view()

# --- Views ---

def manager_view():
    st.markdown(f"## 📊 {txt['manager_role']}")
    tab1, tab2, tab3, tab4, tab5 = st.tabs(["📦 Inventory", "🔄 External", "⏳ Requests", "📈 Reports", "📜 Logs"])
    
    with tab1: # Inventory
        with st.expander("✨ Add New Item", expanded=False):
            c1, c2, c3, c4 = st.columns(4)
            n = c1.text_input("Item Name")
            c = c2.selectbox("Category", CATS_EN)
            l = c3.selectbox("Location", LOCATIONS)
            q = c4.number_input("Qty", 0, 10000)
            u = st.selectbox("Unit", ["Piece", "Carton", "Set"])
            if st.button(txt['create_btn'], use_container_width=True):
                if n and run_query("SELECT id FROM inventory WHERE name_en=:n AND location=:l", {"n":n, "l":l}).empty:
                    run_action("INSERT INTO inventory (name_en, category, unit, location, qty, status) VALUES (:n, :c, :u, :l, :q, 'Available')",
                              {"n":n, "c":c, "u":u, "l":l, "q":q})
                    st.success("Added!"); st.rerun()
                else: st.error("Error or Exists")
        
        st.markdown("<br>", unsafe_allow_html=True)
        c1, c2 = st.columns(2)
        with c1:
            st.markdown("##### 🏢 Internal (NTCC)")
            st.dataframe(get_inventory("NTCC"), use_container_width=True, height=350)
        with c2:
            st.markdown("##### 🏭 External (SNC)")
            st.dataframe(get_inventory("SNC"), use_container_width=True, height=350)

    with tab2: # External
        c1, c2 = st.columns(2)
        with c1:
            st.subheader(txt['project_loans'])
            with st.container(border=True):
                wh = st.selectbox("From", LOCATIONS, key="l_wh")
                proj = st.selectbox("Project", EXTERNAL_PROJECTS)
                inv = get_inventory(wh)
                if not inv.empty:
                    it = st.selectbox("Item", inv['name_en'].unique(), key="l_it")
                    row = inv[inv['name_en']==it].iloc[0]
                    st.caption(f"Stock: {row['qty']} {row['unit']}")
                    op = st.radio("Type", ["Lend", "Borrow"], horizontal=True)
                    amt = st.number_input("Qty", 1, 10000, key="l_q")
                    if st.button(txt['exec_trans'], use_container_width=True, key="btn_l"):
                        change = -amt if op=="Lend" else amt
                        res, msg = update_central_stock(it, wh, change, st.session_state.user_info['name'], f"Loan {op} {proj}", row['unit'])
                        if res: st.success("Done"); st.rerun()
                        else: st.error(msg)
        with c2:
            st.subheader(txt['cww_supply'])
            with st.container(border=True):
                dest = st.selectbox("To", LOCATIONS, key="c_wh")
                inv = get_inventory(dest)
                if not inv.empty:
                    it = st.selectbox("Item", inv['name_en'].unique(), key="c_it")
                    row = inv[inv['name_en']==it].iloc[0]
                    amt = st.number_input("Qty", 1, 10000, key="c_q")
                    if st.button("Receive", use_container_width=True, key="btn_c"):
                        res, msg = update_central_stock(it, dest, amt, st.session_state.user_info['name'], "From CWW", row['unit'])
                        if res: st.success("Done"); st.rerun()
                        else: st.error(msg)

    with tab3: # Requests
        reqs = run_query("SELECT * FROM requests WHERE status='Pending' ORDER BY request_date DESC")
        if reqs.empty: st.markdown("✅ *No pending requests.*")
        else:
            for _, r in reqs.iterrows():
                with st.container(border=True):
                    c1, c2 = st.columns([2, 1])
                    with c1:
                        st.markdown(f"**{r['item_name']}**")
                        st.caption(f"Qty: {r['qty']} | By: {r['supervisor_name']} | Area: {r['region']}")
                        stock = run_query("SELECT qty FROM inventory WHERE name_en=:n AND location='NTCC'", {"n":r['item_name']})
                        st.markdown(f"Stock: `{stock.iloc[0]['qty'] if not stock.empty else 0}`")
                    with c2:
                        new_q = st.number_input("Approve", 1, 10000, int(r['qty']), key=f"q_{r['req_id']}")
                        note = st.text_input("Note", key=f"n_{r['req_id']}")
                        c_a, c_b = st.columns(2)
                        if c_a.button("✅", key=f"ok_{r['req_id']}"):
                            run_action("UPDATE requests SET status='Approved', qty=:q, notes=:n WHERE req_id=:id", {"q":new_q, "n":note, "id":r['req_id']})
                            st.rerun()
                        if c_b.button("❌", key=f"no_{r['req_id']}"):
                            run_action("UPDATE requests SET status='Rejected', notes=:n WHERE req_id=:id", {"n":note, "id":r['req_id']})
                            st.rerun()

    with tab4: # Reports
        area = st.selectbox("Select Area", AREAS)
        df = run_query("SELECT item_name, qty, last_updated, updated_by FROM local_inventory WHERE region=:r", {"r":area})
        st.dataframe(df, use_container_width=True)

    with tab5: # Logs
        st.dataframe(run_query("SELECT * FROM stock_logs ORDER BY log_date DESC LIMIT 50"), use_container_width=True)

def storekeeper_view():
    st.markdown(f"## 📦 {txt['storekeeper_role']}")
    t1, t2, t3 = st.tabs(["Tasks", "NTCC", "SNC"])
    
    with t1:
        reqs = run_query("SELECT * FROM requests WHERE status='Approved'")
        if reqs.empty: st.info("No tasks available.")
        else:
            for _, r in reqs.iterrows():
                with st.container(border=True):
                    st.markdown(f"**{r['item_name']}** ({r['qty']} {r['unit']}) ➔ {r['region']}")
                    if r['notes']: st.info(f"Note: {r['notes']}")
                    if st.button("Confirm Issue", key=f"iss_{r['req_id']}", use_container_width=True):
                        res, msg = update_central_stock(r['item_name'], "NTCC", -r['qty'], st.session_state.user_info['name'], f"Issued {r['region']}", r['unit'])
                        if res:
                            run_action("UPDATE requests SET status='Issued' WHERE req_id=:id", {"id":r['req_id']})
                            # Auto Update Local
                            cur = run_query("SELECT qty FROM local_inventory WHERE region=:r AND item_name=:i", {"r":r['region'], "i":r['item_name']})
                            old_q = cur.iloc[0]['qty'] if not cur.empty else 0
                            if cur.empty:
                                run_action("INSERT INTO local_inventory (region, item_name, qty, last_updated, updated_by) VALUES (:r, :i, :q, NOW(), :u)",
                                          {"r":r['region'], "i":r['item_name'], "q":old_q+r['qty'], "u":st.session_state.user_info['name']})
                            else:
                                run_action("UPDATE local_inventory SET qty=:q, last_updated=NOW(), updated_by=:u WHERE region=:r AND item_name=:i",
                                          {"q":old_q+r['qty'], "u":st.session_state.user_info['name'], "r":r['region'], "i":r['item_name']})
                            st.success("Issued!"); st.rerun()
                        else: st.error(msg)

    with t2:
        st.dataframe(get_inventory("NTCC"), use_container_width=True)
        with st.expander("🛠 Manual Adjust"):
            inv = get_inventory("NTCC")
            if not inv.empty:
                it = st.selectbox("Item", inv['name_en'].unique(), key="tk_it")
                row = inv[inv['name_en']==it].iloc[0]
                chg = st.number_input("Change (+/-)", value=0, step=1)
                if st.button("Update Stock"):
                    res, msg = update_central_stock(it, "NTCC", chg, st.session_state.user_info['name'], "Manual Adjust", row['unit'])
                    if res: st.success("Updated"); st.rerun()
                    else: st.error(msg)

    with t3:
        st.dataframe(get_inventory("SNC"), use_container_width=True)
        with st.expander("🛠 Transfer to NTCC"):
            inv = get_inventory("SNC")
            if not inv.empty:
                it = st.selectbox("Item", inv['name_en'].unique(), key="tr_it")
                row = inv[inv['name_en']==it].iloc[0]
                q = st.number_input("Qty to Transfer", 1, 10000)
                if st.button("Transfer"):
                    if transfer_stock(it, q, st.session_state.user_info['name'], row['unit']):
                        st.success("Transferred"); st.rerun()
                    else: st.error("Error")

def supervisor_view():
    user = st.session_state.user_info
    st.markdown(f"## 👷 {txt['supervisor_role']}")
    t1, t2 = st.tabs(["Request Items", "My Inventory"])
    
    with t1:
        reg = st.selectbox("Area", AREAS, index=AREAS.index(user['region']) if user['region'] in AREAS else 0)
        inv = get_inventory("NTCC")
        if not inv.empty:
            it = st.selectbox("Item", inv['name_en'].unique())
            row = inv[inv['name_en']==it].iloc[0]
            q = st.number_input("Quantity", 1, 1000)
            if st.button("Submit Request", use_container_width=True):
                run_action("INSERT INTO requests (supervisor_name, region, item_name, category, qty, unit, status, request_date) VALUES (:s, :r, :i, :c, :q, :u, 'Pending', NOW())",
                          {"s":user['name'], "r":reg, "i":it, "c":row['category'], "q":q, "u":row['unit']})
                st.success("Sent!"); st.rerun()

    with t2:
        st.info("Update Local Stock")
        inv = get_inventory("NTCC")
        it = st.selectbox("Item", inv['name_en'].unique(), key="up_it")
        cur = run_query("SELECT qty FROM local_inventory WHERE region=:r AND item_name=:i", {"r":user['region'], "i":it})
        cur_q = cur.iloc[0]['qty'] if not cur.empty else 0
        
        c1, c2 = st.columns([1, 2])
        c1.metric("Current", cur_q)
        new_q = c2.number_input("New Count", 0, 10000, cur_q)
        
        if st.button("Update Count", use_container_width=True):
            if cur.empty:
                run_action("INSERT INTO local_inventory (region, item_name, qty, last_updated, updated_by) VALUES (:r, :i, :q, NOW(), :u)",
                          {"r":user['region'], "i":it, "q":new_q, "u":user['name']})
            else:
                run_action("UPDATE local_inventory SET qty=:q, last_updated=NOW(), updated_by=:u WHERE region=:r AND item_name=:i",
                          {"r":user['region'], "i":it, "q":new_q, "u":user['name']})
            st.success("Updated!"); st.rerun()
            
        st.markdown("### History")
        hist = run_query("SELECT region, item_name, qty, last_updated FROM local_inventory WHERE updated_by=:u ORDER BY last_updated DESC", {"u":user['name']})
        st.dataframe(hist, use_container_width=True)

# --- 8. التشغيل ---
if st.session_state.logged_in:
    show_main_app()
else:
    show_login()
