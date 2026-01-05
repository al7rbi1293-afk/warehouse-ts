import streamlit as st
import pandas as pd
from datetime import datetime
import io
import uuid
import time
import gspread
from oauth2client.service_account import ServiceAccountCredentials

# --- إعدادات الصفحة (تم إرجاع القائمة الجانبية للظهور) ---
st.set_page_config(page_title="WMS Pro", layout="wide", initial_sidebar_state="expanded")

# --- القوائم والبيانات الثابتة ---
CATS_EN = ["Electrical", "Chemical", "Hand Tools", "Consumables", "Safety", "Others"]
CATS_AR = ["كهربائية", "كيميائية", "أدوات يدوية", "مستهلكات", "سلامة", "أخرى"]
LOCATIONS = ["NTCC", "SNC"]
AREAS = [
    "Ground floor", "1st floor", 
    "2nd floor O.R", "2nd floor ICU 28", "2nd floor RT and Waiting area", "2nd floor ICU 29",
    "Ward 30", "Ward 31", "Ward 40", "Ward 41", "Ward 50", "Ward 51",
    "Service area", "OPD", "E.R", "x-rays", "neurodiagnostic"
]

# --- الترجمة ---
T = {
    "ar": {
        "app_title": "نظام المستودعات الموحد",
        "login_page": "دخول", "register_page": "تسجيل",
        "username": "المستخدم", "password": "كلمة المرور",
        "fullname": "الاسم", "region": "المنطقة الرئيسية",
        "login_btn": "دخول", "register_btn": "تسجيل جديد", "logout": "خروج",
        "manager_role": "الإدارة", "supervisor_role": "مشرف", "storekeeper_role": "أمين مستودع",
        "name_ar": "اسم عربي", "name_en": "اسم انجليزي", "category": "تصنيف",
        "qty": "الكمية", "cats": CATS_AR, "location": "الموقع",
        "requests_log": "سجل", "inventory": "المخزون",
        "local_inv": "جردي", "local_inv_mgr": "تقارير الفروع",
        "req_form": "طلب مواد", "select_item": "اختر المادة",
        "current_local": "لديك:", "update_local": "تحديث",
        "qty_req": "مطلوب", "qty_local": "فعلي",
        "send_req": "إرسال", "update_btn": "حفظ",
        "download_excel": "Excel", "no_items": "لا يوجد مواد متاحة",
        "pending_reqs": "⏳ طلبات المشرفين", "approved_reqs": "📦 للصرف (مشرفين)",
        "approve": "قبول ✅", "reject": "رفض ❌", "issue": "صرف 📦",
        "status": "الحالة", "reason": "السبب",
        "pending": "انتظار", "approved": "معتمد", 
        "rejected": "مرفوض", "issued": "مصروف",
        "err_qty": "رصيد غير كاف!",
        "success_update": "تم التحديث",
        "success_req": "تم الإرسال",
        "success_issue": "تم الصرف",
        "filter_region": "منطقة",
        "issue_qty_input": "مصروف",
        "manage_stock": "📦 مراقبة وجرد المستودعات المركزية",
        "select_action": "إجراء",
        "add_stock": "إضافة (+)", "reduce_stock": "سحب (-)",
        "amount": "عدد",
        "current_stock_display": "رصيد:", "new_stock_display": "جديد:",
        "execute_update": "تحديث",
        "error_login": "خطأ بيانات", "success_reg": "تم التسجيل",
        "stock_take_central": "📝 جرد مركزي",
        "sk_request": "📥 طلب خاص (أمين المستودع)",
        "source_wh": "اختر المستودع",
        "ntcc_label": "داخلي (NTCC)", "snc_label": "خارجي (SNC)",
        "logs": "سجل الحركات",
        "modify_stock": "تعديل / جرد",
        "stock_monitor": "مراقبة المخزون",
        "copyright": "جميع الحقوق محفوظة © لمساعد مدير مشروع الأعصاب عبدالعزيز الحازمي. يمنع النشر أو الاستغلال بدون إذن.",
        "select_area": "📍 القسم / المنطقة المستهدفة",
        "area_label": "القسم",
        "unit": "الوحدة", "piece": "حبة", "carton": "كرتون",
        "edit_profile": "تعديل بياناتي", "new_name": "الاسم الجديد", "new_pass": "كلمة المرور الجديدة", "save_changes": "حفظ التغييرات", "profile_updated": "تم تحديث البيانات بنجاح، الرجاء تسجيل الدخول مجدداً"
    },
    "en": {
        "app_title": "Unified WMS System",
        "login_page": "Login", "register_page": "Register",
        "username": "Username", "password": "Password",
        "fullname": "Name", "region": "Main Region",
        "login_btn": "Login", "register_btn": "Sign Up", "logout": "Logout",
        "manager_role": "Manager", "supervisor_role": "Supervisor", "storekeeper_role": "Store Keeper",
        "name_ar": "Name (Ar)", "name_en": "Name (En)", "category": "Category",
        "qty": "Qty", "cats": CATS_EN, "location": "Location",
        "requests_log": "Log", "inventory": "Inventory",
        "local_inv": "My Stock", "local_inv_mgr": "Branch Reports",
        "req_form": "Request", "select_item": "Select Item",
        "current_local": "You have:", "update_local": "Update",
        "qty_req": "Request Qty", "qty_local": "Actual Qty",
        "send_req": "Send", "update_btn": "Save",
        "download_excel": "Excel", "no_items": "No items available",
        "pending_reqs": "⏳ Supervisor Requests", "approved_reqs": "📦 To Issue",
        "approve": "Approve ✅", "reject": "Reject ❌", "issue": "Issue 📦",
        "status": "Status", "reason": "Reason",
        "pending": "Pending", "approved": "Approved", 
        "rejected": "Rejected", "issued": "Issued",
        "err_qty": "Low Stock!",
        "success_update": "Updated",
        "success_req": "Sent",
        "success_issue": "Issued",
        "filter_region": "Region",
        "issue_qty_input": "Issued Qty",
        "manage_stock": "📦 Central Stock Monitor & Count",
        "select_action": "Action",
        "add_stock": "Add (+)", "reduce_stock": "Remove (-)",
        "amount": "Amount",
        "current_stock_display": "Current:", "new_stock_display": "New:",
        "execute_update": "Update",
        "error_login": "Invalid", "success_reg": "Registered",
        "stock_take_central": "📝 Central Stock Take",
        "sk_request": "📥 Store Keeper Request",
        "source_wh": "Select Warehouse",
        "ntcc_label": "Internal (NTCC)", "snc_label": "External (SNC)",
        "logs": "Activity Logs",
        "modify_stock": "Modify / Stock Take",
        "stock_monitor": "Stock Monitor",
        "copyright": "All rights reserved © to Assistant Project Manager of Nerves Project, Abdulaziz Alhazmi. Unauthorized use prohibited.",
        "select_area": "📍 Target Area / Section",
        "area_label": "Area",
        "unit": "Unit", "piece": "Piece", "carton": "Carton",
        "edit_profile": "Edit Profile", "new_name": "New Name", "new_pass": "New Password", "save_changes": "Save Changes", "profile_updated": "Profile updated, please login again"
    }
}

lang_choice = st.sidebar.selectbox("Language / اللغة", ["العربية", "English"])
lang = "ar" if lang_choice == "العربية" else "en"
txt = T[lang]
NAME_COL = 'name_ar' if lang == 'ar' else 'name_en'

# --- CSS ذكي (إخفاء للمستخدمين / إظهار لـ abdulaziz) ---
# سيتم تطبيق هذا CSS لاحقاً بعد تسجيل الدخول والتحقق من الاسم
BASE_CSS = f"""
    <style>
    .stMarkdown, .stTextInput, .stNumberInput, .stSelectbox, .stDataFrame, .stRadio {{ 
        direction: {'rtl' if lang == 'ar' else 'ltr'}; 
        text-align: {'right' if lang == 'ar' else 'left'}; 
    }}
    [data-testid="stSidebarUserContent"] {{ 
        direction: {'rtl' if lang == 'ar' else 'ltr'}; 
        text-align: {'right' if lang == 'ar' else 'left'}; 
    }}
    .stButton button {{ width: 100%; }}
    .copyright-footer {{
        position: fixed; left: 10px; bottom: 5px;
        background-color: rgba(255, 255, 255, 0.9);
        padding: 5px 10px; border-radius: 5px; font-size: 10px;
        color: #333; z-index: 99999; pointer-events: none; border: 1px solid #ddd;
    }}
    @media (prefers-color-scheme: dark) {{
        .copyright-footer {{ background-color: rgba(14, 17, 23, 0.9); color: #fafafa; border: 1px solid #444; }}
    }}
    </style>
    <div class="copyright-footer">{txt['copyright']}</div>
"""
st.markdown(BASE_CSS, unsafe_allow_html=True)

# --- الاتصال بـ Google Sheets ---
@st.cache_resource
def get_connection():
    try:
        scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
        creds_dict = dict(st.secrets["gcp_service_account"])
        creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
        client = gspread.authorize(creds)
        sheet = client.open("WMS_Database")
        return sheet
    except: return None

def load_data(worksheet_name):
    try:
        sh = get_connection()
        ws = sh.worksheet(worksheet_name)
        data = ws.get_all_records()
        return pd.DataFrame(data)
    except: return pd.DataFrame()

def save_row(worksheet_name, row_data_list):
    sh = get_connection()
    ws = sh.worksheet(worksheet_name)
    ws.append_row(row_data_list)

def update_data(worksheet_name, df):
    sh = get_connection()
    ws = sh.worksheet(worksheet_name)
    ws.clear()
    ws.update([df.columns.values.tolist()] + df.values.tolist())

# --- دالة تحديث بيانات المستخدم (الاسم/الرمز) ---
def update_user_profile_in_db(username, new_name, new_pass):
    try:
        sh = get_connection()
        ws = sh.worksheet('users')
        data = ws.get_all_records()
        df = pd.DataFrame(data)
        
        # البحث عن صف المستخدم
        # ملاحظة: username هو العمود الأول في جوجل شيت (رقم 1)
        # password (2), name (3)
        cell = ws.find(str(username))
        
        if cell:
            # تحديث كلمة المرور (العمود 2)
            ws.update_cell(cell.row, 2, str(new_pass))
            # تحديث الاسم (العمود 3)
            ws.update_cell(cell.row, 3, new_name)
            return True
        return False
    except Exception as e:
        print(e)
        return False

def update_central_inventory_with_log(item_en, location, change_qty, user, action_desc, unit_type="Piece"):
    try:
        sh = get_connection()
        ws_inv = sh.worksheet('inventory')
        ws_log = sh.worksheet('stock_logs')
        inv_data = ws_inv.get_all_records()
        df_inv = pd.DataFrame(inv_data)
        mask = (df_inv['name_en'] == item_en) & (df_inv['location'] == location)
        if mask.any():
            idx = df_inv.index[mask][0]
            current_qty = int(df_inv.at[idx, 'qty'])
            new_qty = max(0, current_qty + change_qty)
            ws_inv.update_cell(idx + 2, 4, new_qty) 
            log_desc = f"{action_desc} ({unit_type})"
            log_entry = [datetime.now().strftime("%Y-%m-%d %H:%M"), user, log_desc, item_en, location, change_qty, new_qty]
            ws_log.append_row(log_entry)
            return True
        else: return False
    except: return False

def update_local_inventory_record(region, item_en, item_ar, new_qty):
    try:
        sh = get_connection()
        ws = sh.worksheet('local_inventory')
        data = ws.get_all_records()
        df = pd.DataFrame(data)
        if not df.empty:
            mask = (df['region'] == region) & (df['item_en'] == item_en)
        else: mask = pd.Series([False])
        if mask.any():
            row_idx = df.index[mask][0]
            ws.update_cell(row_idx + 2, 4, int(new_qty))
            ws.update_cell(row_idx + 2, 5, datetime.now().strftime("%Y-%m-%d %H:%M"))
        else:
            ws.append_row([region, item_en, item_ar, int(new_qty), datetime.now().strftime("%Y-%m-%d %H:%M")])
        return True
    except: return False

# --- إدارة الجلسة ---
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.user_info = {}

# === تسجيل الدخول ===
if not st.session_state.logged_in:
    st.title(f"🔐 {txt['app_title']}")
    t1, t2 = st.tabs([txt['login_page'], txt['register_page']])
    with t1:
        with st.form("log"):
            u = st.text_input(txt['username']).strip()
            p = st.text_input(txt['password'], type="password").strip()
            if st.form_submit_button(txt['login_btn'], use_container_width=True):
                users = load_data('users')
                if not users.empty:
                    users['username'] = users['username'].astype(str)
                    users['password'] = users['password'].astype(str)
                    match = users[(users['username']==u) & (users['password']==p)]
                    if not match.empty:
                        st.session_state.logged_in = True
                        st.session_state.user_info = match.iloc[0].to_dict()
                        st.rerun()
                    else: st.error(txt['error_login'])
                else: st.error("DB Error")
    with t2:
        with st.form("reg"):
            nu = st.text_input(txt['username']).strip()
            np = st.text_input(txt['password'], type='password').strip()
            nn = st.text_input(txt['fullname'])
            nr = st.text_input(txt['region'])
            if st.form_submit_button(txt['register_btn'], use_container_width=True):
                users = load_data('users')
                exists = False
                if not users.empty:
                    if nu in users['username'].astype(str).values: exists = True
                if not exists and nu:
                    save_row('users', [nu, np, nn, 'supervisor', nr])
                    st.success(txt['success_reg'])
                else: st.error("Error")

# === النظام الرئيسي ===
else:
    info = st.session_state.user_info
    
    # --- منطق الإخفاء (الأمان) ---
    # إذا كان المستخدم هو "abdulaziz"، لن نخفي شيئاً.
    # إذا كان أي شخص آخر، نخفي الهيدر والقوائم.
    if str(info['username']).lower() == "abdulaziz":
        pass # لا تفعل شيئاً، اظهر كل شيء للمطور/المالك
    else:
        # إخفاء القوائم للآخرين
        HIDE_MENU_CSS = """
        <style>
        #MainMenu {visibility: hidden;}
        header {visibility: hidden;}
        [data-testid="stToolbar"] {visibility: hidden !important;}
        </style>
        """
        st.markdown(HIDE_MENU_CSS, unsafe_allow_html=True)

    # --- القائمة الجانبية (معلومات + تعديل) ---
    st.sidebar.markdown(f"### 👤 {info['name']}")
    st.sidebar.caption(f"📍 {info['region']} | 🔑 {info['role']}")
    
    # خيار تعديل البيانات في السلايدر
    with st.sidebar.expander(f"🛠 {txt['edit_profile']}"):
        new_name_input = st.text_input(txt['new_name'], value=info['name'])
        new_pass_input = st.text_input(txt['new_pass'], type="password", value=info['password'])
        
        if st.button(txt['save_changes'], use_container_width=True):
            if update_user_profile_in_db(info['username'], new_name_input, new_pass_input):
                st.success(txt['profile_updated'])
                time.sleep(2)
                st.session_state.logged_in = False # تسجيل خروج اجباري للتحديث
                st.rerun()
            else:
                st.error("Error Updating")

    if st.sidebar.button(txt['logout'], use_container_width=True):
        st.session_state.logged_in = False
        st.rerun()

    # ================= 1. واجهة المدير =================
    if info['role'] == 'manager':
        st.header(txt['manager_role'])
        inv = load_data('inventory')
        reqs = load_data('requests')
        logs = load_data('stock_logs')

        # --- قسم إدارة المخزون المركزي ---
        st.subheader(txt['manage_stock'])
        tab_view_ntcc, tab_view_snc = st.tabs([txt['ntcc_label'], txt['snc_label']])
        
        def render_stock_manager(warehouse_name):
            wh_data = inv[inv['location'] == warehouse_name] if 'location' in inv.columns else pd.DataFrame()
            if wh_data.empty:
                st.info(f"{txt['no_items']} - {warehouse_name}")
            else:
                base_cols = ['name_ar', 'name_en', 'qty', 'unit', 'category']
                display_cols = [c for c in base_cols if c in wh_data.columns]
                st.dataframe(wh_data[display_cols], use_container_width=True)
                
                with st.expander(f"🛠 {txt['modify_stock']} ({warehouse_name})"):
                    item_options = wh_data.apply(lambda x: x[NAME_COL], axis=1)
                    sel_item = st.selectbox(f"{txt['select_item']} ({warehouse_name}):", item_options, key=f"sel_{warehouse_name}")
                    current_row = wh_data[wh_data[NAME_COL] == sel_item].iloc[0]
                    st.write(f"{txt['current_stock_display']} **{current_row['qty']}**")
                    
                    st.write("---")
                    c_unit, c_act, c_amt = st.columns(3)
                    mgr_unit = c_unit.radio(txt['unit'], [txt['piece'], txt['carton']], key=f"u_{warehouse_name}")
                    action = c_act.radio(txt['select_action'], [txt['add_stock'], txt['reduce_stock']], key=f"act_{warehouse_name}")
                    amount = c_amt.number_input(txt['amount'], 1, 10000, 1, key=f"amt_{warehouse_name}")
                    
                    if st.button(txt['execute_update'], key=f"btn_{warehouse_name}", use_container_width=True):
                        change = amount if action == txt['add_stock'] else -amount
                        if update_central_inventory_with_log(current_row['name_en'], warehouse_name, change, info['name'], "Manager Update", mgr_unit):
                            st.success(txt['success_update'])
                            time.sleep(1)
                            st.rerun()

        with tab_view_ntcc: render_stock_manager("NTCC")
        with tab_view_snc: render_stock_manager("SNC")

        st.markdown("---")
        st.subheader(txt['pending_reqs'])
        pending_all = reqs[reqs['status'] == txt['pending']] if not reqs.empty else pd.DataFrame()
        if pending_all.empty:
            st.success("✅")
        else:
            regions = pending_all['region'].unique()
            for region in regions:
                with st.expander(f"📍 {region} ({len(pending_all[pending_all['region']==region])})", expanded=False):
                    region_reqs = pending_all[pending_all['region'] == region]
                    for index, row in region_reqs.iterrows():
                        with st.container(border=True):
                            disp_name = row['item_ar'] if lang == 'ar' else row['item_en']
                            st.markdown(f"**📦 {disp_name}**")
                            req_u = row['unit'] if 'unit' in row else '-'
                            st.caption(f"{txt['area_label']}: **{row['region']}** | {txt['qty']}: **{row['qty']} ({req_u})**")
                            st.caption(f"👤 {row['supervisor']}")
                            b1, b2 = st.columns(2)
                            if b1.button(txt['approve'], key=f"ap_{row['req_id']}", use_container_width=True):
                                reqs.loc[reqs['req_id'] == row['req_id'], 'status'] = txt['approved']
                                update_data('requests', reqs)
                                st.rerun()
                            if b2.button(txt['reject'], key=f"rj_{row['req_id']}", use_container_width=True):
                                reqs.loc[reqs['req_id'] == row['req_id'], 'status'] = txt['rejected']
                                update_data('requests', reqs)
                                st.rerun()
        st.markdown("---")
        with st.expander(f"📜 {txt['logs']}"):
            if not logs.empty: st.dataframe(logs, use_container_width=True)

    # ================= 2. واجهة أمين المستودع =================
    elif info['role'] == 'storekeeper':
        st.header(txt['storekeeper_role'])
        reqs = load_data('requests')
        inv = load_data('inventory')
        tab_issue, tab_req_sk, tab_stocktake = st.tabs([txt['approved_reqs'], txt['sk_request'], txt['stock_take_central']])
        
        with tab_issue:
            approved = reqs[reqs['status'] == txt['approved']] if not reqs.empty else pd.DataFrame()
            if approved.empty:
                st.info("✅")
            else:
                for index, row in approved.iterrows():
                    with st.container(border=True):
                        disp_name = row['item_ar'] if lang == 'ar' else row['item_en']
                        st.markdown(f"**📦 {disp_name}**")
                        req_u = row['unit'] if 'unit' in row else '-'
                        st.caption(f"📍 {row['region']} | {txt['qty_req']}: **{row['qty']} ({req_u})**")
                        st.caption(f"SOURCE: NTCC (Internal)")
                        issue_qty = st.number_input(txt['issue_qty_input'], 1, 9999, int(row['qty']), key=f"iq_{row['req_id']}")
                        if st.button(txt['issue'], key=f"btn_is_{row['req_id']}", use_container_width=True):
                            if update_central_inventory_with_log(row['item_en'], "NTCC", -issue_qty, info['name'], f"Issued to {row['region']}", req_u):
                                reqs.loc[reqs['req_id'] == row['req_id'], 'status'] = txt['issued']
                                reqs.loc[reqs['req_id'] == row['req_id'], 'qty'] = issue_qty
                                update_data('requests', reqs)
                                local_inv_df = load_data('local_inventory')
                                cur = 0
                                if not local_inv_df.empty:
                                    m = local_inv_df[(local_inv_df['region']==row['region']) & (local_inv_df['item_en']==row['item_en'])]
                                    if not m.empty: cur = int(m.iloc[0]['qty'])
                                update_local_inventory_record(row['region'], row['item_en'], row['item_ar'], cur + issue_qty)
                                st.success("OK")
                                time.sleep(1)
                                st.rerun()
                            else: st.error("Error")

        with tab_req_sk:
            wh_source = st.selectbox(txt['source_wh'], ["NTCC", "SNC"], key="sk_src_sel")
            wh_inv = inv[inv['location'] == wh_source] if 'location' in inv.columns else pd.DataFrame()
            if wh_inv.empty:
                st.warning(txt['no_items'])
            else:
                opts = wh_inv.apply(lambda x: x[NAME_COL], axis=1)
                sel_sk = st.selectbox(txt['select_item'], opts, key="sk_it_sel")
                
                c_u, c_q = st.columns(2)
                sk_unit = c_u.radio(txt['unit'], [txt['piece'], txt['carton']], key="sk_u_req", horizontal=True)
                qty_sk = c_q.number_input(txt['qty_req'], 1, 1000, 1, key="sk_q")
                
                if st.button(txt['send_req'], key="sk_snd", use_container_width=True):
                    item_data = wh_inv[wh_inv[NAME_COL] == sel_sk].iloc[0]
                    save_row('requests', [
                        str(uuid.uuid4()), info['name'], info['region'],
                        item_data['name_ar'], item_data['name_en'], item_data['category'],
                        qty_sk, datetime.now().strftime("%Y-%m-%d %H:%M"),
                        txt['pending'], f"Source: {wh_source}", sk_unit
                    ])
                    st.success("✅")

        with tab_stocktake:
            tgt_wh = st.radio(txt['source_wh'], ["SNC", "NTCC"], horizontal=True, key="sk_tk_wh")
            tgt_inv = inv[inv['location'] == tgt_wh] if 'location' in inv.columns else pd.DataFrame()
            if not tgt_inv.empty:
                tk_opts = tgt_inv.apply(lambda x: x[NAME_COL], axis=1)
                tk_item = st.selectbox(txt['select_item'], tk_opts, key="tk_it")
                tk_row = tgt_inv[tgt_inv[NAME_COL] == tk_item].iloc[0]
                st.info(f"{txt['current_stock_display']} {tk_row['qty']}")
                
                c_tk0, c_tk1, c_tk2 = st.columns(3)
                tk_unit = c_tk0.radio(txt['unit'], [txt['piece'], txt['carton']], key="tk_u")
                op_tk = c_tk1.radio(txt['select_action'], [txt['add_stock'], txt['reduce_stock']], key="tk_act")
                val_tk = c_tk2.number_input(txt['amount'], 1, 1000, 1)
                
                if st.button(txt['update_btn'], key="tk_save", use_container_width=True):
                    change = val_tk if op_tk == txt['add_stock'] else -val_tk
                    if update_central_inventory_with_log(tk_row['name_en'], tgt_wh, change, info['name'], "StoreKeeper Adjust", tk_unit):
                        st.success("OK")
                        time.sleep(1)
                        st.rerun()

    # ================= 3. واجهة المشرف (NTCC فقط) =================
    else:
        t_req, t_inv = st.tabs([txt['req_form'], txt['local_inv']])
        inv = load_data('inventory')
        local_inv = load_data('local_inventory')
        ntcc_items = inv[(inv['status'] == 'Available') & (inv['location'] == 'NTCC')] if 'location' in inv.columns else pd.DataFrame()
        
        with t_req:
            req_area = st.selectbox(txt['select_area'], AREAS, key="sup_req_area")
            
            if ntcc_items.empty:
                st.warning(txt['no_items'])
            else:
                with st.container(border=True):
                    opts = ntcc_items.apply(lambda x: x[NAME_COL], axis=1)
                    sel = st.selectbox(txt['select_item'], opts)
                    
                    c_u, c_q = st.columns(2)
                    req_unit = c_u.radio(txt['unit'], [txt['piece'], txt['carton']], horizontal=True)
                    qty = c_q.number_input(txt['qty_req'], 1, 1000, 1)
                    
                    if st.button(txt['send_req'], use_container_width=True):
                        item = ntcc_items[ntcc_items[NAME_COL] == sel].iloc[0]
                        save_row('requests', [
                            str(uuid.uuid4()), info['name'], req_area,
                            item['name_ar'], item['name_en'], item['category'],
                            qty, datetime.now().strftime("%Y-%m-%d %H:%M"),
                            txt['pending'], "", req_unit
                        ])
                        st.success("✅")
                        time.sleep(1)
                        st.rerun()
            st.markdown("---")
            reqs = load_data('requests')
            if not reqs.empty:
                my_reqs = reqs[reqs['supervisor'] == info['name']]
                disp_df = my_reqs[['item_ar' if lang=='ar' else 'item_en', 'qty', 'unit' if 'unit' in my_reqs.columns else 'status', 'status', 'region']]
                st.dataframe(disp_df, use_container_width=True)

        with t_inv:
            view_area = st.selectbox(txt['select_area'], AREAS, key="sup_view_area")
            if ntcc_items.empty:
                st.info(txt['no_items'])
            else:
                items_list = []
                for idx, row in ntcc_items.iterrows():
                    current_qty = 0
                    if not local_inv.empty:
                        match = local_inv[(local_inv['region'] == view_area) & (local_inv['item_en'] == row['name_en'])]
                        if not match.empty: current_qty = int(match.iloc[0]['qty'])
                    d_name = row['name_ar'] if lang == 'ar' else row['name_en']
                    items_list.append({"disp": d_name, "name_ar": row['name_ar'], "name_en": row['name_en'], "current_qty": current_qty})
                
                selected_item_inv = st.selectbox(txt['select_item'], [x['disp'] for x in items_list], key="sel_inv")
                selected_data = next((item for item in items_list if item["disp"] == selected_item_inv), None)
                if selected_data:
                    with st.container(border=True):
                        st.markdown(f"**{selected_data['disp']}**")
                        st.caption(f"{txt['current_local']} {selected_data['current_qty']} (في {view_area})")
                        new_val = st.number_input(txt['qty_local'], 0, 9999, selected_data['current_qty'])
                        if st.button(txt['update_btn'], use_container_width=True):
                            update_local_inventory_record(view_area, selected_data['name_en'], selected_data['name_ar'], new_val)
                            st.success("✅")
                            time.sleep(1)
                            st.rerun()
