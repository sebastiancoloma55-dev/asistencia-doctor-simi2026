import streamlit as st

# 1. Configuración de la página
st.set_page_config(
    page_title="Asistencia Doctor Simi",
    page_icon="🏥",
    layout="wide",
    initial_sidebar_state="expanded"
)

# 2. Estilos corporativos (Rojo corporativo, Azul marino, Blanco)
st.markdown("""
    <style>
    .main-header {
        font-size:26px;
        font-weight:bold;
        color: #002B49;
        margin-bottom: 20px;
    }
    .stMetric {
        background-color: #F8F9FA;
        padding: 15px;
        border-radius: 8px;
        border-left: 5px solid #E31837;
    }
    </style>
""", unsafe_allow_html=True)

# 3. Menú Lateral Fijo (12 Módulos del proyecto)
st.sidebar.image("https://via.placeholder.com/150x50?text=Doctor+Simi", use_column_width=True)
st.sidebar.title("Menú Principal")

modulo = st.sidebar.radio(
    "Seleccione Módulo:",
    [
        "1. Dashboard",
        "2. Colaboradores",
        "3. Sucursales",
        "4. Asistencia y atrasos",
        "5. Licencias médicas",
        "6. Vacaciones y permisos",
        "7. Papeletas",
        "8. Borradores de correo",
        "9. Amonestaciones y documentos",
        "10. Reportes",
        "11. Usuarios y roles",
        "12. Auditoría"
    ]
)

st.sidebar.markdown("---")
st.sidebar.caption(" Farmacias de Similares Chile S.A.")
st.sidebar.info("Modo Demostración: Base de datos no conectada aún.")

# 4. Encabezado principal
st.markdown('<div class="main-header">ASISTENCIA DOCTOR SIMI - Sistema de Gestión de RRHH</div>', unsafe_allow_html=True)

# 5. Contenido según módulo seleccionado
if modulo == "1. Dashboard":
    st.subheader("📊 Panel Principal (Dashboard)")
    
    # Tarjetas de Indicadores (KPIs)
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Colaboradores Activos", "142", "+3 este mes")
    col2.metric("Asistencia Hoy", "94.2%", "+1.5%")
    col3.metric("Atrasos Registrados", "8", "-2 respecto a ayer")
    col4.metric("Licencias Activas", "5", "0 cambios")

    st.markdown("---")
    
    col_left, col_right = st.columns([2, 1])
    
    with col_left:
        st.write("### 📅 Resumen Semanal de Asistencia")
        # Datos de demostración
        datos_demo = {
            "Día": ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"],
            "A Tiempo": [138, 139, 135, 137, 134],
            "Atrasos": [4, 3, 7, 5, 8]
        }
        st.bar_chart(datos_demo, x="Día")

    with col_right:
        st.write("### 🚨 Alertas Recientes")
        st.warning(" 3 papeletas de permiso pendientes de aprobación.")
        st.error(" 2 licencias médicas próximas a vencer esta semana.")
        st.info(" Recordatorio: Cierre de marcaciones de turno el viernes.")

else:
    st.subheader(f"🛠️ Módulo: {modulo}")
    st.info("Estructura visual lista. En el siguiente paso conectaremos los datos correspondientes.")
