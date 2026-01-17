
import streamlit as st
import pandas as pd
import plotly.express as px
from modules.database import run_query
from modules.config import AREAS

@st.fragment
def manager_dashboard():
    st.header("📊 Executive Dashboard")
    
    # --- Top Metrics Row ---
    col1, col2, col3, col4 = st.columns(4)
    
    # 1. Total Workers
    workers = run_query("SELECT count(*) as count FROM workers WHERE status='Active'")
    w_count = workers.iloc[0]['count'] if not workers.empty else 0
    col1.metric("👷 Active Workers", w_count)
    
    # 2. Today's Attendance Rate
    today = pd.Timestamp.now().strftime('%Y-%m-%d')
    att = run_query("SELECT status FROM attendance WHERE date = :d", {"d": today})
    if not att.empty:
        present = len(att[att['status'] == 'Present'])
        rate = round((present / w_count * 100), 1) if w_count > 0 else 0
        col2.metric("✅ Attendance Rate", f"{rate}%", f"{present} / {w_count}")
    else:
        col2.metric("✅ Attendance Rate", "0%", "No Data Today")

    # 3. Pending Requests
    reqs = run_query("SELECT count(*) as count FROM requests WHERE status='Pending'")
    r_count = reqs.iloc[0]['count'] if not reqs.empty else 0
    col3.metric("📝 Pending Requests", r_count)
    
    # 4. Low Stock Alerts
    # Assume low stock is < 10 for simplicity (or category based)
    low_stock = run_query("SELECT count(*) as count FROM inventory WHERE qty < 10")
    ls_count = low_stock.iloc[0]['count'] if not low_stock.empty else 0
    col4.metric("⚠️ Low Stock Items", ls_count)
    
    st.divider()
    
    # --- Charts Row 1 ---
    c1, c2 = st.columns(2)
    
    with c1:
        st.subheader("👥 Workers by Region")
        w_reg = run_query("SELECT region, count(*) as count FROM workers WHERE status='Active' GROUP BY region")
        if not w_reg.empty:
            fig = px.pie(w_reg, values='count', names='region', hole=0.4)
            st.plotly_chart(fig, use_container_width=True)
        else: st.info("No worker data")
        
    with c2:
        st.subheader("📦 Stock Value by Category (NSTC)")
        # Assuming value is just qty for now as we don't have price
        stock = run_query("SELECT category, sum(qty) as total_qty FROM inventory WHERE location='NSTC' GROUP BY category")
        if not stock.empty:
            fig = px.bar(stock, x='category', y='total_qty', color='category')
            st.plotly_chart(fig, use_container_width=True)
        else: st.info("No stock data")

    # --- Charts Row 2 ---
    st.subheader("📈 Attendance Trend (Last 7 Days)")
    trend = run_query("""
        SELECT date, count(*) as present_count 
        FROM attendance 
        WHERE status='Present' AND date >= CURRENT_DATE - INTERVAL '7 days' 
        GROUP BY date 
        ORDER BY date
    """)
    if not trend.empty:
        fig_line = px.line(trend, x='date', y='present_count', markers=True)
        st.plotly_chart(fig_line, use_container_width=True)
    else: st.info("No attendance history")
