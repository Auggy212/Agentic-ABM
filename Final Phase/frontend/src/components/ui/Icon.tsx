interface IconProps {
  name: string;
  size?: number;
}

export default function Icon({ name, size = 14 }: IconProps) {
  const common = {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor",
    strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "search":    return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case "filter":    return <svg {...common}><path d="M3 5h18M6 12h12M10 19h4"/></svg>;
    case "download":  return <svg {...common}><path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16"/></svg>;
    case "plus":      return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case "more":      return <svg {...common}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>;
    case "chevron":   return <svg {...common}><path d="m9 6 6 6-6 6"/></svg>;
    case "check":     return <svg {...common}><path d="m5 13 4 4L19 7"/></svg>;
    case "x":         return <svg {...common}><path d="M6 6l12 12M18 6 6 18"/></svg>;
    case "star":      return <svg {...common}><path d="m12 3 2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 18l-5.8 3 1.1-6.5L2.6 9.9 9.1 9z"/></svg>;
    case "star-fill": return <svg {...common} fill="currentColor" stroke="none"><path d="m12 3 2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 18l-5.8 3 1.1-6.5L2.6 9.9 9.1 9z"/></svg>;
    case "sparkle":   return <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>;
    case "zap":       return <svg {...common}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>;
    case "bolt":      return <svg {...common} fill="currentColor" stroke="none"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>;
    case "users":     return <svg {...common}><circle cx="9" cy="8" r="3.5"/><path d="M2 20c.5-3.5 3.5-5.5 7-5.5s6.5 2 7 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c2.5.5 4.5 2.3 5 5.5"/></svg>;
    case "target":    return <svg {...common}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>;
    case "list":      return <svg {...common}><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>;
    case "send":      return <svg {...common}><path d="m4 12 16-8-6 18-3-7-7-3z"/></svg>;
    case "activity":  return <svg {...common}><path d="M3 12h4l3-9 4 18 3-9h4"/></svg>;
    case "settings":  return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="m20 12-2-1 1-2-2-2-2 1-1-2h-3l-1 2-2-1-2 2 1 2-2 1v3l2 1-1 2 2 2 2-1 1 2h3l1-2 2 1 2-2-1-2 2-1z"/></svg>;
    case "intake":    return <svg {...common}><path d="M5 4h11l3 3v13H5z"/><path d="M9 12h6M9 16h6M9 8h3"/></svg>;
    case "mail":      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>;
    case "linkedin":  return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 11v6"/></svg>;
    case "globe":     return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>;
    case "trend":     return <svg {...common}><path d="m3 17 6-6 4 4 8-8M14 7h7v7"/></svg>;
    case "money":     return <svg {...common}><path d="M3 6h18v12H3z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "play":      return <svg {...common} fill="currentColor" stroke="none"><path d="M6 4v16l14-8z"/></svg>;
    case "pause":     return <svg {...common}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
    case "warn":      return <svg {...common}><path d="M12 3 2 21h20zM12 9v5M12 18v.01"/></svg>;
    case "ban":       return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="m5 5 14 14"/></svg>;
    case "robot":     return <svg {...common}><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M12 4v3M9 13v.01M15 13v.01M9 17h6"/></svg>;
    case "phone":     return <svg {...common}><path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>;
    default:          return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
  }
}
