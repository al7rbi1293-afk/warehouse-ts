
import streamlit as st
import time
from modules.inventory_logic import get_inventory, update_central_stock
from modules.database import run_batch_action, get_connection
from sqlalchemy import text

@st.fragment
def render_bulk_stock_take(location, user_name, key_prefix):
    inv = get_inventory(location)
    if inv.empty:
        st.info(f"No inventory found in {location}")
        return

    df_view = inv[['name_en', 'category', 'qty', 'unit']].copy()
    df_view.rename(columns={'qty': 'System Qty', 'name_en': 'Item Name'}, inplace=True)
    df_view['Physical Count'] = df_view['System Qty'] 

    st.markdown(f"### 📋 {location} Stock Take")
    
    with st.form(key=f"stock_form_{key_prefix}_{location}"):
        edited_df = st.data_editor(
            df_view,
            key=f"stock_editor_{key_prefix}_{location}",
            column_config={
                "Item Name": st.column_config.TextColumn(disabled=True),
                "category": st.column_config.TextColumn(disabled=True),
                "unit": st.column_config.TextColumn(disabled=True),
                "System Qty": st.column_config.NumberColumn(disabled=True),
                "Physical Count": st.column_config.NumberColumn(min_value=0, max_value=20000, required=True)
            },
            disabled=["Item Name", "category", "unit", "System Qty"],
            hide_index=True,
            width="stretch",
            height=500
        )

        submitted = st.form_submit_button(f"💾 Update {location} Stock", width="stretch")
    
    if submitted:
        # Collect all changes for batch processing (performance optimization)
        batch_cmds = []
        changes_count = 0
        
        for index, row in edited_df.iterrows():
            sys_q = int(row['System Qty'])
            phy_q = int(row['Physical Count'])
            if sys_q != phy_q:
                diff = phy_q - sys_q
                item_name = row['Item Name']
                unit = row['unit']
                
                # Update inventory
                batch_cmds.append((
                    "UPDATE inventory SET qty = qty + :diff, last_updated = NOW() WHERE name_en = :name AND location = :loc",
                    {"diff": diff, "name": item_name, "loc": location}
                ))
                # Log the change
                batch_cmds.append((
                    "INSERT INTO stock_logs (log_date, action_by, action_type, item_name, location, change_amount, new_qty, unit) VALUES (NOW(), :u, 'Stock Take', :item, :loc, :diff, :nq, :unit)",
                    {"u": user_name, "item": item_name, "loc": location, "diff": diff, "nq": phy_q, "unit": unit}
                ))
                changes_count += 1
        
        if changes_count > 0:
            if run_batch_action(batch_cmds):
                st.toast(f"✅ Updated {changes_count} items in {location}!")
                time.sleep(1); st.rerun()
            else:
                st.error("Failed to update stock. Please try again.")
        else:
            st.info("No changes detected.")

