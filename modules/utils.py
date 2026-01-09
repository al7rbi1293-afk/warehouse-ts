
import streamlit as st

def setup_styles():
    st.markdown("""
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
        html, body, [class*="css"] {
            font-family: 'Cairo', sans-serif;
        }
        /* Button Styling */
        div.stButton > button {
            background-color: #2e86de;
            color: white;
            border-radius: 8px;
            border: none;
            padding: 0.5rem 1rem;
            transition: all 0.3s ease;
        }
        div.stButton > button:hover {
            background-color: #54a0ff;
            transform: translateY(-2px);
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        /* Header Styling */
        h1, h2, h3 {
            color: #222f3e;
            font-weight: 700;
        }
        /* Card-like Look for Expanders/Containers */
        .stExpander {
            border: 1px solid #c8d6e5;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        /* Success/Error/Info Messages */
        .stAlert {
            border-radius: 8px;
        }
        /* Footer */
        .footer {position: fixed; left: 0; bottom: 0; width: 100%; background-color: transparent; color: grey; text-align: right; padding-right: 20px; padding-bottom: 10px; z-index: 100;}
        </style>
    """, unsafe_allow_html=True)

def show_footer():
    st.markdown(
        """
        <div class='footer'>
            <p>COPYRIGHT © abdulaziz alhazmi AST.Project manager</p>
        </div>
        """,
        unsafe_allow_html=True
    )
