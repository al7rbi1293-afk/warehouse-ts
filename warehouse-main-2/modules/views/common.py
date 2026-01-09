
import streamlit as st
import time
from modules.inventory_logic import get_inventory, update_central_stock

def render_bulk_stock_take(location, user_name, key_prefix):
    inv = get_inventory(location)
    if inv.empty:
        st.info(f"No inventory found in {location}")
        return

    df_view = inv[['name_en', 'category', 'qty', 'unit']].copy()
    df_view.rename(columns={'qty': 'System Qty', 'name_en': 'Item Name'}, inplace=True)
    df_view['Physical Count'] = df_view['System Qty'] 

    st.markdown(f"### 📋 {location} Stock Take")
    
    with st.form(f"stock_form_{key_prefix}_{location}"):
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

        if st.form_submit_button(f"💾 Update {location} Stock", width="stretch"):
            changes_count = 0
            for index, row in edited_df.iterrows():
                sys_q = int(row['System Qty'])
                phy_q = int(row['Physical Count'])
                if sys_q != phy_q:
                    diff = phy_q - sys_q
                    update_central_stock(row['Item Name'], location, diff, user_name, "Stock Take", row['unit'])
                    changes_count += 1
            
            if changes_count > 0:
                st.toast(f"✅ Updated {changes_count} items in {location}!")
                st.cache_data.clear(); time.sleep(1); st.rerun()
            else:
                st.info("No changes detected.")
