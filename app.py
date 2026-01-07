import streamlit as st
import pandas as pd
from datetime import datetime
from sqlalchemy import text
import time

# --- 1. إعداد الصفحة ---
st.set_page_config(page_title="WMS Pro", layout="wide", initial_sidebar_state="expanded")

# --- 2. ستايل التصميم الحديث (CSS Magic) ---
# هذا الجزء هو المسؤول عن تحويل شكل التطبيق ليشبه React
st.markdown("""
    <style>
    /* استيراد خطوط جوجل */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');

    /* خلفية التطبيق كاملة - تدرج لوني */
    .stApp {
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        font-family: 'Inter', sans-serif;
    }

    /* تحسين شكل القوائم الجانبية */
    section[data-testid="stSidebar"] {
        background-color: #ffffff;
        box-shadow: 2px 0 5px rgba(0,0,0,0.05);
    }

    /* تحسين شكل البطاقات والحاويات */
    div[data-testid="stVerticalBlock"] > div {
        background-color: transparent;
    }

    /* تنسيق خاص لبطاقة تسجيل الدخول */
    .login-container {
        background-color: white;
        padding: 2rem;
        border-radius: 15px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        text-align: center;
    }

    /* تحسين شكل الأزرار - تدرج لوني */
    .stButton button {
        background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%);
        color: white;
        border: none;
        padding: 0.6rem 1.2rem;
        border-radius: 8px;
        font-weight: 600;
        transition: all 0.3s ease;
        width: 100%;
    }
    .stButton button:hover {
        opacity: 0.9;
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(79, 70, 229, 0.4);
    }

    /* تحسين حقول الإدخال */
    .stTextInput input, .stSelectbox div[data-baseweb="select"] {
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        padding: 0.5rem;
    }
    .stTextInput input:focus {
        border-color: #4f46e5;
        box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
    }

    /* إخفاء القائمة العلوية الافتراضية */
    header {visibility: hidden;}
    
    /* تنسيق التبويبات */
    .stTabs [data-baseweb="tab-list"] {
        gap: 10px;
        background-color: transparent;
    }
    .stTabs [data-baseweb="tab"] {
        background-color: white;
        border-radius: 8px 8px 0 0;
        box-shadow: 0 -2px 5px rgba(0,0,0,0.02);
        padding-right: 20px;
        padding-left: 20px;
    }
    .stTabs [aria-selected="true"] {
        background-color: #ffffff;
        border-bottom: 2px solid #4f46e5;
        color: #4f46e5;
    }

    /* تذييل الصفحة */
    .copyright-footer {
        position: fixed; left: 20px; bottom: 20px;
        background-color: rgba(255, 255, 255, 0.8);
        padding: 8px 15px; border-radius: 20px; font-size: 12px;
        color: #666; pointer-events: none; 
        backdrop-filter: blur(5px);
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    </style>
    <div class="copyright-footer">Designed for Excellence © WMS Pro</div>
""", unsafe_allow_html=True)

# --- 3. إدارة الجلسة (مستقرة) ---
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
    "app_title": "WMS Pro", # اختصرنا الاسم ليكون عصرياً
    "login_page": "Sign In", "register_page": "Create Account", # غيرنا الأسماء لتكون مودرن
    "username": "Username", "password": "Password",
    "fullname": "Full Name", "region": "Region",
    "login_btn": "Sign In", "register_btn": "Register Now", "logout": "Sign Out",
    "manager_role": "Manager Dashboard", "supervisor_role": "Supervisor Portal", "storekeeper_role": "Store Keeper Panel",
    "create_item_title": "Add Inventory", "create_btn": "Add Item",
    "ext_tab": "External Operations", "project_loans": "Project Loans",
    "cww_supply": "Central Supply (CWW)", "exec_trans": "Execute",
    "refresh_data": "Refresh", "notes": "Notes",
    "save_mod": "Save Changes", "insufficient_stock_sk": "❌ Error: Insufficient Stock!",
    "error_login": "Incorrect credentials", "success_reg": "Account created! Please login.",
    "local_inv": "My Inventory", "req_form": "New Request", 
    "select_item": "Select Item", "qty_req": "Quantity", "send_req": "Submit Request",
    "approved_reqs": "Pending Issue", "issue": "Confirm Issue",
    "transfer_btn": "Transfer", "edit_profile": "Profile Settings", 
    "new_name": "Full Name", "new_pass": "New Password", "save_changes": "Update Profile",
    "update_btn": "Save"
}

# --- 5. الاتصال والقاعدة ---
try:
    conn = st.connection("supabase", type="sql")
except:
    st.error("⚠️ Database Connection Error. Please check secrets.")
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

# --- 6. المنطق ---
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

# --- دوال المساعد (Helpers) ---
def get_inventory(location):
    return run_query("SELECT * FROM inventory WHERE location = :loc ORDER BY name_en", params={"loc": location})

def update_central_stock(item_name, location, change, user, action_desc, unit):
    df = run_query("SELECT qty FROM inventory WHERE name_en = :name AND location = :loc", params={"name": item_name, "loc": location})
    if df.empty: return False, "Not found"
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

# --- 7. الواجهات (بتصميم البطاقات العصري) ---

def show_login():
    # تصميم عصري لصفحة الدخول: توسيط وبطاقة بيضاء
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        st.markdown("<br><br>", unsafe_allow_html=True)
        # حاوية البطاقة
        with st.container():
            st.markdown(f"""
            <div class="login-container">
                <div style="font-size: 50px; margin-bottom: 10px;">🏭</div>
                <h1 style="color: #1f2937; margin-bottom: 0;">{txt['app_title']}</h1>
                <p style="color: #6b7280; margin-bottom: 20px;">Unified Warehouse Management</p>
            </div>
            """, unsafe_allow_html=True)
            
            t1, t2 = st.tabs([txt['login_page'], txt['register_page']])
            
            with t1:
                with st.form("login_form"):
                    st.markdown("### Welcome Back")
                    u = st.text_input(txt['username'], placeholder="Enter username")
                    p = st.text_input(txt['password'], type="password", placeholder="Enter password")
                    st.markdown("<br>", unsafe_allow_html=True)
                    if st.form_submit_button(txt['login_btn'], use_container_width=True):
                        user_data = login_user(u.strip(), p.strip())
                        if user_data:
                            st.session_state.logged_in = True
                            st.session_state.user_info = user_data
                            st.rerun()
                        else:
                            st.error(txt['error_login'])

            with t2:
                with st.form("register_form"):
                    st.markdown("### New Account")
                    nu = st.text_input(txt['username'], placeholder="Choose username")
                    np = st.text_input(txt['password'], type='password', placeholder="Choose password")
                    nn = st.text_input(txt['fullname'], placeholder="Your full name")
                    nr = st.selectbox(txt['region'], AREAS)
                    st.markdown("<br>", unsafe_allow_html=True)
                    if st.form_submit_button(txt['register_btn'], use_container_width=True):
                        if register_user(nu.strip(), np.strip(), nn, nr):
                            st.success(txt['success_reg'])
                        else:
                            st.error("Username taken")

def show_main_app():
    info = st.session_state.user_info
    
    # Sidebar بتصميم أنظف
    with st.sidebar:
        st.markdown(f"""
        <div style="text-align: center; padding: 10px; background: #f3f4f6; border-radius: 10px; margin-bottom: 20px;">
            <div style="font-size: 40px;">👤</div>
            <h3 style="margin: 5px 0; color: #111827;">{info['name']}</h3>
            <span style="background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 12px; font-size: 12px;">{info['role']}</span>
            <p style="color: #6b7280; font-size: 12px; margin-top: 5px;">📍 {info['region']}</p>
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

        st.markdown("---")
        if st.button(txt['logout'], use_container_width=True):
            st.session_state.logged_in = False; st.session_state.user_info = {}; st.rerun()

    # توجيه حسب الدور
    if info['role'] == 'manager': manager_view()
    elif info['role'] == 'storekeeper': storekeeper_view()
    else: supervisor_view()

# --- تفاصيل الواجهات (نفس المنطق، شكل أفضل) ---

def manager_view():
    st.markdown(f"## 🚀 {txt['manager_role']}")
    tab1, tab2, tab3, tab4, tab5 = st.tabs(["📦 Stock", "🔄 External", "⏳ Requests", "📊 Reports", "📜 Logs"])
    
    with tab1:
        with st.expander("✨ Add New Inventory Item", expanded=False):
            c1, c2, c3, c4 = st.columns(4)
            n = c1.text_input("Name")
            c = c2.selectbox("Cat", CATS_EN)
            l = c3.selectbox("Loc", LOCATIONS)
            q = c4.number_input("Qty", 0, 10000)
            u = st.selectbox("Unit", ["Piece", "Carton", "Set"])
            if st.button(txt['create_btn'], use_container_width=True):
                if n: 
                    # Insert Logic simplified
                    if run_query("SELECT id FROM inventory WHERE name_en=:n AND location=:l", {"n":n, "l":l}).empty:
                        run_action("INSERT INTO inventory (name_en, category, unit, location, qty, status) VALUES (:n, :c, :u, :l, :q, 'Available')",
                                  {"n":n, "c":c, "u":u, "l":l, "q":q})
                        st.success("Added!"); st.rerun()
                    else: st.error("Exists!")
        
        st.markdown("<br>", unsafe_allow_html=True)
        c1, c2 = st.columns(2)
        with c1:
            st.info("🏢 Internal (NTCC)")
            st.dataframe(get_inventory("NTCC"), use_container_width=True, height=300)
        with c2:
            st.success("🏭 External (SNC)")
            st.dataframe(get_inventory("SNC"), use_container_width=True, height=300)

    with tab2: # External Logic
        c1, c2 = st.columns(2)
        with c1:
            st.subheader(txt['project_loans'])
            with st.container(border=True):
                wh = st.selectbox("From", LOCATIONS, key="l_wh")
                proj = st.selectbox("To Project", EXTERNAL_PROJECTS)
                inv = get_inventory(wh)
                if not inv.empty:
                    it = st.selectbox("Item", inv['name_en'].unique(), key="l_it")
                    row = inv[inv['name_en']==it].iloc[0]
                    st.caption(f"Stock: {row['qty']} {row['unit']}")
                    op = st.radio("Type", ["Lend", "Borrow"], horizontal=True)
                    amt = st.number_input("Qty", 1, 10000, key="l_q")
                    if st.button("Execute", use_container_width=True, key="btn_l"):
                        change = -amt if op=="Lend" else amt
                        desc = f"Loan {op} {proj}"
                        res, msg = update_central_stock(it, wh, change, st.session_state.user_info['name'], desc, row['unit'])
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
                        if res: st.success("Received"); st.rerun()
                        else: st.error(msg)

    with tab3: # Requests
        reqs = run_query("SELECT * FROM requests WHERE status='Pending' ORDER BY request_date DESC")
        if reqs.empty: st.markdown("✅ *All caught up! No pending requests.*")
        else:
            for _, r in reqs.iterrows():
                with st.container(border=True):
                    c1, c2 = st.columns([2, 1])
                    with c1:
                        st.markdown(f"**{r['item_name']}**")
                        st.caption(f"Req: {r['qty']} {r['unit']} • By: {r['supervisor_name']} • Area: {r['region']}")
                        stock = run_query("SELECT qty FROM inventory WHERE name_en=:n AND location='NTCC'", {"n":r['item_name']})
                        st.markdown(f"Available: `{stock.iloc[0]['qty'] if not stock.empty else 0}`")
                    with c2:
                        new_q = st.number_input("Approved Qty", 1, 10000, int(r['qty']), key=f"q_{r['req_id']}")
                        note = st.text_input("Note", key=f"n_{r['req_id']}")
                        col_a, col_b = st.columns(2)
                        if col_a.button("✅", key=f"ok_{r['req_id']}"):
                             run_action("UPDATE requests SET status='Approved', qty=:q, notes=:n WHERE req_id=:id", {"q":new_q, "n":note, "id":r['req_id']})
                             st.rerun()
                        if col_b.button("❌", key=f"no_{r['req_id']}"):
                             run_action("UPDATE requests SET status='Rejected', notes=:n WHERE req_id=:id", {"n":note, "id":r['req_id']})
                             st.rerun()

    with tab4: # Reports
        area = st.selectbox("Filter Area", AREAS)
        df = run_query("SELECT item_name, qty, last_updated, updated_by FROM local_inventory WHERE region=:r", {"r":area})
        st.dataframe(df, use_container_width=True)

    with tab5: # Logs
        st.dataframe(run_query("SELECT * FROM stock_logs ORDER BY log_date DESC LIMIT 50"), use_container_width=True)

def storekeeper_view():
    st.markdown(f"## 📦 {txt['storekeeper_role']}")
    t1, t2, t3 = st.tabs(["Tasks", "NTCC Stock", "SNC Stock"])
    
    with t1:
        reqs = run_query("SELECT * FROM requests WHERE status='Approved'")
        if reqs.empty: st.info("No approved requests to issue.")
        else:
            for _, r in reqs.iterrows():
                with st.container(border=True):
                    st.markdown(f"#### {r['item_name']}")
                    st.caption(f"Qty: {r['qty']} {r['unit']} • To: {r['region']}")
                    if r['notes']: st.warning(f"Note: {r['notes']}")
                    
                    if st.button("📦 Issue Items", key=f"iss_{r['req_id']}", use_container_width=True):
                         res, msg = update_central_stock(r['item_name'], "NTCC", -r['qty'], st.session_state.user_info['name'], f"Issued {r['region']}", r['unit'])
                         if res:
                             run_action("UPDATE requests SET status='Issued' WHERE req_id=:id", {"id":r['req_id']})
                             # Update local inventory automagically
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
    with t3:
        st.dataframe(get_inventory("SNC"), use_container_width=True)

def supervisor_view():
    user = st.session_state.user_info
    st.markdown(f"## 👷 {txt['supervisor_role']}")
    t1, t2 = st.tabs(["New Request", "My Inventory"])
    
    with t1:
        # Request Form styled
        c1, c2 = st.columns(2)
        with c1:
            # Allow selecting region
            my_reg = st.selectbox("Area", AREAS, index=AREAS.index(user['region']) if user['region'] in AREAS else 0)
        
        inv = get_inventory("NTCC")
        if not inv.empty:
            item = st.selectbox("Item needed", inv['name_en'].unique())
            row = inv[inv['name_en']==item].iloc[0]
            qty = st.number_input("Quantity needed", 1, 1000)
            st.caption(f"Unit: {row['unit']}")
            
            if st.button("Submit Request", use_container_width=True):
                run_action("INSERT INTO requests (supervisor_name, region, item_name, category, qty, unit, status, request_date) VALUES (:s, :r, :i, :c, :q, :u, 'Pending', NOW())",
                          {"s":user['name'], "r":my_reg, "i":item, "c":row['category'], "q":qty, "u":row['unit']})
                st.success("Request Sent!"); st.rerun()
    
    with t2:
        st.info("Update your local stock counts here.")
        inv = get_inventory("NTCC")
        item_up = st.selectbox("Update Item Count", inv['name_en'].unique())
        
        # Get current count
        cur = run_query("SELECT qty FROM local_inventory WHERE region=:r AND item_name=:i", {"r":user['region'], "i":item_up})
        curr_q = cur.iloc[0]['qty'] if not cur.empty else 0
        
        col_a, col_b = st.columns([1, 2])
        col_a.metric("Current", curr_q)
        new_val = col_b.number_input("New Actual Count", 0, 10000, curr_q)
        
        if st.button("Update Count", use_container_width=True):
            if cur.empty:
                run_action("INSERT INTO local_inventory (region, item_name, qty, last_updated, updated_by) VALUES (:r, :i, :q, NOW(), :u)",
                          {"r":user['region'], "i":item_up, "q":new_val, "u":user['name']})
            else:
                run_action("UPDATE local_inventory SET qty=:q, last_updated=NOW(), updated_by=:u WHERE region=:r AND item_name=:i",
                          {"r":user['region'], "i":item_up, "q":new_val, "u":user['name']})
            st.success("Updated!"); st.rerun()

        st.divider()
        st.markdown("### 📋 My Counts History")
        my_data = run_query("SELECT region, item_name, qty, last_updated FROM local_inventory WHERE updated_by=:u ORDER BY last_updated DESC", {"u":user['name']})
        if not my_data.empty:
            tabs = st.tabs(list(my_data['region'].unique()))
            for i, r in enumerate(my_data['region'].unique()):
                with tabs[i]:
                    st.dataframe(my_data[my_data['region']==r], use_container_width=True)

# --- 8. التشغيل ---
if st.session_state.logged_in:
    show_main_app()
else:
    show_login()
