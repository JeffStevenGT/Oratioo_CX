import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { supabase, TABLA_CLIENTES } from "../supabaseClient";
import {
  LayoutDashboard,
  Users,
  Settings,
  Upload,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  Phone,
  Package,
  Calendar,
  ChevronDown,
  Globe,
  Loader2,
  KeyRound,
  X,
} from "lucide-react";

// Grupos del sidebar
const GROUPS = [
  {
    label: "Infraestructura",
    items: [
      {
        to: "/clientes",
        icon: Users,
        label: "Clientes",
        badge: null,
      },
      {
        to: "/configurar-bot",
        icon: Settings,
        label: "Configurar Bot",
        badge: null,
      },
      {
        to: "/documentos",
        icon: Upload,
        label: "Analizar Clientes",
        badge: null,
      },
      {
        to: "/lotes",
        icon: Package,
        label: "Asignar Leads",
        badge: null,
      },
    ],
  },
  {
    label: "Comercial",
    items: [
      {
        to: "/dialer",
        icon: Phone,
        label: "Power Dialer",
        badge: null,
      },
      {
        to: "/agenda",
        icon: Calendar,
        label: "Agenda",
        badge: "agenda",
      },
    ],
  },
  {
    label: "Administración",
    items: [
      {
        to: "/admin/users",
        icon: Shield,
        label: "Usuarios",
        badge: null,
      },
    ],
  },
];

export default function Sidebar({ onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [passForm, setPassForm] = useState({ current: '', newPass: '', confirm: '' });
  const [passSaving, setPassSaving] = useState(false);
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');
  const [agendaCount, setAgendaCount] = useState(0);
  const [gruposAbiertos, setGruposAbiertos] = useState(() => {
    const saved = localStorage.getItem("sidebar_grupos");
    return saved
      ? JSON.parse(saved)
      : { Comercial: true, Infraestructura: false, Administración: false };
  });

    const session = JSON.parse(localStorage.getItem("oratioo_session") || "{}");
  const userRol = session.rol || "jefe_area";
  const myId = session.id;

  // ── Permisos por rol para cada item del sidebar ──────────
  const ITEM_PERMISSIONS = {
    '/dashboard': { asesor: false, supervisor: true, back_office: true, it: true, jefe_area: true, desarrollador: true },
    '/clientes': { asesor: false, supervisor: true, back_office: true, it: true, jefe_area: true, desarrollador: true },
    '/configurar-bot': { asesor: false, supervisor: false, back_office: false, it: true, jefe_area: true, desarrollador: true },
    '/documentos': { asesor: false, supervisor: true, back_office: true, it: true, jefe_area: true, desarrollador: true },
    '/lotes': { asesor: false, supervisor: true, back_office: false, it: false, jefe_area: true, desarrollador: true },
    '/dialer': { asesor: true, supervisor: true, back_office: false, it: false, jefe_area: false, desarrollador: false },
    '/agenda': { asesor: true, supervisor: true, back_office: true, it: false, jefe_area: false, desarrollador: false },
    '/admin/users': { asesor: false, supervisor: false, back_office: false, it: false, jefe_area: true, desarrollador: true },
  }

  const ABRIR_ORANGE_PERMS = {
    asesor: true, supervisor: true, back_office: true, it: true, jefe_area: true, desarrollador: true,
  }

  const canSee = (item) => {
    const perms = ITEM_PERMISSIONS[item.to]
    return perms ? perms[userRol] : true
  }

  useEffect(() => {
    if (!myId) return;
    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);
    const hoyFin = new Date();
    hoyFin.setHours(23, 59, 59, 999);

    supabase
      .from(TABLA_CLIENTES)
      .select("atributos_dinamicos")
      .limit(500)
      .then(({ data }) => {
        if (!data) return;
        const ag = data.filter((c) => {
          const p = c.atributos_dinamicos?.pipeline;
          if (!p?.callback_at || !p?.asesor_id) return false;
          if (Number(p.asesor_id) !== Number(myId)) return false;
          const ca = new Date(p.callback_at);
          return ca >= hoyInicio && ca <= hoyFin;
        }).length;
        setAgendaCount(ag);
      })
      .catch(() => {});
  }, []);

  const toggleGrupo = (label) => {
    setGruposAbiertos((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      localStorage.setItem("sidebar_grupos", JSON.stringify(next));
      return next;
    });
  };

  const badgeCount = (badgeType) => {
    if (badgeType === "agenda") return agendaCount;
    return 0;
  };

  return (
    <aside
      className={`${collapsed ? "w-16" : "w-60"} bg-[#481163] border-r border-[#5d1a7a] flex flex-col transition-all duration-300 h-screen sticky top-0`}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-[#5d1a7a]">
        {!collapsed && (
          <svg
            viewBox="0 0 123 19"
            className="h-5 w-auto"
            style={{ filter: "brightness(0) invert(1)" }}
          >
            <path d="M26.511 7.841C26.369 6.9 26.072 5.922 25.552 4.988C25.423 4.759 25.263 4.512 25.089 4.237C25.003 4.1 24.892 3.969 24.785 3.825C24.675 3.685 24.564 3.532 24.437 3.386C23.919 2.801 23.252 2.168 22.363 1.585C21.474 1.009 20.353 0.496 19.011 0.212C18.677 0.146 18.326 0.1 17.969 0.05C17.788 0.039 17.607 0.031 17.422 0.02L17.141 0.007L17.001 0L15.033 0C13.859 0 12.213 0.002 10.86 0.004C10.521 0.004 10.202 0.007 9.913 0.009L9.696 0.009C9.608 0.013 9.522 0.017 9.438 0.02C9.273 0.028 9.119 0.037 8.979 0.044C8.698 0.052 8.474 0.1 8.321 0.118L8.081 0.155C8.081 0.155 7.979 0.17 7.796 0.199C7.615 0.236 7.357 0.301 7.038 0.382C6.878 0.417 6.708 0.476 6.527 0.539C6.346 0.605 6.152 0.672 5.948 0.744C5.559 0.926 5.118 1.105 4.702 1.364C3.854 1.856 3.008 2.521 2.366 3.261C2.192 3.436 2.054 3.635 1.909 3.816C1.764 3.999 1.626 4.178 1.515 4.366C1.4 4.549 1.291 4.724 1.187 4.89C1.095 5.06 1.015 5.226 0.941 5.377C0.403 6.481 0.156 7.529 0.047 8.446C0.034 8.677 0.023 8.9 0.011 9.114C0.007 9.219 0.002 9.321 0 9.424V10.216C0 10.262 0.005 10.306 0.007 10.352L0.02 10.614C0.029 10.784 0.041 10.95 0.05 11.107C0.066 11.264 0.095 11.415 0.115 11.559C0.163 11.849 0.201 12.116 0.274 12.353C0.339 12.594 0.396 12.816 0.459 13.017C0.534 13.216 0.604 13.397 0.667 13.565C1.07 14.552 1.631 15.405 2.268 16.126C2.922 16.835 3.655 17.405 4.415 17.855C5.959 18.719 7.615 19.086 9.155 18.983C9.345 18.968 9.537 18.955 9.725 18.94L10.193 18.868C10.505 18.815 10.815 18.763 11.125 18.71C11.747 18.601 12.367 18.479 13 18.35C14.262 18.09 15.565 17.789 16.98 17.449C15.565 17.108 14.262 16.807 13 16.547C12.369 16.416 11.747 16.296 11.125 16.187L10.193 16.03L9.725 15.958C9.603 15.927 9.481 15.899 9.356 15.868C8.382 15.643 7.5 15.194 6.694 14.582C6.303 14.257 5.932 13.895 5.598 13.476C5.262 13.029 4.986 12.543 4.779 12.028C4.745 11.937 4.706 11.838 4.666 11.731C4.634 11.622 4.607 11.5 4.571 11.371C4.526 11.242 4.514 11.096 4.489 10.939C4.478 10.86 4.46 10.78 4.451 10.694C4.446 10.609 4.444 10.518 4.44 10.426C4.437 10.38 4.435 10.332 4.431 10.284L4.426 10.21V9.428C4.426 9.358 4.433 9.31 4.437 9.249C4.444 9.134 4.451 9.011 4.455 8.885C4.521 8.389 4.652 7.824 4.948 7.228L5.082 6.964C5.141 6.874 5.202 6.78 5.265 6.68C5.322 6.577 5.401 6.481 5.48 6.381C5.561 6.283 5.629 6.169 5.729 6.077C6.077 5.667 6.543 5.305 7.004 5.034C7.228 4.883 7.47 4.796 7.678 4.687C7.789 4.648 7.893 4.61 7.993 4.576C8.09 4.538 8.18 4.503 8.269 4.486C8.44 4.442 8.581 4.405 8.678 4.381C8.777 4.368 8.832 4.359 8.832 4.359C8.832 4.359 8.877 4.353 8.961 4.342C9.044 4.333 9.164 4.3 9.318 4.305C9.395 4.303 9.479 4.298 9.569 4.294C9.614 4.292 9.662 4.29 9.709 4.285H9.913C10.202 4.285 10.521 4.285 10.86 4.29C12.213 4.29 13.859 4.294 15.033 4.294L16.992 4.294L17.069 4.298C17.121 4.3 17.17 4.305 17.22 4.307C17.322 4.311 17.422 4.316 17.519 4.318C17.711 4.353 17.901 4.373 18.082 4.405C18.806 4.558 19.416 4.831 19.903 5.145C20.389 5.466 20.755 5.813 21.045 6.13C21.117 6.211 21.174 6.296 21.235 6.372C21.293 6.451 21.361 6.518 21.404 6.595C21.495 6.748 21.596.879 21.662 7.003C21.952 7.509 22.128 8.031 22.252 8.542C22.275 8.671 22.316 8.797 22.332 8.924C22.345 9.053 22.359 9.179 22.377 9.306L22.39 9.4L22.397 9.531C22.402 9.618 22.408 9.706 22.413 9.791C22.418 9.878 22.424 9.963 22.429 10.048L22.438 10.177L22.442 10.273C22.447 10.395 22.454 10.52 22.463 10.642L22.47 10.734L22.465 10.823L22.458 11.004C22.465 11.249 22.422 11.482 22.397 11.723C22.393 11.784 22.384 11.843 22.368 11.899L22.329 12.074L22.293 12.251L22.277 12.34L22.25 12.426C22.178 12.653 22.121 12.893 22.022 13.113C21.857 13.576 21.608 14.004 21.336 14.443L21.108 14.757C21.07 14.809 21.033 14.866 20.99 14.919L20.859 15.067L20.595 15.375C20.495 15.471 20.396 15.565 20.296 15.661L20.145 15.809C20.09 15.855 20.034 15.899 19.979 15.942C19.866 16.034 19.753 16.126 19.638 16.217C19.518 16.303 19.391 16.381 19.265 16.466L19.07 16.595C19.005 16.637 18.935 16.669 18.867 16.706C18.726 16.781 18.584 16.855 18.442 16.931C18.295 16.997 18.141 17.056 17.982 17.121C17.903 17.154 17.824 17.187 17.745 17.217C17.664 17.246 17.582 17.267 17.498 17.291C17.329 17.342 17.157 17.392 16.983 17.442C18.396 17.759 19.898 17.702 21.25 17.213C21.42 17.15 21.59 17.088 21.759 17.025C21.922 16.946 22.083 16.868 22.246 16.792L22.49 16.669C22.569 16.626 22.644 16.575 22.721 16.53L23.182 16.237C23.765 15.811 24.333 15.325 24.797 14.731C25.046 14.445 25.247 14.124 25.455 13.796L25.532 13.672L25.597 13.543L25.729 13.281L25.86 13.015C25.905 12.925 25.946 12.836 25.977 12.742C26.118 12.369 26.262 11.987 26.344 11.581C26.366 11.48 26.391 11.378 26.414 11.275L26.448 11.12L26.468 10.965C26.495 10.756 26.518 10.544 26.54 10.33L26.556 10.173L26.565 10.044C26.57 9.959 26.577 9.874 26.581 9.786C26.586 9.699 26.593 9.614 26.597 9.527L26.604 9.396V9.227C26.604 9.003 26.599 8.773 26.593 8.54C26.583 8.308 26.543 8.075 26.516 7.839Z M45.765 5.209C44.631 4.353 43.46 3.925 42.252 3.925H38.353C36.978 3.925 35.698 4.442 34.511 5.479C33.335 6.645 32.746 7.931 32.746 9.337V9.664C32.746 10.483 32.988 11.343 33.472 12.244C33.692 12.644 34.101 13.128 34.696 13.698C35.877 14.615 37.075 15.073 38.29 15.073H42.252C43.702 15.073 45.048 14.493 46.287 13.331C47.318 12.159 47.834 10.969 47.834 9.762V9.234C47.834 8.337 47.533 7.429 46.932 6.505C46.798 6.211 46.407 5.776 45.765 5.206ZM44.941 11.452C44.168 12.406 43.25 12.882 42.187 12.882H38.432C37.713 12.882 37.037 12.657 36.401 12.205C35.479 11.469 35.015 10.603 35.015 9.607V9.389C35.015 8.83 35.189 8.263 35.54 7.686C36.324 6.638 37.279 6.117 38.407 6.117H42.146C42.65 6.117 43.166 6.239 43.693 6.481C44.955 7.223 45.586 8.23 45.586 9.507C45.586 10.186 45.371 10.834 44.941 11.45Z M59.104 3.925H48.68C48.657 3.925 48.646 3.938 48.639 3.964V15.036C48.639 15.063 48.653 15.076 48.68 15.076H50.871C50.899 15.076 50.912 15.063 50.912 15.036V6.119H59.009C59.063 6.119 59.115 6.123 59.169 6.134C59.61 6.289 59.83 6.562 59.83 6.951C59.83 7.064 59.798 7.195 59.733 7.339C59.565 7.649 59.258 7.806 58.805 7.806H52.136C52.113 7.806 52.102 7.819 52.095 7.846V9.961C52.181 10.055 54.305 11.76 58.466 15.078H61.953V15.063C61.395 14.58 59.301 12.899 55.671 10.016V10H58.78C59.59 10 60.282 9.793 60.85 9.378C61.666 8.695 62.073 7.95 62.073 7.147V6.743C62.073 6.215 61.847 5.645 61.397 5.032C60.689 4.296 59.922 3.927 59.102 3.927Z M71.122 3.925H68.585L62.881 15.058L62.921 15.073H65.393C65.769 14.373 67.255 11.472 69.849 6.366H69.874C70.034 6.713 70.767 8.151 72.065 10.668H69.894V12.875H73.205C73.259 12.982 73.314 13.083 73.37 13.192C73.988 14.447 74.316 15.073 74.354 15.073H76.803L76.844 15.058C75.32 12.083 74.39 10.258 74.058 9.585C72.12 5.818 71.143 3.929 71.127 3.925Z M87.716 3.925H74.361C74.338 3.925 74.325 3.938 74.32 3.964V6.08C74.32 6.106 74.334 6.119 74.361 6.119H79.902V15.036C79.902 15.063 79.916 15.076 79.943 15.076H82.134C82.161 15.076 82.175 15.063 82.175 15.036V6.119H87.716C87.743 6.119 87.757 6.106 87.757 6.08V3.964C87.757 3.945 87.743 3.932 87.716 3.925Z M91.054 3.925H88.887C88.865 3.925 88.851 3.938 88.847 3.964V15.036C88.847 15.063 88.86 15.076 88.887 15.076H91.054C91.081 15.076 91.095 15.063 91.095 15.036V3.964C91.095 3.938 91.081 3.925 91.054 3.925Z M105.036 5.209C103.903 4.353 102.731 3.925 101.523 3.925H97.624C96.249 3.925 94.969 4.442 93.782 5.479C92.606 6.645 92.018 7.931 92.018 9.337V9.664C92.018 10.483 92.26 11.343 92.744 12.244C92.963 12.644 93.372 13.128 93.967 13.698C95.148 14.615 96.346 15.073 97.561 15.073H101.523C102.973 15.073 104.319 14.493 105.558 13.331C106.589 12.159 107.105 10.969 107.105 9.762V9.234C107.105 8.337 106.804 7.429 106.203 6.505C106.069 6.211 105.678 5.776 105.036 5.206ZM104.215 11.452C103.441 12.406 102.523 12.882 101.46 12.882H97.706C96.986 12.882 96.31 12.657 95.675 12.205C94.752 11.469 94.288 10.603 94.288 9.607V9.389C94.288 8.83 94.462 8.263 94.811 7.686C95.596 6.638 96.55 6.117 97.679 6.117H101.417C101.921 6.117 102.437 6.239 102.964 6.481C104.226 7.223 104.857 8.23 104.857 9.507C104.857 10.186 104.642 10.834 104.212 11.45Z M122.098 6.507C121.964 6.213 121.573 5.778 120.931 5.209C119.798 4.353 118.626 3.925 117.418 3.925H113.519C112.144 3.925 110.864 4.442 109.677 5.479C108.501 6.645 107.913 7.931 107.913 9.337V9.664C107.913 10.483 108.155 11.343 108.639 12.244C108.858 12.644 109.267 13.128 109.862 13.698C111.043 14.615 112.241 15.073 113.456 15.073H117.418C118.868 15.073 120.214 14.493 121.453 13.331C122.484 12.159 123 10.969 123 9.762V9.234C123 8.337 122.699 7.429 122.098 6.505ZM120.107 11.452C119.334 12.406 118.416 12.882 117.353 12.882H113.598C112.879 12.882 112.203 12.657 111.567 12.205C110.645 11.469 110.181 10.603 110.181 9.607V9.389C110.181 8.83 110.355 8.263 110.703 7.686C111.488 6.638 112.443 6.117 113.571 6.117H117.31C117.814 6.117 118.33 6.239 118.857 6.481C120.119 7.223 120.75 8.23 120.75 9.507C120.75 10.186 120.535 10.834 120.105 11.45Z" />
          </svg>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded-lg hover:bg-[#1495e0] text-[#11ddde] hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {/* Dashboard siempre arriba (según permiso) */}
        {canSee({ to: '/dashboard' }) && (
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                isActive
                  ? "bg-[#1495e0] text-white"
                  : "text-[#11ddde] hover:text-white hover:bg-[#1495e0]"
              }`
            }
          >
            <LayoutDashboard size={20} className="shrink-0" />
            {!collapsed && <span className="text-sm font-medium">Dashboard</span>}
          </NavLink>
        )}

        {/* Grupos */}
        {!collapsed &&
          GROUPS.filter((group) => group.items.some(canSee)).map((group) => {
            const abierto = gruposAbiertos[group.label];
            return (
              <div key={group.label}>
                <button
                  onClick={() => toggleGrupo(group.label)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[#8e7b94] hover:text-[#11ddde] uppercase tracking-wider font-semibold transition-colors"
                >
                  <ChevronDown
                    size={12}
                    className={`transition-transform ${abierto ? "" : "-rotate-90"}`}
                  />
                  {group.label}
                </button>
                {abierto && (
                  <div className="space-y-0.5 ml-1">
                    {group.items.filter(canSee).map((item) => {
                      const count = badgeCount(item.badge);
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm ${
                              isActive
                                ? "bg-[#1495e0] text-white"
                                : "text-[#11ddde] hover:text-white hover:bg-[#1495e0]/70"
                            }`
                          }
                        >
                          <item.icon size={16} className="shrink-0" />
                          <span className="text-sm">{item.label}</span>
                          {count > 0 && (
                            <span
                              className={`ml-auto text-[10px] font-bold rounded-full min-w-[18px] h-4.5 flex items-center justify-center px-1.5 ${
                                item.badge === "alertas"
                                  ? "bg-red-500 text-white"
                                  : "bg-[#1495e0] text-white"
                              }`}
                            >
                              {count}
                            </span>
                          )}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

        {/* Versión colapsada: items planos */}
        {collapsed &&
          GROUPS.filter((group) => group.items.some(canSee)).map((group) =>
            group.items.filter(canSee).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center justify-center p-2.5 rounded-lg transition-all duration-200 ${
                      isActive
                        ? "bg-[#1495e0] text-white"
                        : "text-[#11ddde] hover:text-white hover:bg-[#1495e0]"
                    }`
                  }
                >
                  <item.icon size={20} />
                </NavLink>
              )),
          )}
      </nav>

      {/* Abrir Orange - descarga .bat con proxy */}
      {ABRIR_ORANGE_PERMS[userRol] && (
        <div className="p-2 border-t border-[#5d1a7a]">
          <button
            onClick={async function () {
              const email = session.email || ''
              if (!email) { alert('Inicia sesion primero'); return }

              // Obtener proxy asignado
              let proxy = ''
              try {
                const { data } = await supabase
                  .from('usuarios')
                  .select('proxy_asignado')
                  .eq('email', email)
                  .limit(1)
                  .single()
                if (data?.proxy_asignado) proxy = data.proxy_asignado
              } catch {}

              if (!proxy) {
                window.open('https://pangea.orange.es/', '_blank')
                return
              }

              // Formato: ip:puerto:user:pass
              const partes = proxy.split(':')
              const ip = partes[0]
              const puerto = partes[1]
              const user = partes[2] || ''
              const pass = partes[3] || ''

              // Crear .bat que abre Chrome SOLO con proxy (sin afectar el sistema)
              const bat = [
                '@echo off',
                'echo Abriendo Orange con proxy espanol...',
                '',
                ':: Guardar credenciales del proxy en Windows',
                'cmdkey /add:' + ip + ':' + puerto + ' /user:' + user + ' /pass:' + pass + ' >nul 2>&1',
                '',
                ':: Buscar Chrome/Chromium y abrirlo SOLO con proxy',
                'set CHROME="%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
                'if not exist %CHROME% set CHROME="%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe"',
                'if not exist %CHROME% set CHROME="%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"',
                '',
                'if exist %CHROME% (',
                '  %CHROME% --proxy-server=http://' + ip + ':' + puerto + ' https://pangea.orange.es/',
                ') else (',
                '  start https://pangea.orange.es/',
                '  echo Chrome no encontrado. Se abrio sin proxy.',
                ')',
                'pause'
              ].join('\n')

              const blob = new Blob([bat], { type: 'application/octet-stream' })
              const urlObj = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = urlObj
              a.download = 'abrir_orange.bat'
              document.body.appendChild(a)
              a.click()
              URL.revokeObjectURL(urlObj)
              document.body.removeChild(a)
            }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all duration-200 text-emerald-400 hover:text-white hover:bg-emerald-600"
            title="Descargar lanzador"
          >
            <Globe size={18} className="shrink-0" />
            {!collapsed && (
              <span className="text-sm font-medium">Abrir Orange</span>
            )}
          </button>
        </div>
      )}

      <div className="p-2 border-t border-[#5d1a7a]">
        <button
          onClick={function () { setShowPassModal(true); setPassForm({ current: '', newPass: '', confirm: '' }); setPassError(''); setPassSuccess('') }}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-[#11ddde] hover:text-white hover:bg-[#5d1a7a] transition-all duration-200"
        >
          <KeyRound size={20} className="shrink-0" />
          {!collapsed && (
            <span className="text-sm font-medium">Cambiar contraseña</span>
          )}
        </button>
      </div>

      <div className="p-2">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-[#11ddde] hover:text-white hover:bg-[#1495e0] transition-all duration-200"
        >
          <LogOut size={20} className="shrink-0" />
          {!collapsed && (
            <span className="text-sm font-medium">Cerrar sesion</span>
          )}
        </button>
      </div>

      { /* Modal cambiar contraseña */ }
      {showPassModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={function () { setShowPassModal(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={function (e) { e.stopPropagation() }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[#1a1030]">Cambiar contraseña</h2>
              <button onClick={function () { setShowPassModal(false) }} className="p-1 rounded hover:bg-[#f0f0f8]"><X size={18} /></button>
            </div>
            {passSuccess ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 mb-4">{passSuccess}</div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[#7c757c] mb-1">Contraseña actual</label>
                  <input type="password" value={passForm.current} onChange={function (e) { setPassForm({ ...passForm, current: e.target.value }) }}
                    className="w-full border border-[#e8dce6] rounded-lg px-3 py-2 text-sm" placeholder="********" />
                </div>
                <div>
                  <label className="block text-xs text-[#7c757c] mb-1">Nueva contraseña</label>
                  <input type="password" value={passForm.newPass} onChange={function (e) { setPassForm({ ...passForm, newPass: e.target.value }) }}
                    className="w-full border border-[#e8dce6] rounded-lg px-3 py-2 text-sm" placeholder="Mínimo 8 caracteres" />
                </div>
                <div>
                  <label className="block text-xs text-[#7c757c] mb-1">Confirmar nueva contraseña</label>
                  <input type="password" value={passForm.confirm} onChange={function (e) { setPassForm({ ...passForm, confirm: e.target.value }) }}
                    className="w-full border border-[#e8dce6] rounded-lg px-3 py-2 text-sm" placeholder="Repite la contraseña" />
                </div>
                {passError && <p className="text-sm text-red-500">{passError}</p>}
                <button onClick={async function () {
                  if (!passForm.current || !passForm.newPass) { setPassError('Completa todos los campos'); return }
                  if (passForm.newPass.length < 8) { setPassError('Mínimo 8 caracteres'); return }
                  if (passForm.newPass !== passForm.confirm) { setPassError('Las contraseñas no coinciden'); return }
                  setPassSaving(true); setPassError('');
                  try {
                    const sessionData = JSON.parse(localStorage.getItem('oratioo_session') || '{}');
                    if (sessionData.email) {
                      const { error: signInError } = await supabase.auth.signInWithPassword({ email: sessionData.email, password: passForm.current });
                      if (signInError) { setPassError('Contraseña actual incorrecta'); setPassSaving(false); return }
                    }
                    const { error: updateError } = await supabase.auth.updateUser({ password: passForm.newPass });
                    if (updateError) { setPassError(updateError.message); setPassSaving(false); return }
                    setPassSuccess('Contraseña actualizada correctamente');
                    setPassForm({ current: '', newPass: '', confirm: '' });
                  } catch (e) { setPassError('Error de conexión') }
                  finally { setPassSaving(false) }
                }} disabled={passSaving}
                  className="w-full bg-[#0a6ea9] hover:bg-[#085d8f] text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 mt-2">
                  {passSaving ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Guardar contraseña'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
