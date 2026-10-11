(() => {
    const panel = () => document.getElementById("dashboard-freshness-list");
    const names = {
        colaboradores: "Colaboradores",
        sucursales: "Sucursales",
        config_sucursales: "Configuración de sucursales",
        config_correos: "Correos por sucursal",
        asistencia: "Asistencia",
        licencias: "Licencias médicas",
        vacaciones: "Vacaciones",
        talana_bot: "Reportes del bot Talana",
        talana_ausentismos: "Reporte Talana de ausentismos",
        talana_vacaciones: "Reporte Talana de vacaciones"
    };

    function textNode(tag, className, value) {
        const node = document.createElement(tag);
        node.className = className;
        node.textContent = value || "";
        return node;
    }

    async function cargarResumenActualizaciones() {
        const target = panel();
        if (!target) return;
        try {
            const { data: sessionData, error: sessionError } = await _supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (!sessionData?.session) {
                target.replaceChildren(textNode("p", "text-sm text-slate-500", "Inicia sesión para consultar las fechas de actualización."));
                return;
            }
            const { data, error } = await _supabase
                .from("actualizaciones_fuentes")
                .select("modulo,actualizado_en,archivo,origen")
                .order("actualizado_en", { ascending: false })
                .limit(6);
            if (error) throw error;
            target.replaceChildren();
            if (!data?.length) {
                target.append(textNode("p", "text-sm text-slate-500", "Todavía no hay cargas registradas en los módulos que puedes consultar."));
                return;
            }
            for (const item of data) {
                const card = textNode("div", "rounded-lg border border-slate-100 bg-slate-50 p-3", "");
                const heading = textNode("div", "flex flex-wrap items-start justify-between gap-2", "");
                heading.append(textNode("b", "text-sm text-slate-800", names[item.modulo] || item.modulo));
                const source = item.origen === "bot" ? "Bot Talana" : item.origen === "manual" ? "Carga manual" : "Sistema";
                heading.append(textNode("span", "rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600", source));
                card.append(heading);
                const timestamp = item.actualizado_en
                    ? new Date(item.actualizado_en).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short" })
                    : "Fecha no disponible";
                card.append(textNode("p", "mt-1 text-xs text-slate-600", timestamp + " · hora de Chile"));
                if (item.archivo) card.append(textNode("p", "mt-1 break-all text-xs text-slate-500", item.archivo));
                target.append(card);
            }
        } catch (error) {
            console.warn("No se pudo cargar el resumen de actualizaciones:", error);
            target.replaceChildren(textNode("p", "text-sm text-rose-700", "No se pudo consultar la fecha de las cargas. Revisa la conexión o los permisos del módulo."));
        }
    }

    window.cargarResumenActualizaciones = cargarResumenActualizaciones;
    document.addEventListener("DOMContentLoaded", () => {
        cargarResumenActualizaciones();
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") cargarResumenActualizaciones();
        });
    });
    _supabase.auth.onAuthStateChange((event, session) => {
        if (session && ["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED"].includes(event)) {
            setTimeout(() => cargarResumenActualizaciones(), 0);
        }
        if (event === "SIGNED_OUT") {
            const target = panel();
            if (target) target.replaceChildren(textNode("p", "text-sm text-slate-500", "Inicia sesión para consultar las fechas de actualización."));
        }
    });
})();
