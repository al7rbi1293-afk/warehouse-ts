
import streamlit as st
import pandas as pd
import time
from datetime import datetime
from modules.database import run_query, run_action, run_batch_action
from modules.config import AREAS, ATTENDANCE_STATUSES
from modules.utils import convert_df_to_excel

# ==========================================
# ============ MANAGER VIEW (MANPOWER) =====
# ==========================================
@st.fragment
def manager_view_manpower():
    st.header("👷‍♂️ Manpower Project Management")
    tab1, tab2, tab3, tab4 = st.tabs(["📊 Reports", "👥 Worker Database", "⏰ Duty Roster / Shifts", "📍 Supervisors"])

    with tab2: # Worker Database
        st.subheader("Manage Workers")
        
        # Search box for workers
        worker_search = st.text_input("🔍 بحث في العمال", placeholder="ابحث بالاسم أو رقم الموظف...")
        
        # Optimization: Cache worker list for 10 seconds to avoid reload flicker but keep fresh enough
        # Join with shifts to get simple name
        workers = run_query("""
            SELECT w.id, w.created_at, w.name, w.emp_id, w.role, w.region, w.status, w.shift_id, s.name as shift_name 
            FROM workers w 
            LEFT JOIN shifts s ON w.shift_id = s.id 
            ORDER BY w.id DESC
        """)
        
        # Filter by search term
        if worker_search and not workers.empty:
            workers = workers[
                workers['name'].str.contains(worker_search, case=False, na=False) | 
                workers['emp_id'].astype(str).str.contains(worker_search, case=False, na=False)
            ]
        
        if not workers.empty:
            excel_data = convert_df_to_excel(workers, "Workers")
            st.download_button("📥 Export Worker List", excel_data, "workers_list.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        
        # Add Worker
        with st.expander("➕ Add New Worker", expanded=True):
            @st.fragment
            def render_add_worker_form():
                with st.form("add_worker_form", clear_on_submit=True):
                    c1, c2, c3, c4, c5 = st.columns(5)
                    # Layout: Name | Emp ID | Role | Region | Shift
                    wn = c1.text_input("Worker Name")
                    we = c2.text_input("EMP ID (Numbers Only)")
                    wr = c3.text_input("Role/Position")
                    wreg = c4.selectbox("Region", AREAS)
                    
                    # Fetch Shifts (Cached: 10s to reflect updates)
                    shifts_ref = run_query("SELECT id, name FROM shifts")
                    shift_opts = {s['name']: s['id'] for i, s in shifts_ref.iterrows()} if not shifts_ref.empty else {}
                    wshift = c5.selectbox("Shift", list(shift_opts.keys()) if shift_opts else ["Default"])
                    
                    submitted = st.form_submit_button("Add Worker", use_container_width=True)
                    if submitted:
                        if wn and we:
                            if not we.isdigit():
                                st.error("EMP ID must be numbers only")
                            else:
                                sid = shift_opts.get(wshift, None)
                                run_action("INSERT INTO workers (name, emp_id, role, region, shift_id) VALUES (:n, :e, :r, :reg, :sid)", 
                                           {"n":wn, "e":we, "r":wr, "reg":wreg, "sid":sid})
                                st.toast("Worker Added Successfully!", icon="✅")
                                time.sleep(1) # varied delay for UX
                                st.rerun()
                        else: st.error("Name and EMP ID required")
            render_add_worker_form()
        
        
        # Bulk Add Workers
        with st.expander("⚡ Mass Add Workers (Excel Copy-Paste)"):
            st.info("Tip: You can copy rows from Excel and paste them here. Columns must match: Name, EMP ID, Role, Region, Shift.")
            
            # Prepare empty template
            # Re-use shifts_ref from above or fetch again
            shifts_ref = run_query("SELECT id, name FROM shifts")
            shift_opts = {s['name']: s['id'] for i, s in shifts_ref.iterrows()} if not shifts_ref.empty else {}
            shift_names = list(shift_opts.keys())
            
            template_data = pd.DataFrame(columns=["Name", "EMP ID", "Role", "Region", "Shift"])
            
            @st.fragment
            def render_bulk_worker_add(init_df, shift_options):
                edited_bulk = st.data_editor(
                    init_df,
                    num_rows="dynamic",
                    key="bulk_worker_editor",
                    column_config={
                        "Name": st.column_config.TextColumn(required=True),
                        "EMP ID": st.column_config.TextColumn(required=True, validate="^[0-9]+$"),
                        "Role": st.column_config.TextColumn(),
                        "Region": st.column_config.SelectboxColumn(options=AREAS, required=True),
                        "Shift": st.column_config.SelectboxColumn(options=shift_options)
                    },
                    hide_index=True, width="stretch"
                )
                
                if st.button("💾 Save All Workers", use_container_width=True):
                    if edited_bulk.empty:
                        st.warning("No data to save.")
                    else:
                        batch_cmds = []
                        valid = True
                        for i, row in edited_bulk.iterrows():
                            if not row['Name'] or not row['EMP ID']:
                                st.error(f"Row {i+1}: Name and EMP ID are required."); valid = False; break
                            
                            sid = shift_opts.get(row['Shift']) if row['Shift'] in shift_opts else None
                            batch_cmds.append((
                                "INSERT INTO workers (name, emp_id, role, region, shift_id) VALUES (:n, :e, :r, :reg, :sid)",
                                {"n": row['Name'], "e": row['EMP ID'], "r": row['Role'], "reg": row['Region'], "sid": sid}
                            ))
                        
                        if valid:
                            if run_batch_action(batch_cmds):
                                st.balloons(); st.success(f"Successfully added {len(batch_cmds)} workers!"); time.sleep(1); st.rerun()
            render_bulk_worker_add(template_data, shift_names)

        # Edit Workers
        if not workers.empty:
            # Prepare shifts mapping for edit
            shifts_lookup = shift_opts
            shift_names_list = list(shifts_lookup.keys())

            def render_worker_edit(w_df, s_lookup, s_names_list):
                edited_w = st.data_editor(
                    w_df,
                    key="worker_editor",
                    column_config={
                        "id": st.column_config.NumberColumn(disabled=True),
                        "created_at": st.column_config.DatetimeColumn(disabled=True),
                        "shift_id": None, # Hide ID
                        "shift_name": st.column_config.SelectboxColumn("Shift", options=s_names_list, required=True),
                        "emp_id": st.column_config.TextColumn("EMP ID", required=True),
                        "status": st.column_config.SelectboxColumn(options=["Active", "Inactive"], required=True),
                        "region": st.column_config.SelectboxColumn(options=AREAS, required=True)
                    },
                    hide_index=True, width="stretch"
                )
                if st.button("💾 Save Worker Changes"):
                    changes = 0
                    for index, row in edited_w.iterrows():
                        # Basic validation
                        eid = str(row['emp_id']) if row['emp_id'] else ""
                        if eid and not eid.isdigit():
                                st.error(f"Invalid EMP ID for {row['name']}: Numbers only."); continue
                        
                        # Resolve Shift ID
                        new_sid = s_lookup.get(row['shift_name'])
                        
                        run_action("UPDATE workers SET name=:n, emp_id=:e, role=:r, region=:reg, status=:s, shift_id=:sid WHERE id=:id",
                                   {"n":row['name'], "e":eid, "r":row['role'], "reg":row['region'], "s":row['status'], "sid":new_sid, "id":row['id']})
                        changes += 1
                    if changes > 0: st.success("Updated"); time.sleep(1); st.rerun()
            render_worker_edit(workers, shifts_lookup, shift_names_list)

    with tab3: # Shifts
        st.subheader("⏰ Shift Management (Duty Roster)")
        shifts = run_query("SELECT * FROM shifts ORDER BY id") # Real-time here as we might benefit from instant updates during editing
        
        with st.expander("➕ Add New Shift"):
            with st.form("add_shift_form", clear_on_submit=True):
                c1, c2, c3 = st.columns(3)
                sn = c1.text_input("Shift Name (e.g. Morning A)")
                ss = c2.time_input("Start Time")
                se = c3.time_input("End Time")
                if st.form_submit_button("Add Shift"):
                    if sn:
                        s_str = ss.strftime("%H:%M")
                        e_str = se.strftime("%H:%M")
                        run_action("INSERT INTO shifts (name, start_time, end_time) VALUES (:n, :s, :e)", {"n":sn, "s":s_str, "e":e_str})
                        st.success("Shift Added"); st.cache_data.clear(); st.rerun()

        if not shifts.empty:
            st.data_editor(shifts, key="shift_editor", disabled=["id"], hide_index=True, width="stretch")
            
    with tab4: # Supervisors
        st.subheader("📍 Supervisor Management")
        # Fetch all users who are not managers
        supervisors = run_query("SELECT username, name, region, role, shift_id FROM users WHERE role != 'manager' ORDER BY name")
        
        if supervisors.empty:
            st.info("No supervisors/staff found.")
        else:
            selected_sup_u = st.selectbox("Select Staff to Edit", supervisors['username'].tolist(), 
                                         format_func=lambda x: f"{x} - {supervisors[supervisors['username']==x].iloc[0]['name']} ({supervisors[supervisors['username']==x].iloc[0]['role']})")
            
            if selected_sup_u:
                current_row = supervisors[supervisors['username'] == selected_sup_u].iloc[0]
                
                with st.form("update_sup_form"):
                    col1, col2 = st.columns(2)
                    
                    # Region Editing
                    current_regions_str = current_row['region'] if current_row['region'] else ""
                    current_regions_list = current_regions_str.split(",") if current_regions_str else []
                    valid_defaults = [r for r in current_regions_list if r in AREAS]
                    new_regions = col1.multiselect(f"Assign Regions", AREAS, default=valid_defaults)
                    
                    # Role Editing
                    roles = ["supervisor", "storekeeper", "night_supervisor"]
                    cur_role = current_row['role']
                    new_role = col2.selectbox("Assign Role", roles, index=roles.index(cur_role) if cur_role in roles else 0)

                    # Shift Editing
                    shifts_ref = run_query("SELECT id, name FROM shifts")
                    s_opts = {s['name']: s['id'] for i, s in shifts_ref.iterrows()}
                    cur_s_id = current_row['shift_id']
                    cur_s_name = next((k for k, v in s_opts.items() if v == cur_s_id), None)
                    s_names = list(s_opts.keys())
                    idx = s_names.index(cur_s_name) if cur_s_name in s_names else 0
                    new_shift_name = st.selectbox("Assign Shift", s_names, index=idx if s_names else 0)

                    if st.form_submit_button("Update Profile", use_container_width=True):
                        new_reg_str = ",".join(new_regions)
                        new_sid = s_opts.get(new_shift_name)
                        if run_action("UPDATE users SET region=:r, shift_id=:sid, role=:role WHERE username=:u", 
                                  {"r": new_reg_str, "sid":new_sid, "role":new_role, "u": selected_sup_u}):
                            st.success(f"Updated {current_row['name']}"); st.cache_data.clear(); time.sleep(1); st.rerun()
            
            st.divider()
            st.dataframe(supervisors[['username', 'name', 'role', 'region']], width="stretch", hide_index=True)

    with tab1: # Reports
        st.subheader("📊 Daily Attendance Report")
        
        # Date Selection
        report_date = st.date_input("Select Date", datetime.now()).strftime("%Y-%m-%d")
        
        # Fetch Data
        df = run_query("""
            SELECT w.name, w.region, w.role, a.status, s.name as shift, a.notes 
            FROM attendance a 
            JOIN workers w ON a.worker_id = w.id 
            LEFT JOIN shifts s ON a.shift_id = s.id
            WHERE a.date = :d
        """, {"d": report_date})
        
        if df.empty:
            st.info(f"No attendance records for {report_date}.")
        else:
            # Summary Metrics
            c1, c2, c3 = st.columns(3)
            c1.metric("Present", len(df[df['status'] == 'Present']))
            c2.metric("Absent", len(df[df['status'] == 'Absent']))
            c3.metric("On Leave", len(df[df['status'] == 'Vacation']))
            
            st.divider()
            
            # Region Tabs
            regions = df['region'].unique()
            if len(regions) > 0:
                rtabs = st.tabs(list(regions))
                for i, region in enumerate(regions):
                    with rtabs[i]:
                        st.caption(f"Attendance for {region}")
                        reg_df = df[df['region'] == region]
                        st.dataframe(reg_df, width="stretch", hide_index=True)
                        
                        xl = convert_df_to_excel(reg_df, "Attendance")
                        st.download_button(f"📥 Export {region} Report", xl, f"attendance_{region}_{report_date}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", key=f"dl_{region}")
            else:
                 st.dataframe(df, width="stretch")
                 xl = convert_df_to_excel(df, "Attendance")
                 st.download_button("📥 Export Report", xl, f"attendance_{report_date}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

# ==========================================
# ============ SUPERVISOR VIEW (MANPOWER) ==
# ==========================================
@st.fragment
def supervisor_view_manpower():
    user = st.session_state.user_info
    my_regions = user['region'].split(",") if "," in user['region'] else [user['region']]
    st.header(f"👷‍♂️ Supervisor: {user['name']}")
    
    selected_region_mp = st.selectbox("📂 Select Region", my_regions, key="sup_mp_reg_sel")
    
    tab1, tab2 = st.tabs(["📝 Daily Attendance", "👥 My Workers"])
    
    with tab1:
        c_date, c_shift = st.columns([1, 2])
        selected_date = c_date.date_input("Select Date", datetime.now(), key="att_date_picker")
        date_str = selected_date.strftime('%Y-%m-%d')
        
        st.subheader(f"📅 Attendance for {date_str} - {selected_region_mp}")

        # AUTO-DETECT SHIFT from Supervisor Profile
        my_shift_id = user.get('shift_id')
        my_shift_name = user.get('shift_name', 'Unknown')
        
        if not my_shift_id:
            st.error("You are not assigned to a Shift. Please contact Manager.")
            return

        # --- SHIFT MAPPING LOGIC ---
        # A or A2 Supervisors -> Attend A1 Workers
        # B or B2 Supervisors -> Attend B1 Workers
        # Default: Attend own shift (e.g. A1 calls A1, B1 calls B1)
        
        target_shift_name = my_shift_name
        
        # We need ALL shifts to resolve names to IDs
        all_shifts = run_query("SELECT id, name FROM shifts")
        shift_map = {row['name']: row['id'] for _, row in all_shifts.iterrows()}
        
        # Apply Mapping
        if my_shift_name in ['A', 'A2']:
            target_shift_name = 'A1'
        elif my_shift_name in ['B', 'B2']:
            target_shift_name = 'B1'
            
        target_shift_id = shift_map.get(target_shift_name)
        
        if not target_shift_id:
             st.error(f"Target Shift '{target_shift_name}' not found in database. Please ask Manager to create it.")
             return

        st.info(f"Supervisor Shift: **{my_shift_name}** → Taking Attendance for: **{target_shift_name}** Workers")
        
        # 1. Get Workers in Region AND Target Shift
        workers = run_query("SELECT id, name, role, status FROM workers WHERE region = :r AND shift_id = :sid AND status = 'Active' ORDER BY name", 
                            params={"r": selected_region_mp, "sid": target_shift_id})
        
        if workers.empty:
            st.info(f"No active workers found in {selected_region_mp} for {target_shift_name} Shift.")
        else:
            # Fetch existing attendance for the SELECTED date and TARGET SHIFT
            existing = run_query("SELECT worker_id, status, notes FROM attendance WHERE date = :d AND shift_id = :s", {"d": date_str, "s": target_shift_id})
            
            display_data = []
            for i, w in workers.iterrows():
                row = {"ID": w['id'], "Name": w['name'], "Role": w['role'], "Status": "Present", "Notes": ""}
                if not existing.empty:
                    match = existing[existing['worker_id'] == w['id']]
                    if not match.empty:
                        row['Status'] = match.iloc[0]['status']
                        row['Notes'] = match.iloc[0]['notes']
                display_data.append(row)
            
            df_att = pd.DataFrame(display_data)
            
            @st.fragment
            def render_attendance_form(df_to_edit):
                with st.form("attendance_form"):
                    edited_att = st.data_editor(
                        df_to_edit,
                        # Key must change if shift changes to avoid stale data
                        key=f"att_editor_{selected_region_mp}_{target_shift_id}",
                        column_config={
                            "ID": st.column_config.NumberColumn(disabled=True),
                            "Name": st.column_config.TextColumn(disabled=True),
                            "Role": st.column_config.TextColumn(disabled=True),
                            "Status": st.column_config.SelectboxColumn(
                                options=ATTENDANCE_STATUSES, required=True),
                            "Notes": st.column_config.TextColumn()
                        },
                        hide_index=True, width="stretch"
                    )
                    
                    if st.form_submit_button("💾 Submit Attendance"):
                        batch_cmds = []
                        for i, row in edited_att.iterrows():
                            # 1. Delete Existing using TARGET SHIFT ID (where the record belongs)
                            batch_cmds.append(("DELETE FROM attendance WHERE worker_id=:wid AND date=:d AND shift_id=:sid", 
                                               {"wid": row['ID'], "d": date_str, "sid": target_shift_id}))
                            # 2. Insert New
                            batch_cmds.append(("INSERT INTO attendance (worker_id, date, shift_id, status, notes, supervisor) VALUES (:wid, :d, :sid, :s, :n, :sup)",
                                               {"wid": row['ID'], "d": date_str, "sid": target_shift_id, "s": row['Status'], "n": row['Notes'], "sup": user['name']}))
                        
                        if run_batch_action(batch_cmds):
                            st.toast(f"Attendance recorded for {len(edited_att)} workers on {date_str}!", icon="✅")
                            time.sleep(1); st.rerun()
            render_attendance_form(df_att)

    with tab2:
        st.dataframe(run_query("SELECT * FROM workers WHERE region = :r", {"r": selected_region_mp}), width="stretch")
