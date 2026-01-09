
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
def manager_view_manpower():
    st.header("👷‍♂️ Manpower Project Management")
    tab1, tab2, tab3, tab4 = st.tabs(["📊 Reports", "👥 Worker Database", "⏰ Duty Roster / Shifts", "📍 Supervisors"])

    with tab2: # Worker Database
        st.subheader("Manage Workers")
        # Optimization: Cache worker list for 10 seconds to avoid reload flicker but keep fresh enough
        workers = run_query("SELECT * FROM workers ORDER BY id DESC", ttl=10)
        
        if not workers.empty:
            excel_data = convert_df_to_excel(workers, "Workers")
            st.download_button("📥 Export Worker List", excel_data, "workers_list.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        
        # Add Worker
        with st.expander("➕ Add New Worker", expanded=True):
            with st.form("add_worker_form", clear_on_submit=True):
                c1, c2, c3, c4, c5 = st.columns(5)
                # Layout: Name | Emp ID | Role | Region | Shift
                wn = c1.text_input("Worker Name")
                we = c2.text_input("EMP ID (Numbers Only)")
                wr = c3.text_input("Role/Position")
                wreg = c4.selectbox("Region", AREAS)
                
                # Fetch Shifts (Cached: 10s to reflect updates)
                shifts = run_query("SELECT id, name FROM shifts", ttl=10)
                shift_opts = {s['name']: s['id'] for i, s in shifts.iterrows()} if not shifts.empty else {}
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
                            st.cache_data.clear(); st.rerun()
                    else: st.error("Name and EMP ID required")
        
        
        # Bulk Add Workers
        with st.expander("⚡ Mass Add Workers (Excel Copy-Paste)"):
            st.info("Tip: You can copy rows from Excel and paste them here. Columns must match: Name, EMP ID, Role, Region, Shift.")
            
            # Prepare empty template
            shifts = run_query("SELECT id, name FROM shifts")
            shift_names = shifts['name'].tolist() if not shifts.empty else []
            shift_map = {r['name']: r['id'] for i, r in shifts.iterrows()} if not shifts.empty else {}
            
            template_data = pd.DataFrame(columns=["Name", "EMP ID", "Role", "Region", "Shift"])
            
            with st.form("bulk_worker_add_form"):
                edited_bulk = st.data_editor(
                    template_data,
                    num_rows="dynamic",
                    key="bulk_worker_editor",
                    column_config={
                        "Name": st.column_config.TextColumn(required=True),
                        "EMP ID": st.column_config.TextColumn(required=True, validate="^[0-9]+$"),
                        "Role": st.column_config.TextColumn(),
                        "Region": st.column_config.SelectboxColumn(options=AREAS, required=True),
                        "Shift": st.column_config.SelectboxColumn(options=shift_names)
                    },
                    hide_index=True, width="stretch"
                )
                
                if st.form_submit_button("💾 Save All Workers"):
                    if edited_bulk.empty:
                        st.warning("No data to save.")
                    else:
                        batch_cmds = []
                        valid = True
                        for i, row in edited_bulk.iterrows():
                            if not row['Name'] or not row['EMP ID']:
                                st.error(f"Row {i+1}: Name and EMP ID are required."); valid = False; break
                            
                            sid = shift_map.get(row['Shift']) if row['Shift'] in shift_map else None
                            batch_cmds.append((
                                "INSERT INTO workers (name, emp_id, role, region, shift_id) VALUES (:n, :e, :r, :reg, :sid)",
                                {"n": row['Name'], "e": row['EMP ID'], "r": row['Role'], "reg": row['Region'], "sid": sid}
                            ))
                        
                        if valid:
                            if run_batch_action(batch_cmds):
                                st.balloons(); st.success(f"Successfully added {len(batch_cmds)} workers!"); st.cache_data.clear(); time.sleep(1); st.rerun()

        # Edit Workers
        if not workers.empty:
            with st.form("edit_worker_db_form"):
                edited_w = st.data_editor(
                    workers,
                    key="worker_editor",
                    column_config={
                        "id": st.column_config.NumberColumn(disabled=True),
                        "created_at": st.column_config.DatetimeColumn(disabled=True),
                        "shift_id": st.column_config.NumberColumn(disabled=True), # Hide or disable complex edit
                        "emp_id": st.column_config.TextColumn("EMP ID", required=True),
                        "status": st.column_config.SelectboxColumn(options=["Active", "Inactive"], required=True),
                        "region": st.column_config.SelectboxColumn(options=AREAS, required=True)
                    },
                    hide_index=True, width="stretch"
                )
                if st.form_submit_button("💾 Save Worker Changes"):
                    changes = 0
                    for index, row in edited_w.iterrows():
                        # Basic validation for update could be added here if needed
                        eid = str(row['emp_id']) if row['emp_id'] else ""
                        if eid and not eid.isdigit():
                             st.error(f"Invalid EMP ID for {row['name']}: Numbers only."); continue

                        run_action("UPDATE workers SET name=:n, emp_id=:e, role=:r, region=:reg, status=:s WHERE id=:id",
                                   {"n":row['name'], "e":eid, "r":row['role'], "reg":row['region'], "s":row['status'], "id":row['id']})
                        # Note: Editing Shift ID in data_editor is complex with FKs. 
                        # Ideally we add a "Move Shift" Action or handle it here if we load shift name.
                        changes += 1
                    if changes > 0: st.success("Updated"); st.cache_data.clear(); time.sleep(1); st.rerun()

    with tab3: # Shifts
        st.subheader("⏰ Shift Management (Duty Roster)")
        shifts = run_query("SELECT * FROM shifts ORDER BY id", ttl=0) # Real-time here as we might benefit from instant updates during editing
        
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
            # Shift Editor (Read Only for now mostly, but if we edit, we should wrap it)
            # Since user asked to fix refreshes for inputs, and data_editor IS an input.
            with st.form("edit_shifts_form"):
                 st.data_editor(shifts, key="shift_editor", disabled=["id"], hide_index=True, width="stretch")
                 st.form_submit_button("Save Changes (Simulated)", disabled=True, help="Shift editing logic not fully implemented yet.")
            
    with tab4: # Supervisors
        st.subheader("📍 Supervisor Region Assignment")
        # Fetch only supervisors
        supervisors = run_query("SELECT username, name, region FROM users WHERE role = 'supervisor' ORDER BY name")
        
        if supervisors.empty:
            st.info("No supervisors found.")
        else:
            # We cannot easily edit a multi-select in a data_editor yet for complex strings like "A,B".
            # So we will use a loop with expanders or a selection to edit one by one.
            
            # Option 1: Select a supervisor to edit
            sup_list = supervisors['username'].tolist()
            selected_sup_u = st.selectbox("Select Supervisor to Edit", sup_list, format_func=lambda x: f"{x} - {supervisors[supervisors['username']==x].iloc[0]['name']}")
            
            if selected_sup_u:
                current_row = supervisors[supervisors['username'] == selected_sup_u].iloc[0]
                
                with st.form("update_sup_form"):
                    # Region Editing
                    current_regions_str = current_row['region'] if current_row['region'] else ""
                    current_regions_list = current_regions_str.split(",") if current_regions_str else []
                    valid_defaults = [r for r in current_regions_list if r in AREAS]
                    new_regions = st.multiselect(f"Assign Regions for {current_row['name']}", AREAS, default=valid_defaults)
                    
                    # Shift Editing (New)
                    shifts = run_query("SELECT id, name FROM shifts")
                    # We need to fetch current shift for user. Query above didn't get it.
                    # Let's re-fetch full user row.
                    u_full = run_query("SELECT shift_id, role FROM users WHERE username = :u", {"u":selected_sup_u}).iloc[0]
                    
                    s_opts = {s['name']: s['id'] for i, s in shifts.iterrows()}
                    cur_s_id = u_full['shift_id']
                    # Create reverse lookup or find name
                    cur_s_name = next((k for k, v in s_opts.items() if v == cur_s_id), None)
                    idx = list(s_opts.keys()).index(cur_s_name) if cur_s_name in s_opts else 0
                    
                    new_shift_name = st.selectbox("Assign Shift", list(s_opts.keys()), index=idx if s_opts else 0)
                    
                    # Role Editing (To allow changing to Night Supervisor)
                    roles = ["supervisor", "storekeeper", "night_supervisor"]
                    cur_role = u_full['role']
                    new_role = st.selectbox("Assign Role", roles, index=roles.index(cur_role) if cur_role in roles else 0)

                    if st.form_submit_button("Update Supervisor Profile"):
                        new_reg_str = ",".join(new_regions)
                        new_sid = s_opts.get(new_shift_name)
                        run_action("UPDATE users SET region=:r, shift_id=:sid, role=:role WHERE username=:u", 
                                {"r": new_reg_str, "sid":new_sid, "role":new_role, "u": selected_sup_u})
                        st.success(f"Updated {current_row['name']}"); st.cache_data.clear(); time.sleep(1); st.rerun()
            
            st.divider()
            st.dataframe(supervisors, width="stretch")

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
        
        # 1. Select Shift (Move outside if causing refresh issues? Shifts rarely change, fine here)
        shifts = run_query("SELECT * FROM shifts")
        if shifts.empty:
            st.warning("No shifts defined. Please contact Manager.")
            return
            
        shift_opts = {f"{r['name']} ({r['start_time']}-{r['end_time']})": r['id'] for i, r in shifts.iterrows()}
        selected_shift_label = c_shift.selectbox("Select Shift", list(shift_opts.keys()))
        selected_shift_id = shift_opts[selected_shift_label]
        
        # 2. Get Workers in Region (Cached 60s as this list rarely changes mid-day)
        workers = run_query("SELECT id, name, role, status FROM workers WHERE region = :r AND status = 'Active' ORDER BY name", 
                            params={"r": selected_region_mp}, ttl=60)
        
        if workers.empty:
            st.info(f"No active workers found in {selected_region_mp}.")
        else:
            # Fetch existing attendance for the SELECTED date
            existing = run_query("SELECT worker_id, status, notes FROM attendance WHERE date = :d AND shift_id = :s", {"d": date_str, "s": selected_shift_id})
            
            display_data = []
            for i, w in workers.iterrows():
                # Default status logic:
                # If editing past, showing 'Present' as default might be misleading if they weren't marked.
                # However, for 'new' entry, Present is good default. 
                # Ideally, we check if record exists. If not, default is Present.
                row = {"ID": w['id'], "Name": w['name'], "Role": w['role'], "Status": "Present", "Notes": ""}
                if not existing.empty:
                    match = existing[existing['worker_id'] == w['id']]
                    if not match.empty:
                        row['Status'] = match.iloc[0]['status']
                        row['Notes'] = match.iloc[0]['notes']
                display_data.append(row)
            
            df_att = pd.DataFrame(display_data)
            
            with st.form("attendance_form"):
                edited_att = st.data_editor(
                    df_att,
                    key=f"att_editor_{selected_region_mp}_{selected_shift_id}",
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
                        # 1. Delete Existing
                        batch_cmds.append(("DELETE FROM attendance WHERE worker_id=:wid AND date=:d AND shift_id=:sid", 
                                           {"wid": row['ID'], "d": date_str, "sid": selected_shift_id}))
                        # 2. Insert New
                        batch_cmds.append(("INSERT INTO attendance (worker_id, date, shift_id, status, notes, supervisor) VALUES (:wid, :d, :sid, :s, :n, :sup)",
                                           {"wid": row['ID'], "d": date_str, "sid": selected_shift_id, "s": row['Status'], "n": row['Notes'], "sup": user['name']}))
                    
                    if run_batch_action(batch_cmds):
                        st.toast(f"Attendance recorded for {len(edited_att)} workers on {date_str}!", icon="✅")
                        st.cache_data.clear(); time.sleep(1); st.rerun()

    with tab2:
        st.dataframe(run_query("SELECT * FROM workers WHERE region = :r", {"r": selected_region_mp}), width="stretch")
