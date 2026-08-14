import { useState, useEffect, useReducer } from "react";
import api from "./api/endpoints.js";
import { tokens, restoreSession, setSessionExpiredHandler } from "./api/client.js";
import { useDb } from "./hooks/useDb.js";
import { toLegacyUser } from "./adapters/legacy.js";
import { downloadCsv, downloadJson, stamped } from "./utils/download.js";
import {
  emailError, phoneError, nameError, passwordError, positiveIntError,
} from "./utils/validate.js";

// ═══════════════════════════════════════════════════════════════════
// DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════════════
const T = {
  forest:"#1B4332",green:"#2D6A4F",mint:"#52B788",lightMint:"#D8F3DC",
  gold:"#C9A84C",clay:"#C1440E",ink:"#0F172A",muted:"#64748B",
  border:"#E2E8F0",bg:"#F8FAFC",card:"#FFFFFF",paper:"#F1F5F9",
  success:"#059669",warning:"#D97706",danger:"#DC2626",
  purple:"#7C3AED",blue:"#2563EB",teal:"#0D9488",pink:"#DB2777",
  indigo:"#4F46E5",
};
const G=(a,b,d="135deg")=>`linear-gradient(${d},${a},${b})`;
const css=`
  @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes scaleIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
  @keyframes shimmer{0%,100%{opacity:.6}50%{opacity:1}}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-thumb{background:#E2E8F0;border-radius:99px}
  input,select,textarea{font-family:inherit;}
  button{font-family:inherit;cursor:pointer;}

  /* ── Responsive ──────────────────────────────────────────────────
     Every layout in this app is set with inline styles, which beat normal
     stylesheet rules. These attribute selectors match the inline
     grid-template-columns React writes out, and !important is what lets a
     breakpoint override it. Not elegant, but it fixes the real problem
     without rewriting ~3,000 lines of presentation code.
  */
  html,body{max-width:100%;overflow-x:hidden;}

  /* Tables become their own horizontal scroll region rather than stretching
     the page. display:block is what makes overflow-x apply to a table. */
  @media (max-width:768px){
    table{display:block;overflow-x:auto;white-space:nowrap;max-width:100%;}
    thead,tbody{width:max-content;min-width:100%;}
  }

  /* 1024px laptops still overflowed with a fixed side column, so the
     asymmetric two-pane layouts collapse here rather than at 900px. */
  @media (max-width:1100px){
    /* 4-up KPI rows become 2-up before collapsing entirely. */
    [style*="repeat(4,1fr)"],[style*="repeat(4, 1fr)"]{grid-template-columns:repeat(2,1fr)!important;}
    [style*="repeat(6,1fr)"],[style*="repeat(6, 1fr)"]{grid-template-columns:repeat(3,1fr)!important;}

    /* Content + fixed side rail (dashboards, fees, messages) stacks. */
    [style*="280px 1fr"],[style*="1fr 280px"],
    [style*="300px 1fr"],[style*="1fr 300px"],
    [style*="320px 1fr"],[style*="1fr 320px"],
    [style*="340px 1fr"],[style*="1fr 340px"],
    [style*="360px 1fr"],[style*="1fr 360px"],
    [style*="2fr 1fr"],[style*="1fr 2fr"]{grid-template-columns:1fr!important;}
  }

  @media (max-width:900px){
    [style*="grid-template-columns: 1fr 1fr"],
    [style*="grid-template-columns:1fr 1fr"]{grid-template-columns:1fr!important;}
    [style*="repeat(3,1fr)"],[style*="repeat(3, 1fr)"]{grid-template-columns:repeat(2,1fr)!important;}
  }

  @media (max-width:640px){
    /* Everything single-column on a phone. */
    [style*="grid-template-columns"]{grid-template-columns:1fr!important;}
    /* Fixed-height panes (message inbox) would trap content on mobile. */
    [style*="height:520px"],[style*="height: 520px"]{height:auto!important;}
    main{padding:18px 14px!important;}
    /* Long headings shouldn't force the page wide. */
    h1{font-size:26px!important;line-height:1.2!important;}
    /* Modals need room to breathe. */
    [role="dialog"],[data-modal]{width:calc(100vw - 24px)!important;max-width:none!important;}
  }

  /* Anything genuinely wider than the screen scrolls itself instead of
     stretching the document. */
  .ec-scroll-x{overflow-x:auto;-webkit-overflow-scrolling:touch;}

  /* Landing navbar. The 64px side padding is most of a phone's width, so it
     tightens up and the row is allowed to wrap onto a second line rather than
     pushing its buttons off the edge. */
  @media (max-width:820px){
    .ec-topnav{padding:12px 18px!important;gap:12px!important;}
  }
  @media (max-width:520px){
    .ec-topnav{padding:12px 14px!important;gap:10px!important;justify-content:center;}
    .ec-topnav > div:first-child{margin-right:0!important;width:100%;}
  }
`;

// ═══════════════════════════════════════════════════════════════════
// GLOBAL STATE / DATABASE
// ═══════════════════════════════════════════════════════════════════
const PLANS = [
  {id:"starter", name:"Starter",  price:4999,  maxStudents:200,  color:T.blue,
   features:["Up to 200 students","Basic analytics","Email support","Parent & Teacher portal","Attendance tracking","Fee management"]},
  {id:"growth",  name:"Growth",   price:12999, maxStudents:800,  color:T.forest, popular:true,
   features:["Up to 800 students","AI-powered insights","Priority support","All portals","Advanced fee management","SMS alerts","Reports & exports"]},
  {id:"elite",   name:"Elite",    price:29999, maxStudents:9999, color:T.purple,
   features:["Unlimited students","Full AI suite","Dedicated account manager","All portals","Custom branding","API access","Multi-branch","White-label option"]},
];

// Seed data used to live here. It now comes from the API:
//   src/api/endpoints.js  — the HTTP calls
//   src/adapters/legacy.js — maps API responses into the shapes below
//   src/hooks/useDb.js     — assembles the `db` object each portal receives

// ═══════════════════════════════════════════════════════════════════
// HELPERS & ATOMS
// ═══════════════════════════════════════════════════════════════════
const ini = n => n.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
/**
 * Time-appropriate greeting. The dashboards said "Good morning" at every hour
 * of the day, which reads as broken to anyone using the app after lunch.
 * Boundaries follow ordinary usage: morning to 12, afternoon to 17, then evening.
 */
const greeting = (d = new Date()) => {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const pct = (a,b) => Math.round(a/b*100);
const gc  = g => g==="A+"||g==="A"?T.success:g==="A−"||g==="B+"?T.warning:T.danger;
const sc  = n => ({Mathematics:T.purple,"Computer Sc.":T.forest,Urdu:T.green,English:T.blue,Physics:T.gold,Chemistry:T.clay,Biology:T.teal,"Pak. Studies":T.pink}[n]||T.muted);
const catC= c => ({Academic:T.blue,Finance:T.warning,Event:T.purple,General:T.muted}[c]||T.muted);

const Av=({name,size=36,bg=T.forest,color="#fff",fs=13,style={}})=>(
  <div style={{width:size,height:size,borderRadius:"50%",background:bg,color,fontSize:fs,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,letterSpacing:.3,...style}}>{ini(name)}</div>
);
const Bdg=({label,color,bg,style={}})=>(
  <span style={{display:"inline-flex",alignItems:"center",padding:"2px 10px",borderRadius:99,fontSize:11,fontWeight:600,color,background:bg,whiteSpace:"nowrap",...style}}>{label}</span>
);
const Crd=({children,style={},onClick})=>(
  <div onClick={onClick} style={{background:T.card,borderRadius:18,border:`1px solid ${T.border}`,boxShadow:"0 2px 12px rgba(15,23,42,.06)",...style,cursor:onClick?"pointer":undefined}}>{children}</div>
);
/**
 * `style` dresses the wrapper (grid placement, spacing); every other extra prop
 * — maxLength, min, max, step — is forwarded to the input. They used to be
 * swallowed here, so `maxLength={11}` on the phone fields and `min="1"` on the
 * numeric ones were silently doing nothing at all.
 */
const Inp=({label,type="text",value,onChange,placeholder,style={},...rest})=>(
  <div style={{marginBottom:14,...style}}>
    {label&&<div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:".6px"}}>{label}</div>}
    {/* Controlled only when a handler is supplied — passing `value` without
        `onChange` would freeze the field and make it silently read-only. */}
    <input type={type} {...(onChange?{value:value??"",onChange}:{defaultValue:value??""})} placeholder={placeholder} {...rest}
      style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,outline:"none",transition:"border-color .15s"}}
      onFocus={e=>e.target.style.borderColor=T.forest} onBlur={e=>e.target.style.borderColor=T.border}/>
  </div>
);
const Sel=({label,options,value,onChange,style={}})=>(
  <div style={{marginBottom:14,...style}}>
    {label&&<div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:".6px"}}>{label}</div>}
    <select {...(onChange?{value:value??"",onChange}:{defaultValue:value??""})} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,outline:"none"}}>
      {options.map(o=><option key={o.v||o} value={o.v||o}>{o.l||o}</option>)}
    </select>
  </div>
);
const Btn=({children,onClick,color=T.forest,text="#fff",style={},out,full,disabled})=>(
  <button onClick={onClick} disabled={disabled}
    style={{background:out?"transparent":disabled?"#E2E8F0":color,color:out?color:disabled?T.muted:text,
      border:out?`1.5px solid ${color}`:"none",borderRadius:10,padding:"10px 22px",fontSize:13,fontWeight:600,
      width:full?"100%":undefined,textAlign:full?"center":undefined,...style,
      opacity:disabled?.6:1,transition:"all .15s"}}>
    {children}
  </button>
);
const KPI=({label,value,color,icon,sub})=>(
  <Crd style={{padding:"20px 22px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:6}}>{label}</div>
        <div style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:800,color,lineHeight:1}}>{value}</div>
        {sub&&<div style={{fontSize:11,color:T.muted,marginTop:5}}>{sub}</div>}
      </div>
      <div style={{fontSize:26,color,opacity:.3,lineHeight:1}}>{icon}</div>
    </div>
  </Crd>
);
const Bar=({val,color=T.forest,h=5,delay=0})=>{
  const[w,setW]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setW(val),80+delay);return()=>clearTimeout(t)},[val]);
  return <div style={{height:h,background:T.border,borderRadius:99,overflow:"hidden"}}>
    <div style={{height:"100%",width:`${w}%`,background:color,borderRadius:99,transition:"width 1.1s cubic-bezier(.4,0,.2,1)"}}/>
  </div>;
};
const Donut=({p,color=T.forest,size=80,sw=9})=>{
  const r=size/2-sw/2,circ=2*Math.PI*r;
  return <svg width={size} height={size}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.border} strokeWidth={sw}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw}
      strokeDasharray={circ} strokeDashoffset={circ*(1-p/100)} strokeLinecap="round"
      transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:"stroke-dashoffset 1.3s"}}/>
    <text x={size/2} y={size/2+5} textAnchor="middle" fontSize={14} fontWeight={700} fill={T.ink}>{p}%</text>
  </svg>;
};
const Modal=({title,onClose,children,width=500})=>(
  <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn .2s"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:T.card,borderRadius:22,width,maxWidth:"94vw",maxHeight:"88vh",overflowY:"auto",boxShadow:"0 32px 80px rgba(0,0,0,.28)",animation:"scaleIn .2s"}}>
      <div style={{padding:"24px 28px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:T.ink}}>{title}</div>
        <span onClick={onClose} style={{cursor:"pointer",color:T.muted,fontSize:24,lineHeight:1,fontWeight:300}}>×</span>
      </div>
      <div style={{padding:"18px 28px 28px"}}>{children}</div>
    </div>
  </div>
);
const SecHead=({pre,title,action})=>(
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:24,animation:"fadeUp .35s ease"}}>
    <div>
      <div style={{fontSize:10,fontWeight:700,color:T.muted,letterSpacing:"1.8px",textTransform:"uppercase",marginBottom:5}}>{pre}</div>
      <h1 style={{fontFamily:"Georgia,serif",fontSize:32,fontWeight:800,color:T.ink,lineHeight:1.1}}>{title}</h1>
    </div>
    {action}
  </div>
);
const AttBadge=({s})=>{
  const c=s==="present"?T.success:s==="absent"?T.danger:T.warning;
  return <Bdg label={s} color={c} bg={`${c}18`}/>;
};
const Toggle=({on})=>(
  <div style={{width:44,height:24,borderRadius:99,background:on?T.forest:T.border,position:"relative",cursor:"pointer",transition:"background .2s",flexShrink:0}}>
    <div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:on?23:3,transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/>
  </div>
);

// ═══════════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════════
const Sidebar=({nav,tab,setTab,user,inst,collapsed,setCollapsed,onLogout,lockCollapsed=false})=>{
  const ic=inst||{name:"EduConnect HQ",logo:"✦",color:T.ink};
  return(
    <aside style={{width:collapsed?64:236,background:T.card,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0,transition:"width .25s cubic-bezier(.4,0,.2,1)",overflow:"hidden",position:"sticky",top:0,height:"100vh",zIndex:50}}>
      {/* Logo */}
      <div style={{padding:"18px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:10,minWidth:236}}>
        <div style={{width:36,height:36,borderRadius:11,background:ic.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:15,color:"#fff",boxShadow:`0 4px 12px ${ic.color}44`}}>{ic.logo}</div>
        {!collapsed&&<div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:800,color:T.ink,fontFamily:"Georgia,serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ic.name}</div>
          <div style={{fontSize:9,color:T.muted,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase"}}>{user.role==="superadmin"?"Platform Admin":user.role==="admin"?"Admin Portal":user.role==="teacher"?"Teacher Portal":"Parent Portal"}</div>
        </div>}
        {/* Hidden on narrow screens, where the sidebar is locked to icons —
            a toggle that can't change anything would be a dead control. */}
        {!lockCollapsed&&<div onClick={()=>setCollapsed(c=>!c)} style={{cursor:"pointer",color:T.muted,fontSize:20,flexShrink:0,lineHeight:1,marginLeft:"auto",userSelect:"none"}}>{collapsed?"›":"‹"}</div>}
      </div>
      {/* User pill */}
      {!collapsed&&<div style={{margin:"12px 10px",background:G(ic.color,T.green),borderRadius:13,padding:"14px 16px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,.08)"}}/>
        <Av name={user.name} size={34} bg="rgba(255,255,255,.2)" fs={12}/>
        <div style={{fontSize:13,fontWeight:700,color:"#fff",marginTop:8,lineHeight:1.2}}>{user.name}</div>
        <div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginTop:2,textTransform:"capitalize"}}>{user.role}</div>
      </div>}
      {collapsed&&<div style={{padding:"10px 14px"}}><Av name={user.name} size={36} bg={ic.color}/></div>}
      {/* Nav */}
      <nav style={{flex:1,padding:"4px 8px",overflowY:"auto"}}>
        {!collapsed&&<div style={{fontSize:9,color:T.muted,fontWeight:700,letterSpacing:"1.5px",padding:"6px 10px 8px",textTransform:"uppercase"}}>Navigation</div>}
        {nav.map(n=>(
          <div key={n.id} onClick={()=>setTab(n.id)} title={collapsed?n.label:undefined}
            style={{display:"flex",alignItems:"center",gap:10,padding:collapsed?"13px 16px":"10px 12px",borderRadius:11,marginBottom:2,cursor:"pointer",
              background:tab===n.id?ic.color:"transparent",color:tab===n.id?"#fff":T.ink,transition:"all .15s",whiteSpace:"nowrap",userSelect:"none"}}>
            <span style={{fontSize:16,color:tab===n.id?"#fff":T.muted,flexShrink:0,lineHeight:1}}>{n.icon}</span>
            {!collapsed&&<>
              <span style={{fontSize:13,fontWeight:tab===n.id?600:400,flex:1}}>{n.label}</span>
              {n.badge>0&&tab!==n.id&&<span style={{background:`${T.clay}20`,color:T.clay,borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{n.badge}</span>}
            </>}
          </div>
        ))}
      </nav>
      {/* Logout */}
      <div style={{padding:"10px 10px 14px",borderTop:`1px solid ${T.border}`}}>
        <div onClick={onLogout} style={{display:"flex",alignItems:"center",gap:10,padding:collapsed?"12px 16px":"10px 12px",borderRadius:11,cursor:"pointer",color:T.danger,transition:"all .15s",whiteSpace:"nowrap"}}>
          <span style={{fontSize:15,flexShrink:0}}>⏻</span>
          {!collapsed&&<span style={{fontSize:13,fontWeight:500}}>Logout</span>}
        </div>
      </div>
    </aside>
  );
};

/**
 * Tracks a media query. Used to collapse the sidebar on narrow screens —
 * CSS alone can't do it, because the sidebar hides its labels based on the
 * `collapsed` prop rather than on width.
 */
const useMediaQuery=(query)=>{
  const[matches,setMatches]=useState(()=>typeof window!=="undefined"&&window.matchMedia(query).matches);
  useEffect(()=>{
    const mq=window.matchMedia(query);
    const onChange=e=>setMatches(e.matches);
    mq.addEventListener("change",onChange);
    setMatches(mq.matches);
    return()=>mq.removeEventListener("change",onChange);
  },[query]);
  return matches;
};

/**
 * Keeps the active tab in the URL hash, so the browser's own Back and Forward
 * buttons move between screens, a refresh stays where you were, and a tab can
 * be linked to.
 *
 * The app has no router — each portal drives its screens from a single `tab`
 * state value. Rather than restructure four portals around react-router, this
 * syncs that one value both ways: hash → state on load and on popstate,
 * state → hash on navigation. An unrecognised hash falls back to the portal's
 * default, which is also what happens when you sign in as a different role
 * while an old hash is still in the address bar.
 */
const useHashTab=(fallback,valid)=>{
  const rawHash=()=>window.location.hash.replace(/^#\/?/,"").split("?")[0];
  const read=()=>{
    const id=rawHash();
    return valid.includes(id)?id:fallback;
  };

  const[tab,setTabState]=useState(read);

  // Normalise whatever is in the bar on arrival, so the first Back press has a
  // real entry to return to instead of leaving the app.
  useEffect(()=>{
    window.history.replaceState({tab},"",`#/${tab}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    // Resolve the hash, and rewrite it when it named a screen this portal
    // doesn't have — otherwise the address bar would keep advertising a tab
    // the user isn't actually looking at.
    const sync=()=>{
      const next=read();
      if(rawHash()!==next)window.history.replaceState({tab:next},"",`#/${next}`);
      setTabState(next);
    };
    window.addEventListener("popstate",sync);
    window.addEventListener("hashchange",sync);
    return()=>{
      window.removeEventListener("popstate",sync);
      window.removeEventListener("hashchange",sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[valid.join(",")]);

  const setTab=(next)=>{
    if(next===tab)return;
    window.history.pushState({tab:next},"",`#/${next}`);
    setTabState(next);
  };

  return[tab,setTab];
};

const Shell=({nav,tab,setTab,user,inst,collapsed,setCollapsed,onLogout,children})=>{
  const narrow=useMediaQuery("(max-width: 900px)");
  // Below 900px the sidebar is always icons-only, so content keeps its room.
  const isCollapsed=collapsed||narrow;

  return(
    <div style={{display:"flex",minHeight:"100vh",background:T.bg,maxWidth:"100vw",overflowX:"hidden"}}>
      <style>{css}</style>
      <Sidebar nav={nav} tab={tab} setTab={setTab} user={user} inst={inst}
        collapsed={isCollapsed} setCollapsed={narrow?()=>{}:setCollapsed} onLogout={onLogout} lockCollapsed={narrow}/>
      <main style={{flex:1,padding:"28px 34px",overflowY:"auto",minWidth:0,maxWidth:"100%",animation:"fadeUp .38s ease"}}>{children}</main>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════════════════════════════
/**
 * Demo logins offered on the landing page. These are the seeded accounts from
 * backend/prisma/seed.js — if that changes, change this too.
 */
const DEMO_ACCOUNTS=[
  {role:"🔑 Super Admin",     email:"sa@educonnect.io", pass:"super123",  desc:"Full platform control — all institutes, revenue, users"},
  {role:"🏫 Institute Admin", email:"admin@bhs.edu",    pass:"admin123",  desc:"Manage Beaconhouse — students, teachers, parents, fees"},
  {role:"📖 Teacher",         email:"hassan@bhs.edu",   pass:"teach123",  desc:"Mr. Hassan — Mathematics classes, gradebook, attendance"},
  {role:"👨‍👩‍👦 Parent",        email:"sara@gmail.com",   pass:"parent123", desc:"Sara Ahmed — Zain's grades, attendance, messages, fees"},
];

const Landing=({onLogin,onSignup,onDemoLogin})=>{
  const [demoOpen,setDemoOpen]=useState(false);
  const [demoBusy,setDemoBusy]=useState("");
  const [demoErr,setDemoErr]=useState("");

  /**
   * One-click demo sign-in. This previously only displayed credentials for the
   * visitor to copy, so the button led to a dead end. It now authenticates
   * against the real API — same endpoint, same session, no shortcuts.
   */
  const tryDemo=async(email,pass)=>{
    setDemoBusy(email);setDemoErr("");
    try{
      const user=await api.auth.login(email,pass);
      onDemoLogin(toLegacyUser(user));
    }catch(e){
      setDemoErr(
        e.status===401
          ? "The demo accounts aren't in this database yet. Run `npm run db:seed` in the backend, then try again."
          : e.message||"Couldn't sign in to the demo account."
      );
      setDemoBusy("");
    }
  };
  const feats=[
    {ic:"◈",t:"Role-Based Portals",d:"Separate, tailored dashboards for Super Admin, Institute Admin, Teachers, and Parents — every role sees exactly what they need.",c:T.purple},
    {ic:"✦",t:"AI-Powered Insights",d:"Predict student performance, detect at-risk students early, and generate personalized study recommendations automatically.",c:T.gold},
    {ic:"◷",t:"Attendance Tracking",d:"Daily attendance with pattern analysis, late-arrival detection, and automated parent notifications via email and SMS.",c:T.blue},
    {ic:"◑",t:"Fee Management",d:"Online payments, automated reminders, payment history, fee structure management, and defaulter reports.",c:T.success},
    {ic:"◎",t:"Communication Hub",d:"Real-time direct messaging between teachers, parents, and administration with read receipts and notifications.",c:T.teal},
    {ic:"▦",t:"Timetable & Reports",d:"Subject-wise timetable management, class scheduling, and downloadable academic, attendance, and financial reports.",c:T.clay},
  ];
  return(
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <style>{css}</style>
      {/* Navbar */}
      {/* flexWrap + the .ec-topnav breakpoint keep the two CTAs on screen: at
          390px the 64px side padding left only 262px for the logo, the links
          and both buttons, so "Sign In" was half cut off and "Get Started
          Free" sat entirely outside the viewport — invisible and unclickable,
          hidden rather than revealed by the page's overflow-x:hidden. */}
      <nav className="ec-topnav" style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:"14px 64px",display:"flex",alignItems:"center",gap:20,flexWrap:"wrap",position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 12px rgba(0,0,0,.04)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginRight:"auto"}}>
          <div style={{width:36,height:36,borderRadius:10,background:T.forest,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 12px ${T.forest}55`}}><span style={{color:"#fff",fontSize:16}}>✦</span></div>
          <div><div style={{fontSize:16,fontWeight:800,color:T.ink,fontFamily:"Georgia,serif"}}>EduConnect</div><div style={{fontSize:9,color:T.muted,fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase"}}>SaaS Platform</div></div>
        </div>
        {/* Only the two links that have somewhere to go. "About" and "Contact"
            were here too, styled as clickable but bound to nothing — there are
            no such sections or pages on this site. */}
        {[["Features","ec-features"],["Pricing","ec-pricing"]].map(([l,id])=>(
          <span key={l} onClick={()=>document.getElementById(id)?.scrollIntoView({behavior:"smooth"})}
            style={{fontSize:13,color:T.muted,cursor:"pointer",fontWeight:500,transition:"color .15s"}}>{l}</span>
        ))}
        <Btn onClick={onLogin} out color={T.forest} style={{padding:"8px 18px",marginLeft:6}}>Sign In</Btn>
        <Btn onClick={onSignup} style={{padding:"8px 20px",background:T.forest}}>Get Started Free</Btn>
      </nav>
      {/* Hero */}
      <div style={{background:G(T.forest,"#0C2A1C","160deg"),padding:"96px 64px 88px",textAlign:"center",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:"10%",left:"5%",width:300,height:300,borderRadius:"50%",background:"rgba(82,183,136,.08)",filter:"blur(60px)"}}/>
        <div style={{position:"absolute",bottom:"0%",right:"5%",width:400,height:400,borderRadius:"50%",background:"rgba(201,168,76,.06)",filter:"blur(80px)"}}/>
        <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(82,183,136,.15)",border:"1px solid rgba(82,183,136,.3)",borderRadius:99,padding:"6px 18px",marginBottom:28}}>
          <span style={{color:T.mint,fontSize:12}}>✦</span><span style={{fontSize:12,color:"rgba(255,255,255,.75)",fontWeight:600}}>Trusted by 500+ schools across Pakistan</span>
        </div>
        <h1 style={{fontFamily:"Georgia,serif",fontSize:60,fontWeight:900,color:"#fff",lineHeight:1.08,maxWidth:760,margin:"0 auto 22px",animation:"fadeUp .6s ease"}}>
          One Platform.<br/><em style={{color:T.mint,fontStyle:"italic"}}>Every School. Every Role.</em>
        </h1>
        <p style={{fontSize:18,color:"rgba(255,255,255,.6)",maxWidth:580,margin:"0 auto 40px",lineHeight:1.8}}>AI-powered analytics, real-time parent communication, attendance tracking, fee management — all in one beautifully designed platform.</p>
        <div style={{display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap",marginBottom:64}}>
          <Btn onClick={onSignup} color={T.mint} text={T.forest} style={{padding:"15px 36px",fontSize:15,fontWeight:700,borderRadius:12,boxShadow:`0 8px 32px ${T.mint}44`}}>Start 14-Day Free Trial →</Btn>
          <Btn onClick={()=>setDemoOpen(true)} out color="rgba(255,255,255,.5)" style={{padding:"15px 36px",fontSize:15,color:"rgba(255,255,255,.8)",borderRadius:12}}>Try Demo Account</Btn>
        </div>
        <div style={{display:"flex",gap:52,justifyContent:"center",flexWrap:"wrap"}}>
          {[["500+","Schools"],["2.4M+","Students"],["99.9%","Uptime"],["4.9★","Rating"]].map(([v,l])=>(
            <div key={l} style={{textAlign:"center"}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:36,fontWeight:800,color:"#fff"}}>{v}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.45)",marginTop:4,fontWeight:600,letterSpacing:".5px",textTransform:"uppercase"}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Features */}
      <div id="ec-features" style={{padding:"88px 64px",maxWidth:1280,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:52}}>
          <div style={{fontSize:11,color:T.muted,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",marginBottom:12}}>Why EduConnect</div>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:42,fontWeight:800,color:T.ink}}>Everything your school needs</h2>
          <p style={{fontSize:16,color:T.muted,marginTop:12,maxWidth:520,margin:"12px auto 0"}}>From a single campus to a city-wide network — EduConnect scales with you.</p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:22}}>
          {feats.map(f=>(
            <Crd key={f.t} style={{padding:"28px",transition:"transform .2s,box-shadow .2s",cursor:"default"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 12px 36px rgba(0,0,0,.1)`;}}
              onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
              <div style={{width:48,height:48,borderRadius:14,background:`${f.c}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:f.c,marginBottom:16}}>{f.ic}</div>
              <div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:700,color:T.ink,marginBottom:10}}>{f.t}</div>
              <p style={{fontSize:13,color:T.muted,lineHeight:1.75}}>{f.d}</p>
            </Crd>
          ))}
        </div>
      </div>
      {/* Pricing */}
      <div id="ec-pricing" style={{background:T.paper,padding:"88px 64px"}}>
        <div style={{textAlign:"center",marginBottom:52}}>
          <div style={{fontSize:11,color:T.muted,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",marginBottom:12}}>Pricing Plans</div>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:42,fontWeight:800,color:T.ink}}>Simple, transparent pricing</h2>
          <p style={{fontSize:16,color:T.muted,marginTop:12}}>Per school, per month. No hidden fees. Cancel anytime.</p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:22,maxWidth:1020,margin:"0 auto"}}>
          {PLANS.map(pl=>(
            <div key={pl.id} style={{background:pl.popular?G(T.forest,"#0C2A1C"):T.card,borderRadius:22,padding:"34px",border:pl.popular?`2px solid ${T.mint}`:`1px solid ${T.border}`,position:"relative",boxShadow:pl.popular?"0 24px 64px rgba(27,67,50,.35)":"0 2px 12px rgba(0,0,0,.05)",transition:"transform .2s"}}
              onMouseEnter={e=>!pl.popular&&(e.currentTarget.style.transform="translateY(-4px)")}
              onMouseLeave={e=>!pl.popular&&(e.currentTarget.style.transform="")}>
              {pl.popular&&<div style={{position:"absolute",top:-15,left:"50%",transform:"translateX(-50%)",background:T.mint,color:T.forest,borderRadius:99,padding:"4px 18px",fontSize:12,fontWeight:700,whiteSpace:"nowrap",boxShadow:`0 4px 12px ${T.mint}44`}}>⭐ Most Popular</div>}
              <div style={{fontSize:12,fontWeight:700,color:pl.popular?"rgba(255,255,255,.55)":T.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:8}}>{pl.name}</div>
              <div style={{fontFamily:"Georgia,serif",fontSize:40,fontWeight:800,color:pl.popular?"#fff":T.ink}}>Rs. {pl.price.toLocaleString()}<span style={{fontSize:14,fontWeight:400,color:pl.popular?"rgba(255,255,255,.45)":T.muted}}>/mo</span></div>
              <div style={{fontSize:12,color:pl.popular?"rgba(255,255,255,.4)":T.muted,margin:"6px 0 26px"}}>Up to {pl.maxStudents===9999?"unlimited":pl.maxStudents.toLocaleString()} students</div>
              {pl.features.map(f=><div key={f} style={{display:"flex",gap:9,alignItems:"flex-start",marginBottom:11}}>
                <span style={{color:pl.popular?T.mint:T.success,fontSize:14,flexShrink:0,marginTop:1}}>✓</span>
                <span style={{fontSize:13,color:pl.popular?"rgba(255,255,255,.75)":T.muted,lineHeight:1.4}}>{f}</span>
              </div>)}
              <Btn onClick={onSignup} color={pl.popular?T.mint:T.forest} text={pl.popular?T.forest:"#fff"} full style={{marginTop:22,borderRadius:11,padding:"12px"}}>{pl.popular?"Get Started — Free Trial":"Get Started"}</Btn>
            </div>
          ))}
        </div>
      </div>
      {/* CTA */}
      <div style={{padding:"80px 64px",textAlign:"center",background:G(T.forest,"#0C2A1C")}}>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:40,fontWeight:800,color:"#fff",marginBottom:16}}>Ready to transform your school?</h2>
        <p style={{fontSize:16,color:"rgba(255,255,255,.55)",marginBottom:36}}>Join 500+ schools already managing smarter with EduConnect.</p>
        <Btn onClick={onSignup} color={T.mint} text={T.forest} style={{padding:"16px 40px",fontSize:16,fontWeight:700,borderRadius:12}}>Register Your School Now →</Btn>
      </div>
      {/* Footer */}
      <div style={{background:T.ink,padding:"36px 64px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,borderRadius:8,background:T.forest,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#fff",fontSize:12}}>✦</span></div>
          <span style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:"Georgia,serif"}}>EduConnect</span>
        </div>
        <span style={{fontSize:12,color:"rgba(255,255,255,.3)"}}>© 2026 EduConnect. All rights reserved. Made with ❤️ in Pakistan 🇵🇰</span>
        {/* Was "Privacy · Terms · Support" rendered as links to pages that
            don't exist. Shown as plain text until there is something behind them. */}
        <span style={{fontSize:12,color:"rgba(255,255,255,.3)"}}>Final-year project · not a commercial service</span>
      </div>
      {demoOpen&&<Modal title="Try a Demo Account" onClose={()=>{setDemoOpen(false);setDemoErr("");}} width={470}>
        <p style={{fontSize:13,color:T.muted,marginBottom:18,lineHeight:1.7}}>
          Pick a role to sign in instantly — no typing. Each portal shows a different permission level against the same live data.
        </p>
        {DEMO_ACCOUNTS.map(({role,email,pass,desc})=>(
          <div key={role} style={{padding:"14px",background:T.paper,borderRadius:12,marginBottom:10,border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:T.forest,marginBottom:3}}>{role}</div>
                <div style={{fontSize:11.5,color:T.muted,lineHeight:1.5}}>{desc}</div>
                <div style={{fontSize:11,color:T.muted,marginTop:5,opacity:.8}}>{email} · {pass}</div>
              </div>
              <Btn onClick={()=>tryDemo(email,pass)} style={{padding:"9px 15px",fontSize:12,flexShrink:0}} disabled={Boolean(demoBusy)}>
                {demoBusy===email?"Signing in…":"Sign in"}
              </Btn>
            </div>
          </div>
        ))}
        {demoErr&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:12.5,marginTop:4,marginBottom:10,border:`1px solid ${T.danger}30`,lineHeight:1.6}}>{demoErr}</div>}
        <Btn onClick={onLogin} out color={T.muted} full style={{marginTop:6}}>Or sign in manually →</Btn>
      </Modal>}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════
const Login=({onLogin,onBack,onSignup})=>{
  const[email,setEmail]=useState("");
  const[pass,setPass]=useState("");
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);
  const submit=async()=>{
    if(!email||!pass){setErr("Please fill all fields.");return;}
    setLoading(true);setErr("");
    try{
      const user=await api.auth.login(email,pass);
      onLogin(toLegacyUser(user));
    }catch(e){
      setErr(e.message||"Sign in failed. Please try again.");
      setLoading(false);
    }
  };
  return(
    <div style={{minHeight:"100vh",background:G(T.forest,"#0C2A1C","160deg"),display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",padding:20}}>
      <style>{css}</style>
      <div style={{width:440,background:T.card,borderRadius:24,padding:"40px",boxShadow:"0 32px 80px rgba(0,0,0,.3)",animation:"scaleIn .3s ease"}}>
        <div style={{textAlign:"center",marginBottom:30}}>
          <div style={{width:52,height:52,borderRadius:15,background:T.forest,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,color:"#fff",margin:"0 auto 16px",boxShadow:`0 8px 24px ${T.forest}55`}}>✦</div>
          <div style={{fontFamily:"Georgia,serif",fontSize:26,fontWeight:800,color:T.ink}}>Welcome back</div>
          <div style={{fontSize:13,color:T.muted,marginTop:4}}>Sign in to EduConnect</div>
        </div>
        <Inp label="Email Address" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" type="email"/>
        <Inp label="Password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" type="password"/>
        {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:14,border:`1px solid ${T.danger}30`}}>{err}</div>}
        <Btn onClick={submit} full disabled={loading} style={{padding:"12px",fontSize:14,borderRadius:11,marginBottom:16}}>{loading?"Signing in…":"Sign In →"}</Btn>
        <div style={{textAlign:"center",fontSize:13,color:T.muted,marginBottom:20}}>No account? <span onClick={onSignup} style={{color:T.green,cursor:"pointer",fontWeight:700}}>Register your school</span></div>
        <div style={{background:T.paper,borderRadius:14,padding:"16px",border:`1px solid ${T.border}`}}>
          <div style={{fontSize:10,fontWeight:700,color:T.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:".5px"}}>⚡ Quick Login (Demo)</div>
          {[["Super Admin","sa@educonnect.io","super123",T.ink],["Institute Admin","admin@bhs.edu","admin123",T.forest],["Teacher","hassan@bhs.edu","teach123",T.purple],["Parent","sara@gmail.com","parent123",T.blue]].map(([r,e,p,c])=>(
            <div key={r} onClick={()=>{setEmail(e);setPass(p);}} style={{fontSize:12,color:c,cursor:"pointer",marginBottom:5,fontWeight:600,padding:"5px 8px",borderRadius:7,transition:"background .1s"}}
              onMouseEnter={ev=>ev.currentTarget.style.background=`${c}12`}
              onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>→ {r}: {e}</div>
          ))}
        </div>
        <div style={{textAlign:"center",marginTop:18}}><span onClick={onBack} style={{fontSize:12,color:T.muted,cursor:"pointer"}}>← Back to homepage</span></div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// SIGNUP (INSTITUTE REGISTRATION)
// ═══════════════════════════════════════════════════════════════════
const Signup=({onBack,onLogin})=>{
  const[step,setStep]=useState(1);
  const[plan,setPlan]=useState("");
  const[done,setDone]=useState(false);
  const[f,setF]=useState({name:"",city:"",phone:"",email:"",students:"",adminName:"",adminEmail:"",adminPass:"",adminPhone:""});
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const[submitting,setSubmitting]=useState(false);
  const[err,setErr]=useState("");

  /**
   * Shared with the server rules in utils/validate.js. The API re-validates
   * everything — this is for immediate, specific feedback, and errors only
   * appear once a field has been touched.
   */
  const studentsErr   = f.students   ? positiveIntError(f.students,"Student limit") : "";
  const emailErr      = f.email      ? emailError(f.email,{label:"Official email"}) : "";
  const phoneErr      = f.phone      ? phoneError(f.phone,{label:"Contact phone"}) : "";
  const adminEmailErr = f.adminEmail ? emailError(f.adminEmail,{label:"Admin email"}) : "";
  const adminPhoneErr = f.adminPhone ? phoneError(f.adminPhone,{label:"Admin phone"}) : "";
  const passErr       = f.adminPass  ? passwordError(f.adminPass) : "";
  const nameErr       = f.name       ? nameError(f.name,"School name") : "";

  const step1Ok =
    !nameError(f.name,"School name") && f.city.trim() &&
    !emailError(f.email) && !phoneError(f.phone) && !positiveIntError(f.students,"Student limit");

  const step3Ok =
    !nameError(f.adminName,"Admin name") && !emailError(f.adminEmail) &&
    !passwordError(f.adminPass) && !phoneError(f.adminPhone,{required:false});

  const register=async()=>{
    setSubmitting(true);setErr("");
    try{
      await api.auth.signup({
        name:f.name, city:f.city, phone:f.phone, email:f.email,
        ...(f.students&&{approxStudents:Number(f.students),studentLimit:Number(f.students)}),
        planId:plan,
        adminName:f.adminName, adminEmail:f.adminEmail,
        ...(f.adminPhone&&{adminPhone:f.adminPhone}),
        adminPassword:f.adminPass,
      });
      setDone(true);
    }catch(e){
      // Zod sends a per-field list; surface the first one, it's the actionable bit.
      setErr(e.errors?.[0]?.message||e.message||"Registration failed. Please try again.");
    }finally{
      setSubmitting(false);
    }
  };
  const selPlan=PLANS.find(p=>p.id===plan);

  return(
    <div style={{minHeight:"100vh",background:G(T.forest,"#0C2A1C","160deg"),padding:"40px 20px",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",overflowY:"auto"}}>
      <style>{css}</style>
      <div style={{maxWidth:680,margin:"0 auto"}}>
        {/* Brand */}
        <div style={{textAlign:"center",marginBottom:30}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:10,marginBottom:6}}>
            <div style={{width:38,height:38,borderRadius:11,background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>✦</div>
            <span style={{fontFamily:"Georgia,serif",fontSize:22,fontWeight:800,color:"#fff"}}>EduConnect</span>
          </div>
          <div style={{fontSize:14,color:"rgba(255,255,255,.45)"}}>Institute Registration</div>
        </div>
        {/* Steps */}
        {!done&&<div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:6,marginBottom:28}}>
          {[1,2,3].map(n=><div key={n} style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:34,height:34,borderRadius:"50%",background:step>=n?T.mint:"rgba(255,255,255,.15)",color:step>=n?T.forest:"rgba(255,255,255,.4)",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s"}}>{step>n?"✓":n}</div>
            {n<3&&<div style={{width:44,height:2,background:step>n?T.mint:"rgba(255,255,255,.15)",transition:"background .3s",borderRadius:99}}/>}
          </div>)}
        </div>}

        <Crd style={{borderRadius:24,padding:"38px",boxShadow:"0 32px 80px rgba(0,0,0,.28)",animation:"scaleIn .3s"}}>
          {done?(
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:56,marginBottom:16}}>🎉</div>
              <div style={{fontFamily:"Georgia,serif",fontSize:26,fontWeight:800,color:T.ink,marginBottom:12}}>Registration Successful!</div>
              <p style={{fontSize:14,color:T.muted,lineHeight:1.8,marginBottom:24}}>
                <b>{f.name}</b> has been registered on EduConnect on the <b>{selPlan?.name}</b> plan.<br/>
                Admin credentials have been sent to <b>{f.adminEmail}</b>.
              </p>
              <div style={{background:T.paper,borderRadius:14,padding:"18px",marginBottom:28,textAlign:"left",border:`1px solid ${T.border}`}}>
                <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:".5px"}}>Your Login Credentials</div>
                <div style={{fontSize:13,color:T.ink,marginBottom:4}}>Email: <b style={{color:T.forest}}>{f.adminEmail}</b></div>
                <div style={{fontSize:13,color:T.ink}}>Password: <b style={{color:T.forest}}>{f.adminPass}</b></div>
              </div>
              <Btn onClick={onLogin} full style={{padding:"13px",fontSize:14,borderRadius:11}}>Login to Your Admin Portal →</Btn>
            </div>
          ):step===1?(
            <>
              <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:800,color:T.ink,marginBottom:4}}>Institute Information</div>
              <p style={{fontSize:13,color:T.muted,marginBottom:24}}>Tell us about your school</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Inp label="School / Institute Name*" value={f.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Beaconhouse School" style={{gridColumn:"1/-1"}}/>
                <Inp label="City*" value={f.city} onChange={e=>set("city",e.target.value)} placeholder="e.g. Lahore"/>
                <Inp label="Contact Phone*" value={f.phone} onChange={e=>set("phone",e.target.value)} placeholder="03001234567" maxLength={11}/>
                {phoneErr&&<div style={{gridColumn:"1/-1",fontSize:11.5,color:T.danger,marginTop:-8,marginBottom:10}}>{phoneErr}</div>}
                <Inp label="Official Email*" value={f.email} onChange={e=>set("email",e.target.value)} placeholder="info@school.edu" type="email" style={{gridColumn:"1/-1"}}/>
                {emailErr&&<div style={{gridColumn:"1/-1",fontSize:11.5,color:T.danger,marginTop:-8,marginBottom:10}}>{emailErr}</div>}
                {/* This is the school's actual seat cap, not a guess — it is
                    persisted and enforced by the backend, clamped to whatever
                    the chosen plan allows. */}
                <Inp label="Student Limit*" value={f.students} onChange={e=>set("students",e.target.value)} placeholder="e.g. 150" type="number" min="1" style={{gridColumn:"1/-1"}}/>
                <div style={{gridColumn:"1/-1",fontSize:11.5,color:T.muted,marginTop:-8,marginBottom:12,lineHeight:1.6}}>
                  How many students you plan to enrol. This becomes your limit and can be raised later, up to your plan's maximum.
                </div>
              </div>
              {studentsErr&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"9px 13px",fontSize:12.5,marginBottom:12,border:`1px solid ${T.danger}30`}}>{studentsErr}</div>}
              <Btn onClick={()=>step1Ok&&setStep(2)} full style={{padding:"12px",fontSize:14,borderRadius:11,marginTop:4}} disabled={!step1Ok}>Next: Choose Your Plan →</Btn>
            </>
          ):step===2?(
            <>
              <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:800,color:T.ink,marginBottom:4}}>Choose Your Plan</div>
              <p style={{fontSize:13,color:T.muted,marginBottom:22}}>14-day free trial. No credit card required.</p>
              <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:22}}>
                {PLANS.map(pl=>(
                  <div key={pl.id} onClick={()=>setPlan(pl.id)}
                    style={{padding:"18px 20px",borderRadius:14,border:`2px solid ${plan===pl.id?pl.color:T.border}`,background:plan===pl.id?`${pl.color}09`:T.paper,cursor:"pointer",transition:"all .15s",position:"relative"}}>
                    {pl.popular&&<div style={{position:"absolute",top:12,right:12,background:`${pl.color}18`,color:pl.color,borderRadius:99,padding:"2px 10px",fontSize:11,fontWeight:700}}>Popular</div>}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontWeight:700,color:T.ink,fontSize:15,marginBottom:3}}>{pl.name}</div>
                        <div style={{fontSize:12,color:T.muted}}>Up to {pl.maxStudents===9999?"unlimited":pl.maxStudents.toLocaleString()} students</div>
                        <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
                          {pl.features.slice(0,3).map(f=><span key={f} style={{fontSize:10,color:pl.color,background:`${pl.color}12`,borderRadius:99,padding:"2px 8px",fontWeight:600}}>{f}</span>)}
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:800,color:pl.color}}>Rs. {pl.price.toLocaleString()}</div>
                        <div style={{fontSize:11,color:T.muted}}>/month</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{background:`${T.warning}12`,border:`1px solid ${T.warning}40`,borderRadius:12,padding:"12px 16px",marginBottom:18}}>
                <div style={{fontSize:12,color:T.warning,fontWeight:700,marginBottom:3}}>💳 Trial Period</div>
                <div style={{fontSize:12,color:T.muted}}>14-day free trial starts immediately. Invoice sent at end of trial period.</div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <Btn onClick={()=>setStep(1)} out color={T.muted} style={{flex:1,padding:"11px",borderRadius:11}}>← Back</Btn>
                <Btn onClick={()=>plan&&setStep(3)} style={{flex:2,padding:"11px",borderRadius:11}} disabled={!plan}>Next: Admin Setup →</Btn>
              </div>
            </>
          ):(
            <>
              <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:800,color:T.ink,marginBottom:4}}>Admin Account</div>
              <p style={{fontSize:13,color:T.muted,marginBottom:22}}>Create the primary admin for your institute</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Inp label="Admin Full Name*" value={f.adminName} onChange={e=>set("adminName",e.target.value)} placeholder="Dr. Imran Sheikh" style={{gridColumn:"1/-1"}}/>
                <Inp label="Admin Email*" value={f.adminEmail} onChange={e=>set("adminEmail",e.target.value)} placeholder="admin@school.edu" type="email"/>
                <Inp label="Admin Phone" value={f.adminPhone} onChange={e=>set("adminPhone",e.target.value)} placeholder="03001234567" maxLength={11}/>
                {adminEmailErr&&<div style={{gridColumn:"1/-1",fontSize:11.5,color:T.danger,marginTop:-8,marginBottom:10}}>{adminEmailErr}</div>}
                {adminPhoneErr&&<div style={{gridColumn:"1/-1",fontSize:11.5,color:T.danger,marginTop:-8,marginBottom:10}}>{adminPhoneErr}</div>}
                <Inp label="Password*" value={f.adminPass} onChange={e=>set("adminPass",e.target.value)} placeholder="Min 8 characters" type="password" style={{gridColumn:"1/-1"}}/>
                {passErr&&<div style={{gridColumn:"1/-1",fontSize:11.5,color:T.danger,marginTop:-8,marginBottom:10}}>{passErr}</div>}
              </div>
              <div style={{background:T.paper,borderRadius:12,padding:"16px",marginBottom:18,border:`1px solid ${T.border}`}}>
                <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:".5px"}}>Registration Summary</div>
                {[[f.name||"—","Institute"],[f.city||"—","City"],[selPlan?.name||"—","Plan"],[`Rs. ${(selPlan?.price||0).toLocaleString()}`,"Monthly Fee"]].map(([v,l])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5}}>
                    <span style={{color:T.muted}}>{l}</span><span style={{fontWeight:700,color:T.ink}}>{v}</span>
                  </div>
                ))}
              </div>
              {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
              <div style={{display:"flex",gap:10}}>
                <Btn onClick={()=>setStep(2)} out color={T.muted} style={{flex:1,padding:"11px",borderRadius:11}}>← Back</Btn>
                <Btn onClick={register} style={{flex:2,padding:"11px",borderRadius:11}} disabled={!step3Ok||submitting}>{submitting?"Registering…":"Complete Registration ✓"}</Btn>
              </div>
            </>
          )}
        </Crd>
        <div style={{textAlign:"center",marginTop:18}}><span onClick={onLogin} style={{fontSize:13,color:"rgba(255,255,255,.45)",cursor:"pointer"}}>Already registered? Sign In →</span></div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// SUPER ADMIN PORTAL
// ═══════════════════════════════════════════════════════════════════
const SUPERADMIN_TABS=["dashboard","institutes","revenue","users","settings"];

const SuperAdmin=({user,db,setDb,onLogout,onReload})=>{
  const[tab,setTab]=useHashTab("dashboard",SUPERADMIN_TABS);
  const[col,setCol]=useState(false);
  const[modal,setModal]=useState(null);
  const[selInst,setSelInst]=useState(null);
  const nav=[{id:"dashboard",label:"Dashboard",icon:"⊞"},{id:"institutes",label:"Institutes",icon:"🏫"},{id:"revenue",label:"Revenue",icon:"◑"},{id:"users",label:"Users",icon:"◉"},{id:"settings",label:"Settings",icon:"⚙"}];
  const insts=db.institutes;
  // Plans and KPIs come from the API; PLANS is only the landing-page fallback.
  const planList=db.plans?.length?db.plans:PLANS;
  const planById=id=>planList.find(p=>p.id===id);
  const kpis=db.platformDashboard?.kpis??{};
  const totS=kpis.students??insts.reduce((a,i)=>a+i.students,0);
  const totT=kpis.teachers??insts.reduce((a,i)=>a+i.teachers,0);
  const mrr=kpis.mrr??insts.reduce((a,i)=>a+(planById(i.plan)?.price||0),0);

  const subs=db.subscriptions??[];
  const subSummary=db.subscriptionSummary??{};
  // Selecting an institute anywhere filters the billing table to it.
  const shownSubs=selInst?subs.filter(s=>s.institute?.id===selInst.id):subs;
  const thisPeriod=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;

  const[busy,setBusy]=useState("");
  const[err,setErr]=useState("");
  const[note,setNote]=useState("");

  /** Wraps an action with busy/error/notice handling and a data refresh. */
  const run=async(key,fn,successNote)=>{
    setBusy(key);setErr("");setNote("");
    try{
      const result=await fn();
      if(successNote)setNote(typeof successNote==="function"?successNote(result):successNote);
      onReload?.();
      return result;
    }catch(e){
      setErr(e.errors?.[0]?.message||e.message||"That didn't work.");
      return null;
    }finally{
      setBusy("");
    }
  };

  const toggleStatus=inst=>{
    const suspending=inst.status==="active";
    const verb=suspending?"Suspend":"Reactivate";
    if(!window.confirm(
      suspending
        ? `Suspend ${inst.name}?\n\nEveryone there — admins, teachers and parents — is locked out immediately until you reactivate it. No data is deleted.`
        : `Reactivate ${inst.name}?\n\nIts users will be able to sign in again.`
    ))return;
    run(`status-${inst.id}`,
      ()=>api.institutes.changeStatus(inst.id,suspending?"SUSPENDED":"ACTIVE"),
      `${inst.name} ${suspending?"suspended":"reactivated"}.`);
    if(selInst?.id===inst.id)setSelInst(null);
  };

  const removeInstitute=inst=>{
    if(!window.confirm(
      `Delete ${inst.name}?\n\nThis erases every student, teacher, parent, mark, attendance record and invoice belonging to it (${inst.students} students, ${inst.teachers} teachers).\n\nThis cannot be undone. Consider suspending instead.`
    ))return;
    // Second gate — the first click is easy to make by accident.
    if(window.prompt(`Type the institute's name to confirm deletion:\n\n${inst.name}`)!==inst.name){
      setErr("Name didn't match — nothing was deleted.");
      return;
    }
    run(`del-${inst.id}`,()=>api.institutes.remove(inst.id),`${inst.name} deleted.`);
    setSelInst(null);
  };

  /** Banner shown above every tab so actions report back somewhere visible. */
  const Feedback=()=>(!err&&!note)?null:(
    <div style={{marginBottom:14,padding:"11px 16px",borderRadius:11,fontSize:13,fontWeight:600,
      background:err?`${T.danger}12`:`${T.success}12`,color:err?T.danger:T.success,
      border:`1px solid ${err?T.danger:T.success}30`,display:"flex",justifyContent:"space-between",gap:12}}>
      <span>{err||note}</span>
      <span onClick={()=>{setErr("");setNote("");}} style={{cursor:"pointer",opacity:.6}}>×</span>
    </div>
  );

  const InstituteModal=()=>{
    const[f,setF]=useState({name:"",city:"",phone:"",email:"",planId:"starter"});
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    const[saving,setSaving]=useState(false);
    const[err,setErr]=useState("");

    const create=async()=>{
      setSaving(true);setErr("");
      try{
        // Created by the platform owner, so it goes live immediately —
        // unlike a self-service signup, which starts PENDING.
        await api.institutes.create({
          name:f.name,city:f.city,phone:f.phone,email:f.email,
          planId:f.planId,status:"ACTIVE",
        });
        setModal(null);
        onReload?.();
      }catch(e){
        setErr(e.errors?.[0]?.message||e.message||"Could not create the institute.");
      }finally{
        setSaving(false);
      }
    };

    return(
      <Modal title="Onboard New Institute" onClose={()=>setModal(null)}>
        <Inp label="Institute Name*" value={f.name} onChange={e=>s("name",e.target.value)} placeholder="e.g. The City School"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Inp label="City*" value={f.city} onChange={e=>s("city",e.target.value)} placeholder="e.g. Karachi"/>
          <Inp label="Contact*" value={f.phone} onChange={e=>s("phone",e.target.value)} placeholder="03001234567" maxLength={11}/>
        </div>
        <Inp label="Institute Email*" value={f.email} onChange={e=>s("email",e.target.value)} placeholder="admin@school.edu" type="email"/>
        <Sel label="Plan" options={planList.map(p=>({v:p.id,l:`${p.name} — Rs. ${p.price.toLocaleString()}/mo`}))} value={f.planId} onChange={e=>s("planId",e.target.value)}/>
        {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn onClick={()=>setModal(null)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={create} style={{flex:2,padding:"11px"}} disabled={!f.name||!f.city||!f.email||!f.phone||saving}>{saving?"Creating…":"Create & Send Credentials"}</Btn>
        </div>
      </Modal>
    );
  };

  /** Move an institute between subscription tiers. */
  const PlanModal=({inst})=>{
    const current=planById(inst.plan);
    const[planId,setPlanId]=useState(inst.plan);
    const[saving,setSaving]=useState(false);
    const[e2,setE2]=useState("");
    const target=planById(planId);
    const overCap=target&&inst.students>target.maxStudents;

    const apply=async()=>{
      setSaving(true);setE2("");
      try{
        await api.institutes.changePlan(inst.id,planId);
        setModal(null);setSelInst(null);
        setNote(`${inst.name} moved to the ${target.name} plan.`);
        onReload?.();
      }catch(x){
        setE2(x.message||"Could not change the plan.");
      }finally{
        setSaving(false);
      }
    };

    return(
      <Modal title={`Change Plan — ${inst.name}`} onClose={()=>setModal(null)} width={460}>
        <div style={{fontSize:13,color:T.muted,marginBottom:14}}>
          Currently on <b style={{color:T.ink}}>{current?.name}</b> at Rs. {current?.price.toLocaleString()}/mo,
          using {inst.students} of {current?.maxStudents.toLocaleString()} seats.
        </div>
        <Sel label="New Plan" options={planList.map(p=>({v:p.id,l:`${p.name} — Rs. ${p.price.toLocaleString()}/mo · ${p.maxStudents.toLocaleString()} students`}))} value={planId} onChange={ev=>setPlanId(ev.target.value)}/>
        {overCap&&<div style={{background:`${T.warning}12`,color:T.warning,borderRadius:10,padding:"10px 14px",fontSize:12.5,marginBottom:12,border:`1px solid ${T.warning}30`}}>
          {inst.name} has {inst.students} students but {target.name} allows {target.maxStudents.toLocaleString()}. The API will reject this downgrade.
        </div>}
        {planId!==inst.plan&&!overCap&&<div style={{background:`${T.forest}0D`,borderRadius:10,padding:"10px 14px",fontSize:12.5,marginBottom:12,color:T.muted,border:`1px solid ${T.forest}25`}}>
          Monthly billing changes from Rs. {current?.price.toLocaleString()} to <b style={{color:T.ink}}>Rs. {target?.price.toLocaleString()}</b> from the next invoice.
        </div>}
        {e2&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{e2}</div>}
        <div style={{display:"flex",gap:10,marginTop:4}}>
          <Btn onClick={()=>setModal(null)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={apply} style={{flex:2,padding:"11px"}} disabled={planId===inst.plan||overCap||saving}>{saving?"Applying…":"Apply Change"}</Btn>
        </div>
      </Modal>
    );
  };

  /** Publish one notice into every active institute at once. */
  const BroadcastModal=()=>{
    const[f,setF]=useState({title:"",body:"",category:"GENERAL",audience:"Everyone",scope:"all"});
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    const[picked,setPicked]=useState([]);
    const[saving,setSaving]=useState(false);
    const[e2,setE2]=useState("");

    const active=insts.filter(i=>i.status==="active");
    const targets=f.scope==="all"?active:active.filter(i=>picked.includes(i.id));

    const send=async()=>{
      setSaving(true);setE2("");
      try{
        const r=await api.notices.broadcast({
          title:f.title,body:f.body,category:f.category,
          audience:{Everyone:[],"Parents only":["PARENT"],"Teachers only":["TEACHER"],"Admins only":["ADMIN"]}[f.audience],
          ...(f.scope==="pick"&&{instituteIds:picked}),
        });
        setModal(null);
        setNote(`Broadcast published to ${r.institutes} institute(s).`);
        onReload?.();
      }catch(x){
        setE2(x.errors?.[0]?.message||x.message||"Could not send the broadcast.");
      }finally{
        setSaving(false);
      }
    };

    return(
      <Modal title="Broadcast Notification" onClose={()=>setModal(null)} width={540}>
        <div style={{fontSize:12.5,color:T.muted,marginBottom:14}}>
          Posts the same notice into every selected institute. Each gets its own copy, so their admins can edit or remove it locally.
        </div>
        <Inp label="Title*" value={f.title} onChange={e=>s("title",e.target.value)} placeholder="e.g. Scheduled maintenance this Sunday"/>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:".6px"}}>Message*</div>
          <textarea rows={4} value={f.body} onChange={e=>s("body",e.target.value)} placeholder="What do you need every school to know?" style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,resize:"none",outline:"none",fontFamily:"inherit"}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Sel label="Category" options={[{v:"GENERAL",l:"General"},{v:"ACADEMIC",l:"Academic"},{v:"FINANCE",l:"Finance"},{v:"EVENT",l:"Event"},{v:"URGENT",l:"Urgent"}]} value={f.category} onChange={e=>s("category",e.target.value)}/>
          <Sel label="Audience" options={["Everyone","Parents only","Teachers only","Admins only"]} value={f.audience} onChange={e=>s("audience",e.target.value)}/>
        </div>
        <Sel label="Send to" options={[{v:"all",l:`All active institutes (${active.length})`},{v:"pick",l:"Choose institutes…"}]} value={f.scope} onChange={e=>s("scope",e.target.value)}/>
        {f.scope==="pick"&&(
          <div style={{maxHeight:150,overflowY:"auto",border:`1.5px solid ${T.border}`,borderRadius:10,padding:6,marginBottom:14,background:T.paper}}>
            {active.map(i=>(
              <label key={i.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 8px",cursor:"pointer",fontSize:13,color:T.ink}}>
                <input type="checkbox" checked={picked.includes(i.id)} onChange={()=>setPicked(p=>p.includes(i.id)?p.filter(x=>x!==i.id):[...p,i.id])}/>
                <span style={{fontSize:16}}>{i.logo}</span>{i.name}
                <span style={{color:T.muted,fontSize:11,marginLeft:"auto"}}>{i.city}</span>
              </label>
            ))}
          </div>
        )}
        {e2&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{e2}</div>}
        <div style={{display:"flex",gap:10,marginTop:4}}>
          <Btn onClick={()=>setModal(null)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={send} style={{flex:2,padding:"11px"}} disabled={!f.title||!f.body||!targets.length||saving}>{saving?"Sending…":`Publish to ${targets.length} institute${targets.length===1?"":"s"}`}</Btn>
        </div>
      </Modal>
    );
  };

  /**
   * Platform-wide configuration. Loaded on demand rather than with the rest
   * of the dashboard — it's one rarely-visited tab.
   */
  const GeneralSettingsCard=()=>{
    const[rows,setRows]=useState(null);
    const[values,setValues]=useState({});
    const[saving,setSaving]=useState(false);
    const[msg,setMsg]=useState("");
    const[e2,setE2]=useState("");

    useEffect(()=>{
      let cancelled=false;
      api.platform.settings()
        .then(r=>{
          if(cancelled)return;
          setRows(r);
          setValues(Object.fromEntries(r.map(s=>[s.key,s.value])));
        })
        .catch(x=>{if(!cancelled)setE2(x.message||"Could not load settings.");});
      return()=>{cancelled=true;};
    },[]);

    const dirty=rows?.some(s=>values[s.key]!==s.value);

    const save=async()=>{
      setSaving(true);setE2("");setMsg("");
      try{
        const next=await api.platform.updateSettings(values);
        setRows(next);
        setValues(Object.fromEntries(next.map(s=>[s.key,s.value])));
        setMsg("Settings saved.");
      }catch(x){
        setE2(x.errors?.[0]?.message||x.message||"Could not save settings.");
      }finally{
        setSaving(false);
      }
    };

    return(
      <Crd style={{padding:"26px"}}>
        <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>General Settings</div>
        {!rows&&!e2&&<div style={{fontSize:13,color:T.muted}}>Loading…</div>}
        {rows?.map(s=>(
          <Inp key={s.key} label={s.label} type={s.type==="number"?"number":s.type==="email"?"email":"text"}
            value={values[s.key]??""} onChange={e=>setValues(v=>({...v,[s.key]:e.target.value}))}/>
        ))}
        {rows&&<div style={{fontSize:11.5,color:T.muted,marginBottom:12,lineHeight:1.6}}>
          Trial duration applies to institutes that register themselves through the public signup form.
        </div>}
        {e2&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{e2}</div>}
        {msg&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.success}30`}}>{msg}</div>}
        {rows&&<Btn onClick={save} full style={{padding:"11px",marginTop:4}} disabled={!dirty||saving}>{saving?"Saving…":dirty?"Save Changes":"No Changes"}</Btn>}
      </Crd>
    );
  };

  /** Edit subscription tiers — price and seat cap per plan. */
  const PlansCard=()=>{
    const[editing,setEditing]=useState(null);
    const[f,setF]=useState({price:"",maxStudents:""});
    const[saving,setSaving]=useState(false);
    const[e2,setE2]=useState("");

    const start=p=>{setEditing(p.id);setF({price:String(p.price),maxStudents:String(p.maxStudents)});setE2("");};

    const save=async p=>{
      setSaving(true);setE2("");
      try{
        await api.plans.update(p.id,{price:Number(f.price),maxStudents:Number(f.maxStudents)});
        setEditing(null);
        setNote(`${p.name} plan updated.`);
        onReload?.();
      }catch(x){
        setE2(x.errors?.[0]?.message||x.message||"Could not update the plan.");
      }finally{
        setSaving(false);
      }
    };

    return(
      <Crd style={{padding:"26px"}}>
        <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:4}}>Subscription Plans</div>
        <div style={{fontSize:12,color:T.muted,marginBottom:18}}>
          Price changes apply from each institute's next invoice. A seat cap can't drop below what a subscriber already uses.
        </div>
        {e2&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{e2}</div>}
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>{["Plan","Price / month","Student Limit","Institutes","Revenue",""].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
          <tbody>
            {planList.map(p=>{
              const count=insts.filter(i=>i.plan===p.id).length;
              const isEditing=editing===p.id;
              return(
                <tr key={p.id} style={{borderBottom:`1px solid ${T.border}`}}>
                  <td style={{padding:"12px"}}><Bdg label={p.name} color={p.color} bg={`${p.color}18`}/></td>
                  <td style={{padding:"12px"}}>
                    {isEditing
                      ? <input type="number" value={f.price} onChange={e=>setF(v=>({...v,price:e.target.value}))} style={{width:110,padding:"6px 10px",borderRadius:8,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.card,outline:"none"}}/>
                      : <span style={{fontSize:13,fontWeight:700,color:T.forest}}>Rs. {p.price.toLocaleString()}</span>}
                  </td>
                  <td style={{padding:"12px"}}>
                    {isEditing
                      ? <input type="number" value={f.maxStudents} onChange={e=>setF(v=>({...v,maxStudents:e.target.value}))} style={{width:110,padding:"6px 10px",borderRadius:8,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.card,outline:"none"}}/>
                      : <span style={{fontSize:13,color:T.muted}}>{p.maxStudents.toLocaleString()}</span>}
                  </td>
                  <td style={{padding:"12px",fontSize:13,color:T.muted}}>{count}</td>
                  <td style={{padding:"12px",fontSize:13,fontWeight:600,color:T.ink}}>Rs. {(count*p.price).toLocaleString()}</td>
                  <td style={{padding:"12px"}}>
                    {isEditing
                      ? <div style={{display:"flex",gap:6}}>
                          <Btn onClick={()=>setEditing(null)} out color={T.muted} style={{padding:"5px 10px",fontSize:11}}>Cancel</Btn>
                          <Btn onClick={()=>save(p)} style={{padding:"5px 12px",fontSize:11}} disabled={saving||!f.price||!f.maxStudents}>{saving?"…":"Save"}</Btn>
                        </div>
                      : <Btn onClick={()=>start(p)} out color={T.forest} style={{padding:"5px 12px",fontSize:11}}>Edit</Btn>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Crd>
    );
  };

  /** Everything the platform holds, as CSVs plus one full JSON snapshot. */
  const exportAll=()=>{
    setErr("");setNote("");
    const d=db.platformDashboard;

    downloadCsv(stamped("platform-institutes","csv"),insts.map(i=>({
      code:i.code,name:i.name,city:i.city,plan:planById(i.plan)?.name??i.plan,
      price:planById(i.plan)?.price??0,status:i.status,students:i.students,
      teachers:i.teachers,joined:i.joined,email:i.email,phone:i.phone,
    })),[["Code","code"],["Institute","name"],["City","city"],["Plan","plan"],
      ["Monthly Fee (PKR)","price"],["Status","status"],["Students","students"],
      ["Teachers","teachers"],["Joined","joined"],["Email","email"],["Phone","phone"]]);

    downloadCsv(stamped("platform-users","csv"),db.users.map(u=>({
      name:u.name,email:u.email,role:u.role,
      institute:insts.find(i=>i.id===u.inst)?.name??"EduConnect HQ",
      status:u.isActive===false?"inactive":"active",
      lastLogin:u.lastLoginAt?new Date(u.lastLoginAt).toISOString().slice(0,10):"never",
    })),[["Name","name"],["Email","email"],["Role","role"],["Institute","institute"],
      ["Status","status"],["Last Login","lastLogin"]]);

    if(db.subscriptions?.length){
      downloadCsv(stamped("platform-revenue","csv"),db.subscriptions.map(s=>({
        institute:s.institute?.name,period:s.label,plan:s.plan?.name,
        amount:s.amount,status:s.status,
        paidAt:s.paidAt?new Date(s.paidAt).toISOString().slice(0,10):"",
      })),[["Institute","institute"],["Period","period"],["Plan","plan"],
        ["Amount (PKR)","amount"],["Status","status"],["Paid On","paidAt"]]);
    }

    downloadJson(stamped("platform-snapshot","json"),{
      exportedAt:new Date().toISOString(),
      kpis:d?.kpis??null,
      instituteStatus:d?.instituteStatus??null,
      planDistribution:d?.planDistribution??null,
      revenueByMonth:d?.revenueByMonth??null,
      institutes:insts,
      users:db.users,
      subscriptions:db.subscriptions??[],
    });

    setNote(`Exported ${insts.length} institutes, ${db.users.length} users and ${db.subscriptions?.length??0} invoices.`);
  };

  return(
    <Shell nav={nav} tab={tab} setTab={setTab} user={user} inst={{name:"EduConnect HQ",logo:"✦",color:T.ink}} collapsed={col} setCollapsed={setCol} onLogout={onLogout}>
      <Feedback/>
      {tab==="dashboard"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Platform Overview" title="Super Admin Dashboard"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
            <KPI label="Institutes" value={insts.length} color={T.blue} icon="🏫" sub="Active schools"/>
            <KPI label="Total Students" value={totS.toLocaleString()} color={T.forest} icon="◈" sub="Across all schools"/>
            <KPI label="Total Teachers" value={totT} color={T.purple} icon="◉" sub="Verified educators"/>
            <KPI label="Monthly Revenue" value={`Rs. ${(mrr/1000).toFixed(0)}K`} color={T.success} icon="◑" sub="Recurring revenue"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:18}}>
            <Crd style={{padding:"26px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink}}>Registered Institutes</div>
                <Btn onClick={()=>setModal("addInst")} style={{padding:"8px 16px",fontSize:12}}>+ Add Institute</Btn>
              </div>
              {!insts.length&&<div style={{fontSize:13,color:T.muted,padding:"14px 0"}}>No institutes registered yet.</div>}
              {insts.map(i=>{const pl=planById(i.plan); return(
                <div key={i.id} onClick={()=>setSelInst(selInst?.id===i.id?null:i)} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 0",borderBottom:`1px solid ${T.border}`,cursor:"pointer"}}>
                  <div style={{width:44,height:44,borderRadius:13,background:`${pl?.color||T.forest}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{i.logo}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:600,color:T.ink}}>{i.name}</div>
                    <div style={{fontSize:12,color:T.muted}}>{i.city} · {i.students} students · {i.teachers} teachers</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <Bdg label={pl?.name||i.plan} color={pl?.color||T.forest} bg={`${pl?.color||T.forest}18`}/>
                    <div style={{fontSize:11,color:T.success,marginTop:4,fontWeight:600}}>Rs. {(pl?.price??0).toLocaleString()}/mo</div>
                  </div>
                </div>
              );})}
            </Crd>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Plan Distribution</div>
                {/* planList, not the hard-coded PLANS: a plan the owner edited
                    or added in Settings would otherwise be missing here. The
                    guard on insts.length keeps the bar from going NaN. */}
                {planList.map(pl=>{const n=insts.filter(i=>i.plan===pl.id).length; return(
                  <div key={pl.id} style={{marginBottom:13}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:T.muted}}>{pl.name}</span><span style={{fontSize:12,fontWeight:700,color:pl.color}}>{n} school{n===1?"":"s"}</span></div>
                    <Bar val={insts.length?n/insts.length*100:0} color={pl.color}/>
                  </div>
                );})}
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Revenue by Plan</div>
                {planList.map(pl=>{const rev=insts.filter(i=>i.plan===pl.id).length*pl.price; return(
                  <div key={pl.id} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}><div style={{width:8,height:8,borderRadius:"50%",background:pl.color}}/><span style={{fontSize:12,color:T.muted}}>{pl.name}</span></div>
                    <span style={{fontSize:13,fontWeight:700,color:pl.color}}>Rs. {rev.toLocaleString()}</span>
                  </div>
                );})}
                <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",marginTop:4}}>
                  <span style={{fontSize:13,fontWeight:700,color:T.ink}}>Total MRR</span>
                  <span style={{fontSize:14,fontWeight:800,color:T.forest}}>Rs. {mrr.toLocaleString()}</span>
                </div>
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Quick Actions</div>
                {[
                  ["Broadcast Notification",T.purple,()=>setModal("broadcast")],
                  ["Export All Data",T.blue,exportAll],
                  ["Platform Settings",T.forest,()=>setTab("settings")],
                ].map(([l,c,fn])=>(
                  <Btn key={l} onClick={fn} out color={c} full style={{marginBottom:8,padding:"9px",fontSize:12}}>{l}</Btn>
                ))}
              </Crd>
            </div>
          </div>
          {selInst&&(
            <Crd style={{marginTop:18,padding:"24px",border:`1.5px solid ${T.forest}30`,animation:"fadeUp .3s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{display:"flex",gap:14,alignItems:"center"}}>
                  <div style={{width:52,height:52,borderRadius:14,background:`${T.forest}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>{selInst.logo}</div>
                  <div><div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:700,color:T.ink}}>{selInst.name}</div><div style={{fontSize:13,color:T.muted}}>{selInst.city} · Joined {selInst.joined}</div></div>
                </div>
                <span onClick={()=>setSelInst(null)} style={{cursor:"pointer",color:T.muted,fontSize:22}}>×</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginTop:18}}>
                {[[selInst.students,"Students",T.forest],[selInst.teachers,"Teachers",T.purple],
                  [selInst.status==="active"?"Active":selInst.status.charAt(0).toUpperCase()+selInst.status.slice(1),"Status",selInst.status==="active"?T.success:T.warning],
                  [planById(selInst.plan)?.name,"Plan",T.blue]].map(([v,l,c])=>(
                  <div key={l} style={{padding:"12px",background:T.paper,borderRadius:12,textAlign:"center"}}>
                    <div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:c}}>{v}</div>
                    <div style={{fontSize:10,color:T.muted,marginTop:3}}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
                <Btn onClick={()=>setModal(`plan-${selInst.id}`)} out color={T.blue} style={{padding:"8px 16px",fontSize:12}}>Change Plan</Btn>
                <Btn onClick={()=>toggleStatus(selInst)} out color={selInst.status==="active"?T.warning:T.success} style={{padding:"8px 16px",fontSize:12}} disabled={busy===`status-${selInst.id}`}>
                  {busy===`status-${selInst.id}`?"Working…":selInst.status==="active"?"Suspend Institute":"Reactivate Institute"}
                </Btn>
                <Btn onClick={()=>{setSelInst(selInst);setTab("revenue");}} out color={T.forest} style={{padding:"8px 16px",fontSize:12}}>View Billing</Btn>
                <Btn onClick={()=>removeInstitute(selInst)} out color={T.danger} style={{padding:"8px 16px",fontSize:12,marginLeft:"auto"}} disabled={busy===`del-${selInst.id}`}>
                  {busy===`del-${selInst.id}`?"Deleting…":"Delete"}
                </Btn>
              </div>
            </Crd>
          )}
        </div>
      )}
      {tab==="institutes"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Management" title="All Institutes" action={<Btn onClick={()=>setModal("addInst")} style={{marginBottom:4}}>+ Onboard Institute</Btn>}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
            {insts.map(i=>{
              const pl=planById(i.plan);
              // A suspended or pending institute used to get a green badge.
              const sc=i.status==="active"?T.success:i.status==="suspended"?T.danger:T.warning;
              return(
              <Crd key={i.id} style={{padding:"24px"}}>
                <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:16}}>
                  <div style={{width:48,height:48,borderRadius:14,background:`${pl?.color||T.forest}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{i.logo}</div>
                  <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:T.ink}}>{i.name}</div><div style={{fontSize:12,color:T.muted}}>{i.city} · {i.email}</div></div>
                  <Bdg label={i.status} color={sc} bg={`${sc}15`}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                  {[[i.students,"Students",T.forest],[i.teachers,"Teachers",T.purple]].map(([v,l,c])=>(
                    <div key={l} style={{padding:"12px",background:T.paper,borderRadius:12,textAlign:"center"}}>
                      <div style={{fontFamily:"Georgia,serif",fontSize:22,fontWeight:800,color:c}}>{v}</div>
                      <div style={{fontSize:10,color:T.muted}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <Bdg label={pl?.name||i.plan} color={pl?.color||T.forest} bg={`${pl?.color||T.forest}18`}/>
                  <span style={{fontSize:13,fontWeight:700,color:T.forest}}>Rs. {(pl?.price??0).toLocaleString()}/mo</span>
                </div>
                <div style={{fontSize:11,color:T.muted,marginBottom:12}}>Joined: {i.joined}</div>
                <div style={{display:"flex",gap:8}}>
                  <Btn onClick={()=>{setSelInst(i);setTab("dashboard");}} out color={T.forest} style={{flex:1,padding:"8px",fontSize:12,textAlign:"center"}}>Manage</Btn>
                  <Btn onClick={()=>setModal(`plan-${i.id}`)} out color={T.blue} style={{flex:1,padding:"8px",fontSize:12,textAlign:"center"}}>Change Plan</Btn>
                  <Btn onClick={()=>toggleStatus(i)} out color={i.status==="active"?T.warning:T.success} style={{flex:1,padding:"8px",fontSize:12,textAlign:"center"}} disabled={busy===`status-${i.id}`}>
                    {i.status==="active"?"Suspend":"Reactivate"}
                  </Btn>
                </div>
              </Crd>
            );})}
          </div>
        </div>
      )}
      {tab==="revenue"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Financial" title="Revenue Overview"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:22}}>
            <KPI label="Monthly Recurring" value={`Rs. ${mrr.toLocaleString()}`} color={T.forest} icon="◑" sub={`${insts.filter(i=>i.status==="active").length} active subscriptions`}/>
            <KPI label="Annual Run Rate" value={`Rs. ${((kpis.arr??mrr*12)/1000).toFixed(0)}K`} color={T.blue} icon="◈" sub="Projected ARR"/>
            <KPI label="Outstanding" value={`Rs. ${(subSummary.PENDING?.amount??0).toLocaleString()}`} color={T.warning} icon="⏳" sub={`${subSummary.PENDING?.count??0} unpaid invoice(s)`}/>
          </div>
          <Crd style={{padding:"26px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,gap:12,flexWrap:"wrap"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink}}>
                Invoice History
                {selInst&&<span style={{fontSize:12,fontWeight:600,color:T.muted,marginLeft:8}}>
                  — {selInst.name} <span onClick={()=>setSelInst(null)} style={{cursor:"pointer",color:T.forest}}>(clear)</span>
                </span>}
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn onClick={()=>run("gen-subs",()=>api.subscriptions.generate(thisPeriod),
                  r=>`${r.created} invoice(s) generated for ${r.label}${r.skipped?` · ${r.skipped} already existed`:""}.`)}
                  out color={T.forest} style={{padding:"7px 14px",fontSize:12}} disabled={busy==="gen-subs"}>
                  {busy==="gen-subs"?"Generating…":`Generate ${thisPeriod} Invoices`}
                </Btn>
                <Btn onClick={()=>{
                  if(!downloadCsv(stamped("subscription-invoices","csv"),shownSubs.map(s=>({
                    institute:s.institute?.name,period:s.label,plan:s.plan?.name,amount:s.amount,
                    status:s.status,paidAt:s.paidAt?new Date(s.paidAt).toISOString().slice(0,10):"",
                  })),[["Institute","institute"],["Period","period"],["Plan","plan"],["Amount (PKR)","amount"],["Status","status"],["Paid On","paidAt"]]))
                    setErr("Nothing to export yet.");
                }} out color={T.blue} style={{padding:"7px 14px",fontSize:12}}>Export CSV</Btn>
              </div>
            </div>
            {!shownSubs.length&&<div style={{fontSize:13,color:T.muted,padding:"14px 0"}}>No subscription invoices yet. Generate this month's to start billing.</div>}
            {shownSubs.length>0&&(
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Institute","Plan","Amount","Period","Status","Action"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
              <tbody>
                {shownSubs.map(s=>{
                  const paid=s.status==="PAID";
                  return(
                  <tr key={s.id} style={{borderBottom:`1px solid ${T.border}`}}>
                    <td style={{padding:"12px"}}><div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:18}}>{s.institute?.logo||"🏫"}</span><span style={{fontSize:13,fontWeight:600,color:T.ink}}>{s.institute?.name}</span></div></td>
                    <td style={{padding:"12px"}}><Bdg label={s.plan?.name} color={s.plan?.color} bg={`${s.plan?.color}18`}/></td>
                    <td style={{padding:"12px",fontSize:13,fontWeight:700,color:T.forest}}>Rs. {s.amount.toLocaleString()}</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{s.label}</td>
                    <td style={{padding:"12px"}}><Bdg label={paid?"✓ Paid":"⏳ Pending"} color={paid?T.success:T.warning} bg={paid?`${T.success}15`:`${T.warning}15`}/></td>
                    <td style={{padding:"12px"}}>
                      {paid
                        ? <span style={{fontSize:11,color:T.muted}}>{s.paidAt?new Date(s.paidAt).toLocaleDateString():"—"}</span>
                        : <Btn onClick={()=>run(`pay-${s.id}`,()=>api.subscriptions.pay(s.id),r=>`Payment recorded for ${r.institute.name}.`)}
                            out color={T.forest} style={{padding:"5px 12px",fontSize:11}} disabled={busy===`pay-${s.id}`}>
                            {busy===`pay-${s.id}`?"Saving…":"Mark Paid"}
                          </Btn>}
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
            )}
          </Crd>
        </div>
      )}
      {tab==="users"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Platform" title="All Users" action={
            <Btn onClick={()=>{
              if(!downloadCsv(stamped("platform-users","csv"),db.users.map(u=>({
                name:u.name,email:u.email,role:u.role,
                institute:insts.find(i=>i.id===u.inst)?.name??"EduConnect HQ",
                status:u.isActive===false?"inactive":"active",
                lastLogin:u.lastLoginAt?new Date(u.lastLoginAt).toISOString().slice(0,10):"never",
              })),[["Name","name"],["Email","email"],["Role","role"],["Institute","institute"],["Status","status"],["Last Login","lastLogin"]]))
                setErr("No users to export.");
            }} out color={T.blue} style={{marginBottom:4}}>Export CSV</Btn>
          }/>
          <Crd style={{padding:"26px"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Name","Role","Institute","Email","Last Login","Status","Actions"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
              <tbody>
                {db.users.map(u=>{
                  const inst=db.institutes.find(x=>x.id===u.inst);
                  const rc={superadmin:T.ink,admin:T.forest,teacher:T.purple,parent:T.blue}[u.role]||T.muted;
                  const active=u.isActive!==false;
                  const isSelf=u.id===user.id;
                  return(
                    <tr key={u.id} style={{borderBottom:`1px solid ${T.border}`,opacity:active?1:.55}}>
                      <td style={{padding:"12px"}}><div style={{display:"flex",gap:10,alignItems:"center"}}><Av name={u.name} size={32} bg={`${rc}18`} color={rc} fs={11}/><span style={{fontSize:13,fontWeight:600,color:T.ink}}>{u.name}{isSelf&&<span style={{fontSize:10,color:T.muted,marginLeft:6}}>(you)</span>}</span></div></td>
                      <td style={{padding:"12px"}}><Bdg label={u.role} color={rc} bg={`${rc}15`}/></td>
                      <td style={{padding:"12px",fontSize:13,color:T.muted}}>{inst?.name||"EduConnect HQ"}</td>
                      <td style={{padding:"12px",fontSize:13,color:T.muted}}>{u.email}</td>
                      <td style={{padding:"12px",fontSize:12,color:T.muted}}>{u.lastLoginAt?new Date(u.lastLoginAt).toLocaleDateString():"Never"}</td>
                      <td style={{padding:"12px"}}><Bdg label={active?"Active":"Disabled"} color={active?T.success:T.muted} bg={active?`${T.success}15`:`${T.muted}15`}/></td>
                      <td style={{padding:"12px"}}>
                        {isSelf
                          ? <span style={{fontSize:11,color:T.muted}}>—</span>
                          : <div style={{display:"flex",gap:6}}>
                              <Btn onClick={()=>{
                                if(!window.confirm(`Reset ${u.name}'s password?\n\nThey are signed out everywhere and will need the new password to sign back in.`))return;
                                run(`pw-${u.id}`,()=>api.users.resetPassword(u.id),
                                  r=>`New password for ${u.name} (${r.email}): ${r.password} — share it securely.`);
                              }} out color={T.blue} style={{padding:"5px 10px",fontSize:11}} disabled={busy===`pw-${u.id}`}>
                                {busy===`pw-${u.id}`?"…":"Reset PW"}
                              </Btn>
                              <Btn onClick={()=>run(`act-${u.id}`,()=>api.users.update(u.id,{isActive:!active}),
                                `${u.name} ${active?"disabled":"re-enabled"}.`)}
                                out color={active?T.warning:T.success} style={{padding:"5px 10px",fontSize:11}} disabled={busy===`act-${u.id}`}>
                                {busy===`act-${u.id}`?"…":active?"Disable":"Enable"}
                              </Btn>
                            </div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Crd>
        </div>
      )}
      {tab==="settings"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Configuration" title="Platform Settings"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <GeneralSettingsCard/>
            <Crd style={{padding:"26px"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Platform Stats</div>
              {[
                ["Total Institutes",insts.length],
                ["Active",insts.filter(i=>i.status==="active").length],
                ["Suspended",insts.filter(i=>i.status==="suspended").length],
                ["Total Students",totS.toLocaleString()],
                ["Total Teachers",totT],
                ["Total Parents",(kpis.parents??0).toLocaleString()],
                ["User Accounts",(kpis.users??db.users.length).toLocaleString()],
                ["Monthly Revenue",`Rs. ${mrr.toLocaleString()}`],
                ["Collected To Date",`Rs. ${(kpis.collectedTotal??0).toLocaleString()}`],
                ["Outstanding",`Rs. ${(kpis.pendingTotal??0).toLocaleString()}`],
              ].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
                  <span style={{fontSize:13,color:T.muted}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:700,color:T.ink}}>{v}</span>
                </div>
              ))}
            </Crd>
          </div>
          <PlansCard/>
        </div>
      )}
      {modal==="addInst"&&<InstituteModal/>}
      {modal==="broadcast"&&<BroadcastModal/>}
      {modal?.startsWith("plan-")&&(()=>{
        const target=insts.find(i=>i.id===modal.slice(5));
        return target?<PlanModal inst={target}/>:null;
      })()}
    </Shell>
  );
};

// ═══════════════════════════════════════════════════════════════════
// INSTITUTE ADMIN PORTAL
// ═══════════════════════════════════════════════════════════════════
const ADMIN_TABS=["dashboard","students","teachers","parents","attendance","fees","notices","reports","settings"];

const AdminPortal=({user,db,setDb,onLogout,onReload})=>{
  const[tab,setTab]=useHashTab("dashboard",ADMIN_TABS);
  const[col,setCol]=useState(false);
  const[modal,setModal]=useState(null);
  const[selStu,setSelStu]=useState(null);
  const inst=db.institutes.find(i=>i.id===user.inst)||db.institutes[0];
  const students=db.students.filter(s=>s.instId===user.inst);

  /**
   * Subscription comes from GET /institutes/me/subscription — the same record
   * the backend enforces limits against. It used to be looked up in the
   * hardcoded PLANS array, so a school with a custom cap of 150 still saw its
   * plan's 800 and no frontend change could ever have fixed it.
   */
  const sub=db.subscription??null;
  const plan=sub?.plan??PLANS.find(p=>p.id===inst.plan);
  const studentLimit=sub?.studentLimit??plan?.maxStudents??0;
  const seatsUsed=sub?.seatsUsed??students.length;
  const isUnlimited=studentLimit>=9999;

  // Real aggregates from GET /dashboard/admin.
  const dash=db.adminDashboard??null;
  const todayAtt={
    present:dash?.kpis?.todayPresent??0,
    absent:dash?.kpis?.todayAbsent??0,
    late:dash?.kpis?.todayLate??0,
    leave:dash?.kpis?.todayLeave??0,
    rate:dash?.kpis?.attendanceRateToday??0,
  };
  const todayMarked=Boolean(dash?.kpis?.attendanceMarkedToday);
  const feeOutstanding=dash?.fees?.outstanding??0;
  const unpaidStudents=dash?.fees?.unpaidStudents??0;

  // Portal-level feedback so actions outside the nested tab components
  // (notices, subscription) have somewhere visible to report success/failure.
  const[pErr,setPErr]=useState("");
  const[pNote,setPNote]=useState("");
  const PortalFeedback=()=>(!pErr&&!pNote)?null:(
    <div style={{marginBottom:14,padding:"11px 16px",borderRadius:11,fontSize:13,fontWeight:600,
      background:pErr?`${T.danger}12`:`${T.success}12`,color:pErr?T.danger:T.success,
      border:`1px solid ${pErr?T.danger:T.success}30`,display:"flex",justifyContent:"space-between",gap:12}}>
      <span>{pErr||pNote}</span>
      <span onClick={()=>{setPErr("");setPNote("");}} style={{cursor:"pointer",opacity:.6}}>×</span>
    </div>
  );

  const teachers=db.teachers.filter(t=>t.instId===user.inst);
  const parents=db.parents.filter(p=>p.instId===user.inst);
  const notices=db.notices.filter(n=>n.instId===user.inst);

  const nav=[
    {id:"dashboard",label:"Dashboard",   icon:"⊞"},
    {id:"students", label:"Students",    icon:"◈",badge:students.length},
    {id:"teachers", label:"Teachers",    icon:"◉",badge:teachers.length},
    {id:"parents",  label:"Parents",     icon:"◎",badge:parents.length},
    {id:"attendance",label:"Attendance", icon:"◷"},
    {id:"fees",     label:"Fees",        icon:"◑"},
    {id:"notices",  label:"Notices",     icon:"◆"},
    {id:"reports",  label:"Reports",     icon:"▦"},
    {id:"settings", label:"Settings",    icon:"⚙"},
  ];

  const AUDIENCES={
    "All (Students, Parents, Teachers)":[],
    "Everyone":[],
    "Parents only":["PARENT"],
    "Teachers only":["TEACHER"],
  };

  const[editNotice,setEditNotice]=useState(null);
  const[noticeBusy,setNoticeBusy]=useState("");

  /**
   * Delete is confirmed, then goes to the API. The backend re-checks that the
   * notice belongs to the caller's institute, so this is not the only guard.
   */
  const removeNotice=async n=>{
    if(!window.confirm(`Delete "${n.title}"?\n\nIt will disappear for every teacher and parent who can currently see it.\n\nThis cannot be undone.`))return;
    setNoticeBusy(n.id);setPErr("");setPNote("");
    try{
      await api.notices.remove(n.id);
      setPNote(`"${n.title}" deleted.`);
      onReload?.();
    }catch(e){
      setPErr(e.message||"Could not delete the notice.");
    }finally{
      setNoticeBusy("");
    }
  };

  /**
   * Exports. Each builds from a live endpoint and downloads a CSV — the
   * "Custom Report" hands over the raw JSON for anything not covered.
   * (CSV rather than PDF: it opens in Excel and needs no rendering library.)
   */
  const ReportsTab=()=>{
    const[busy,setBusy]=useState("");
    const[err,setErr]=useState("");
    const[note,setNote]=useState("");

    const run=async(key,fn)=>{
      setBusy(key);setErr("");setNote("");
      try{
        const msg=await fn();
        setNote(msg);
      }catch(e){
        setErr(e.message||"Could not build that report.");
      }finally{
        setBusy("");
      }
    };

    const academic=()=>run("academic",async()=>{
      const r=await api.reports.institute();
      if(!r.roster.length)throw new Error("No active students to report on.");
      downloadCsv(stamped("academic-report","csv"),r.roster,[
        ["Student","name"],["Roll No","rollNo"],["Grade","grade"],["Section","section"],
        ["Average %","average"],["GPA","gpa"],["Attendance %","attendanceRate"],
      ]);
      return `Academic report — ${r.roster.length} students, overall average ${r.summary.overallAverage}%.`;
    });

    const attendance=()=>run("attendance",async()=>{
      const r=await api.reports.institute();
      const rows=[...r.roster].sort((a,b)=>a.attendanceRate-b.attendanceRate);
      if(!rows.length)throw new Error("No attendance data yet.");
      downloadCsv(stamped("attendance-report","csv"),rows,[
        ["Student","name"],["Roll No","rollNo"],["Grade","grade"],["Section","section"],
        ["Attendance %","attendanceRate"],
      ]);
      return `Attendance report — institute rate ${r.summary.attendanceRate}%, lowest first.`;
    });

    const feeReport=()=>run("fees",async()=>{
      const list=await api.fees.list({limit:500});
      if(!list.length)throw new Error("No invoices have been issued yet.");
      downloadCsv(stamped("fee-collection-report","csv"),list.map(i=>({
        student:i.student.name, roll:i.student.rollNo, grade:`${i.student.grade} ${i.student.section}`,
        period:i.period, amount:i.net??i.amount, status:i.status,
        due:i.dueDate?.slice(0,10)??"", paidOn:i.paidAt?.slice(0,10)??"", method:i.method??"",
      })),[
        ["Student","student"],["Roll No","roll"],["Class","grade"],["Period","period"],
        ["Amount (PKR)","amount"],["Status","status"],["Due","due"],["Paid On","paidOn"],["Method","method"],
      ]);
      return `Fee report — ${list.length} invoices across all periods.`;
    });

    // Mirrors the insight engine's own thresholds: below 60% average, or
    // below 85% attendance, is what the rules flag as needing action.
    const atRisk=()=>run("ai",async()=>{
      const r=await api.reports.institute();
      const rows=r.roster
        .filter(s=>s.average<60||s.attendanceRate<85)
        .map(s=>({...s,concern:[
          s.average<60?"Below 60% average":null,
          s.attendanceRate<85?"Attendance below 85%":null,
        ].filter(Boolean).join("; ")}));
      if(!rows.length)throw new Error("No students currently meet the at-risk thresholds.");
      downloadCsv(stamped("at-risk-students","csv"),rows,[
        ["Student","name"],["Roll No","rollNo"],["Grade","grade"],["Section","section"],
        ["Average %","average"],["Attendance %","attendanceRate"],["Concern","concern"],
      ]);
      return `${rows.length} student(s) flagged as needing attention.`;
    });

    const teacherPerf=()=>run("teachers",async()=>{
      const r=await api.reports.institute();
      if(!r.subjectPerformance.length)throw new Error("No subjects have been set up yet.");
      downloadCsv(stamped("teacher-performance","csv"),r.subjectPerformance,[
        ["Subject","name"],["Grade","grade"],["Teacher","teacher"],
        ["Students","students"],["Class Average %","average"],
      ]);
      return `Subject performance for ${r.subjectPerformance.length} subject(s).`;
    });

    const custom=()=>run("custom",async()=>{
      const r=await api.reports.institute();
      downloadJson(stamped("institute-report","json"),r);
      return "Full institute dataset exported as JSON.";
    });

    const CARDS=[
      ["◈","Academic Report","Every student's subject average, GPA and attendance in one sheet.",T.purple,"academic",academic],
      ["◷","Attendance Report","Attendance rate per student, sorted lowest first so absentees surface.",T.blue,"attendance",attendance],
      ["◑","Fee Collection Report","Every invoice with status, due date, payment date and method.",T.success,"fees",feeReport],
      ["✦","At-Risk Students","Students under 60% average or 85% attendance — the AI engine's own thresholds.",T.gold,"ai",atRisk],
      ["◉","Teacher Performance","Class averages by subject and teacher, with enrolment counts.",T.forest,"teachers",teacherPerf],
      ["▦","Full Dataset (JSON)","Everything the report endpoint returns, for your own analysis.",T.muted,"custom",custom],
    ];

    return(
      <div style={{animation:"fadeUp .35s"}}>
        <SecHead pre="Analytics" title="Reports & Exports"/>
        {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"11px 15px",fontSize:13,marginBottom:14,border:`1px solid ${T.danger}30`}}>{err}</div>}
        {note&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"11px 15px",fontSize:13,marginBottom:14,border:`1px solid ${T.success}30`}}>✓ {note}</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
          {CARDS.map(([ic,t,d,c,key,fn])=>(
            <Crd key={t} style={{padding:"26px",transition:"transform .2s,box-shadow .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 12px 36px rgba(0,0,0,.1)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
              <div style={{width:48,height:48,borderRadius:14,background:`${c}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:c,marginBottom:16}}>{ic}</div>
              <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:T.ink,marginBottom:8}}>{t}</div>
              <p style={{fontSize:13,color:T.muted,lineHeight:1.65,marginBottom:16}}>{d}</p>
              <Btn out color={c} onClick={fn} disabled={busy===key} style={{padding:"8px 18px",fontSize:12}}>
                {busy===key?"Building…":key==="custom"?"Download JSON":"Download CSV"}
              </Btn>
            </Crd>
          ))}
        </div>
      </div>
    );
  };

  const PKR=n=>`Rs. ${Number(n||0).toLocaleString("en-PK")}`;
  const thisPeriod=new Date().toISOString().slice(0,7); // "2026-08"

  /**
   * Fee ledger. Figures come from /fees/stats rather than being summed in the
   * browser, so the collection rate matches what the API reports elsewhere.
   */
  const FeesTab=()=>{
    const[stats,setStats]=useState(null);
    const[invoices,setInvoices]=useState([]);
    const[period,setPeriod]=useState(thisPeriod);
    const[statusFilter,setStatusFilter]=useState("");
    const[loading,setLoading]=useState(true);
    const[busy,setBusy]=useState("");
    const[err,setErr]=useState("");
    const[note,setNote]=useState("");
    const[nonce,setNonce]=useState(0);
    const refresh=()=>setNonce(n=>n+1);

    useEffect(()=>{
      let cancelled=false;
      setLoading(true);setErr("");
      Promise.all([
        api.fees.stats(),
        api.fees.list({period,...(statusFilter&&{status:statusFilter}),limit:200}),
      ])
        .then(([s,list])=>{if(!cancelled){setStats(s);setInvoices(list);}})
        .catch(e=>{if(!cancelled)setErr(e.message);})
        .finally(()=>{if(!cancelled)setLoading(false);});
      return()=>{cancelled=true;};
    },[period,statusFilter,nonce]);

    const run=async(label,fn)=>{
      setBusy(label);setErr("");setNote("");
      try{
        const msg=await fn();
        if(msg)setNote(msg);
        refresh();
        onReload?.();
      }catch(e){
        setErr(e.errors?.[0]?.message||e.message||"Action failed.");
      }finally{
        setBusy("");
      }
    };

    const pay=inv=>run(`pay-${inv.id}`,async()=>{
      const r=await api.fees.pay(inv.id,{method:"Cash"});
      return `Recorded ${PKR(r.paidAmount)} from ${r.student.name}.`;
    });

    const generate=()=>run("generate",async()=>{
      const r=await api.fees.generate({period});
      return `${r.created} invoice(s) generated for ${r.label}${r.skipped?`, ${r.skipped} already existed`:""}.`;
    });

    const overdue=()=>run("overdue",async()=>{
      const r=await api.fees.markOverdue();
      return `${r.updated} invoice(s) marked overdue.`;
    });

    /**
     * Reminders go to guardians of students with unpaid invoices, through the
     * existing message + email service. Without SMTP the email falls back to
     * the server console, but the in-app message is still created — so the
     * action never silently does nothing.
     */
    const remind=()=>run("remind",async()=>{
      if(!window.confirm("Send a fee reminder to every guardian with an unpaid invoice?\n\nEach guardian gets one message listing all their children's outstanding fees."))
        return null;
      const r=await api.fees.remind();
      if(!r.sent) return "No unpaid invoices — nobody needed reminding.";
      return `Reminder sent to ${r.sent} guardian(s) covering ${r.invoices} invoice(s)` +
        (r.skipped?.length ? ` · ${r.skipped.length} student(s) skipped (no guardian linked)` : "") + ".";
    });

    const exportCsv=()=>{
      const rows=invoices.map(i=>({
        student:i.student.name, roll:i.student.rollNo, grade:i.student.grade,
        section:i.student.section, period:i.period, amount:i.net??i.amount,
        status:i.status, dueDate:i.dueDate?.slice(0,10)??"",
        paidOn:i.paidAt?.slice(0,10)??"", method:i.method??"",
      }));
      if(!downloadCsv(stamped(`fees-${period}`,"csv"),rows,[
        ["Student","student"],["Roll No","roll"],["Grade","grade"],["Section","section"],
        ["Period","period"],["Amount (PKR)","amount"],["Status","status"],
        ["Due Date","dueDate"],["Paid On","paidOn"],["Method","method"],
      ])) setErr("Nothing to export for this period.");
    };

    const outstanding=(stats?.pending??0)+(stats?.overdue??0);

    return(
      <div style={{animation:"fadeUp .35s"}}>
        <SecHead pre="Finance" title="Fee Management"/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
          <KPI label="Total Invoiced" value={PKR(stats?.totalInvoiced)} color={T.ink} icon="◑" sub="All periods"/>
          <KPI label="Collected" value={PKR(stats?.collected)} color={T.success} icon="✓" sub={`${stats?.collectionRate??0}% collection rate`}/>
          <KPI label="Outstanding" value={PKR(outstanding)} color={T.warning} icon="⏳" sub="Pending + overdue"/>
          <KPI label="Overdue" value={PKR(stats?.overdue)} color={T.danger} icon="⚠" sub="Past due date"/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:18}}>
          <Crd style={{padding:"26px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:12,marginBottom:18,flexWrap:"wrap"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:14}}>Student Fee Status</div>
              <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
                <div style={{minWidth:130}}>
                  <Sel label="Period" options={(stats?.monthly??[]).map(m=>({v:m.period,l:m.label})).concat(
                    (stats?.monthly??[]).some(m=>m.period===thisPeriod)?[]:[{v:thisPeriod,l:thisPeriod}]
                  )} value={period} onChange={e=>setPeriod(e.target.value)}/>
                </div>
                <div style={{minWidth:130}}>
                  <Sel label="Status" options={[{v:"",l:"All"},{v:"PAID",l:"Paid"},{v:"PENDING",l:"Pending"},{v:"OVERDUE",l:"Overdue"}]} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}/>
                </div>
              </div>
            </div>

            {loading&&<div style={{fontSize:13,color:T.muted,padding:"12px 0"}}>Loading invoices…</div>}
            {!loading&&!invoices.length&&(
              <div style={{fontSize:13,color:T.muted,padding:"12px 0"}}>
                No invoices for this period. Use <b>Generate Invoices</b> to create them.
              </div>
            )}

            {!loading&&invoices.length>0&&(
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Student","Grade","Amount","Due","Paid On","Status","Action"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                <tbody>{invoices.map(f=>{
                  const st=f.status.toLowerCase();
                  const c=st==="paid"?T.success:st==="overdue"?T.danger:T.warning;
                  return(
                    <tr key={f.id} style={{borderBottom:`1px solid ${T.border}`}}>
                      <td style={{padding:"12px",fontSize:13,fontWeight:600,color:T.ink}}>{f.student.name}</td>
                      <td style={{padding:"12px",fontSize:13,color:T.muted}}>{f.student.grade} {f.student.section}</td>
                      <td style={{padding:"12px",fontSize:13}}>{PKR(f.net??f.amount)}</td>
                      <td style={{padding:"12px",fontSize:13,color:T.muted}}>{f.dueDate?new Date(f.dueDate).getDate():"—"}</td>
                      <td style={{padding:"12px",fontSize:13,color:T.muted}}>{f.paidAt?new Date(f.paidAt).toLocaleDateString(undefined,{month:"short",day:"numeric"}):"—"}</td>
                      <td style={{padding:"12px"}}><Bdg label={st==="paid"?"✓ Paid":st==="overdue"?"⚠ Overdue":"⏳ Pending"} color={c} bg={`${c}15`}/></td>
                      <td style={{padding:"12px"}}>{st!=="paid"&&st!=="waived"&&
                        <Btn onClick={()=>pay(f)} disabled={busy===`pay-${f.id}`} style={{padding:"5px 12px",fontSize:11}}>{busy===`pay-${f.id}`?"…":"Mark Paid"}</Btn>}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
          </Crd>

          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Crd style={{padding:"22px"}}>
              <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Collection by Month</div>
              {(stats?.monthly??[]).slice(-6).map(m=>(
                <div key={m.period} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:12,color:T.muted}}>{m.label}</span>
                    <span style={{fontSize:12,fontWeight:700,color:T.ink}}>{PKR(m.collected)}</span>
                  </div>
                  <Bar val={m.billed?Math.round((m.collected/m.billed)*100):0} color={T.forest}/>
                </div>
              ))}
              {!stats?.monthly?.length&&<div style={{fontSize:12,color:T.muted}}>No billing history yet.</div>}
              <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderTop:`1px solid ${T.border}`,marginTop:6}}>
                <span style={{fontSize:13,fontWeight:700,color:T.ink}}>Standard Monthly Fee</span>
                <span style={{fontSize:14,fontWeight:800,color:T.forest}}>{PKR(inst.defaultMonthlyFee??0)}</span>
              </div>
            </Crd>

            <Crd style={{padding:"22px"}}>
              <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>Actions</div>
              <Btn out color={T.forest} full onClick={generate} disabled={busy==="generate"} style={{marginBottom:8,padding:"9px",fontSize:12}}>{busy==="generate"?"Generating…":"Generate Invoices"}</Btn>
              <Btn out color={T.warning} full onClick={overdue} disabled={busy==="overdue"} style={{marginBottom:8,padding:"9px",fontSize:12}}>{busy==="overdue"?"Updating…":"Flag Overdue"}</Btn>
              <Btn out color={T.purple} full onClick={remind} disabled={busy==="remind"} style={{marginBottom:8,padding:"9px",fontSize:12}}>{busy==="remind"?"Sending…":"Send Fee Reminders"}</Btn>
              <Btn out color={T.blue} full onClick={exportCsv} style={{marginBottom:8,padding:"9px",fontSize:12}}>Download Fee Report</Btn>
            </Crd>

            {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
            {note&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"10px 14px",fontSize:12,border:`1px solid ${T.success}30`}}>✓ {note}</div>}
          </div>
        </div>
      </div>
    );
  };

  /**
   * School attendance register.
   *
   * This tab was entirely static: a fixed "Grade 8A" heading, a hard-coded
   * "Thursday, Mar 12, 2026" date, a 87% donut with invented present/absent
   * counts, and P/A/L buttons and a Save button that had no handlers at all.
   * Admins are authorised for /attendance/register and /attendance/bulk, so it
   * now marks real attendance, and the side panel reads the same
   * /dashboard/admin figures the dashboard tile uses.
   */
  const AdminAttendanceTab=()=>{
    // Classes present in this institute, from the real roster.
    const classes=[...new Map(
      students.map(s=>[`${s.grade}|${s.section}`,{grade:s.grade,section:s.section}])
    ).values()].sort((a,b)=>`${a.grade}${a.section}`.localeCompare(`${b.grade}${b.section}`,undefined,{numeric:true}));

    const[cls,setCls]=useState(classes[0]?`${classes[0].grade}|${classes[0].section}`:"");
    const[date,setDate]=useState(new Date().toISOString().slice(0,10));
    const[register,setRegister]=useState(null);
    const[marks,setMarks]=useState({});
    const[loading,setLoading]=useState(false);
    const[saving,setSaving]=useState(false);
    const[err,setErr]=useState("");

    useEffect(()=>{
      if(!cls)return;
      const[grade,section]=cls.split("|");
      let cancelled=false;
      setLoading(true);setErr("");
      api.attendance.register(grade,section,date)
        .then(r=>{
          if(cancelled)return;
          setRegister(r);
          setMarks(Object.fromEntries(r.students.map(s=>[s.id,s.status??"PRESENT"])));
        })
        .catch(e=>{if(!cancelled)setErr(e.message||"Could not load the register.");})
        .finally(()=>{if(!cancelled)setLoading(false);});
      return()=>{cancelled=true;};
    },[cls,date]);

    const save=async()=>{
      setSaving(true);setErr("");setSaved("");
      try{
        const res=await api.attendance.markBulk(
          date,
          Object.entries(marks).map(([studentId,status])=>({studentId,status}))
        );
        // Reported at portal level: onReload swaps `db`, which remounts this
        // component and would discard a local success message immediately.
        setPErr("");setPNote(`Attendance saved for ${res.marked} student(s) on ${date}.`);
        onReload?.();
      }catch(e){
        setErr(e.errors?.[0]?.message||e.message||"Could not save attendance.");
      }finally{
        setSaving(false);
      }
    };

    const counts=Object.values(marks).reduce((a,s)=>({...a,[s]:(a[s]||0)+1}),{});
    const prettyDate=new Date(`${date}T00:00:00`).toLocaleDateString(undefined,
      {weekday:"long",month:"short",day:"numeric",year:"numeric"});

    return(
      <div style={{animation:"fadeUp .35s"}}>
        <SecHead pre="Tracking" title="Attendance Management"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:18}}>
          <Crd style={{padding:"26px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:18,gap:14,flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-end"}}>
                <div style={{minWidth:180}}>
                  <Sel label="Class" options={classes.map(c=>({v:`${c.grade}|${c.section}`,l:`${c.grade} — Section ${c.section}`}))} value={cls} onChange={e=>setCls(e.target.value)}/>
                </div>
                <div style={{minWidth:150}}>
                  <Inp label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
                </div>
              </div>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
                <Bdg label={prettyDate} color={T.blue} bg={`${T.blue}15`}/>
                {register?.alreadyMarked&&<Bdg label="Already marked — editing" color={T.forest} bg={`${T.forest}15`}/>}
                <Btn out color={T.success} onClick={()=>setMarks(m=>Object.fromEntries(Object.keys(m).map(k=>[k,"PRESENT"])))} style={{padding:"7px 14px",fontSize:12}}>Mark All Present</Btn>
              </div>
            </div>

            {!classes.length&&<div style={{fontSize:13,color:T.muted,padding:"14px 0"}}>No students enrolled yet — nothing to take a register for.</div>}
            {loading&&<div style={{fontSize:13,color:T.muted,padding:"14px 0"}}>Loading register…</div>}
            {!loading&&cls&&!register?.students?.length&&<div style={{fontSize:13,color:T.muted,padding:"14px 0"}}>No active students in this class.</div>}

            {!loading&&register?.students?.length>0&&(
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Student","Roll","Status","Mark"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                <tbody>{register.students.map(s=>(
                  <tr key={s.id} style={{borderBottom:`1px solid ${T.border}`}}>
                    <td style={{padding:"12px"}}><div style={{display:"flex",gap:8,alignItems:"center"}}><Av name={s.name} size={28} bg={`${T.forest}15`} color={T.forest} fs={10}/><span style={{fontSize:13,color:T.ink,fontWeight:500}}>{s.name}</span></div></td>
                    <td style={{padding:"12px",fontSize:12,color:T.muted}}>{s.rollNo}</td>
                    <td style={{padding:"12px"}}><AttBadge s={(marks[s.id]||"PRESENT").toLowerCase()}/></td>
                    <td style={{padding:"12px"}}>
                      <div style={{display:"flex",gap:6}}>
                        {[["P","PRESENT",T.success],["A","ABSENT",T.danger],["L","LATE",T.warning],["Lv","LEAVE",T.muted]].map(([lbl,sv,c])=>(
                          <span key={sv} onClick={()=>setMarks(m=>({...m,[s.id]:sv}))}
                            style={{padding:"5px 11px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",background:marks[s.id]===sv?c:"transparent",color:marks[s.id]===sv?"#fff":c,border:`1.5px solid ${c}`,transition:"all .15s"}}>{lbl}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}

            {register?.students?.length>0&&(
              <div style={{display:"flex",gap:14,marginTop:16,fontSize:12}}>
                <span style={{color:T.success,fontWeight:600}}>{counts.PRESENT||0} present</span>
                <span style={{color:T.danger,fontWeight:600}}>{counts.ABSENT||0} absent</span>
                <span style={{color:T.warning,fontWeight:600}}>{counts.LATE||0} late</span>
                {counts.LEAVE>0&&<span style={{color:T.muted,fontWeight:600}}>{counts.LEAVE} on leave</span>}
              </div>
            )}

            {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginTop:14,border:`1px solid ${T.danger}30`}}>{err}</div>}

            <Btn full onClick={save} disabled={saving||loading||!register?.students?.length} style={{marginTop:18,padding:"12px"}}>{saving?"Saving…":"Save Attendance Record"}</Btn>
          </Crd>

          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Crd style={{padding:"22px"}}>
              <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>School-Wide Today</div>
              {!todayMarked?(
                <div style={{textAlign:"center",padding:"16px 0"}}>
                  <div style={{fontSize:26,marginBottom:6,opacity:.35}}>◷</div>
                  <div style={{fontSize:12.5,color:T.muted,lineHeight:1.6}}>
                    {students.length===0?"No students enrolled yet.":"Attendance hasn't been taken today."}
                  </div>
                </div>
              ):(
                <>
                  <div style={{display:"flex",justifyContent:"center",marginBottom:14}}><Donut p={todayAtt.rate} color={T.forest} size={90}/></div>
                  {[["Present",todayAtt.present,T.success],["Absent",todayAtt.absent,T.danger],["Late",todayAtt.late,T.warning],["Leave",todayAtt.leave,T.muted]].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                      <span style={{fontSize:13,color:T.muted}}>{l}</span><span style={{fontSize:13,fontWeight:700,color:c}}>{v} student{v===1?"":"s"}</span>
                    </div>
                  ))}
                </>
              )}
            </Crd>
            <Crd style={{padding:"22px"}}>
              <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Monthly Summary</div>
              {!students.length&&<div style={{fontSize:12,color:T.muted}}>No students yet.</div>}
              {students.map(s=>(
                <div key={s.id} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:T.muted}}>{s.name}</span><span style={{fontSize:12,fontWeight:700,color:s.att.present>=90?T.success:T.warning}}>{s.att.present}%</span></div>
                  <Bar val={s.att.present} color={s.att.present>=90?T.success:T.warning}/>
                </div>
              ))}
            </Crd>
          </div>
        </div>
      </div>
    );
  };

  const NoticeModal=()=>{
    const[f,setF]=useState({title:"",cat:"General",body:"",notify:"Everyone"});
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    const[saving,setSaving]=useState(false);
    const[err,setErr]=useState("");

    const publish=async()=>{
      setSaving(true);setErr("");
      try{
        await api.notices.create({
          title:f.title,
          body:f.body,
          category:f.cat.toUpperCase(),
          audience:AUDIENCES[f.notify]??[],
        });
        setModal(null);
        onReload?.();
      }catch(e){
        setErr(e.errors?.[0]?.message||e.message||"Could not publish the notice.");
      }finally{
        setSaving(false);
      }
    };

    return(
      <Modal title="Post New Notice" onClose={()=>setModal(null)}>
        <Inp label="Title" value={f.title} onChange={e=>s("title",e.target.value)} placeholder="e.g. Annual Exam Schedule"/>
        <Sel label="Category" options={["Academic","Finance","Event","General","Urgent"]} value={f.cat} onChange={e=>s("cat",e.target.value)}/>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:".6px"}}>Message</div>
          <textarea rows={4} value={f.body} onChange={e=>s("body",e.target.value)} placeholder="Notice content…" style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,resize:"none",outline:"none",fontFamily:"inherit"}}/>
        </div>
        <Sel label="Notify" options={Object.keys(AUDIENCES)} value={f.notify} onChange={e=>s("notify",e.target.value)}/>
        {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn onClick={()=>setModal(null)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={publish} style={{flex:2,padding:"11px"}} disabled={!f.title||!f.body||saving}>{saving?"Publishing…":"Publish Notice"}</Btn>
        </div>
      </Modal>
    );
  };

  /** Institute profile. An admin may edit these; plan and status are platform-level. */
  const InstituteSettingsCard=()=>{
    const[f,setF]=useState({
      name:inst.name??"", city:inst.city??"", phone:inst.phone??"",
      email:inst.email??"", defaultMonthlyFee:String(inst.defaultMonthlyFee??0),
    });
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    const[saving,setSaving]=useState(false);
    const[err,setErr]=useState("");
    const[done,setDone]=useState(false);

    const save=async()=>{
      setSaving(true);setErr("");setDone(false);
      try{
        await api.institutes.update(inst.id,{
          name:f.name, city:f.city, phone:f.phone, email:f.email,
          defaultMonthlyFee:Number(f.defaultMonthlyFee)||0,
        });
        setDone(true);
        onReload?.();
      }catch(e){
        setErr(e.errors?.[0]?.message||e.message||"Could not save changes.");
      }finally{
        setSaving(false);
      }
    };

    return(
      <Crd style={{padding:"26px"}}>
        <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Institute Information</div>
        <Inp label="Institute Name" value={f.name} onChange={e=>s("name",e.target.value)}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Inp label="City" value={f.city} onChange={e=>s("city",e.target.value)}/>
          <Inp label="Phone" value={f.phone} onChange={e=>s("phone",e.target.value)}/>
        </div>
        <Inp label="Official Email" value={f.email} onChange={e=>s("email",e.target.value)} type="email"/>
        <Inp label="Standard Monthly Fee (PKR)" value={f.defaultMonthlyFee} onChange={e=>s("defaultMonthlyFee",e.target.value)} type="number"/>
        {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
        {done&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.success}30`}}>✓ Saved.</div>}
        <Btn full onClick={save} disabled={saving||!f.name||!f.city||!f.email} style={{padding:"11px",marginTop:4}}>{saving?"Saving…":"Save Changes"}</Btn>
      </Crd>
    );
  };

  /** Small ✎ / ✕ pair for table rows. Stops the click reaching the row. */
  const RowActions=({onEdit,onDelete,busy})=>(
    <div style={{display:"flex",gap:6}} onClick={e=>e.stopPropagation()}>
      <span onClick={onEdit} title="Edit"
        style={{width:26,height:26,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:12,color:T.blue,background:`${T.blue}12`,border:`1px solid ${T.blue}25`}}>✎</span>
      <span onClick={busy?undefined:onDelete} title="Delete"
        style={{width:26,height:26,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",cursor:busy?"wait":"pointer",fontSize:12,color:T.danger,background:`${T.danger}12`,border:`1px solid ${T.danger}25`,opacity:busy?.5:1}}>{busy?"·":"✕"}</span>
    </div>
  );

  const[editing,setEditing]=useState(null); // { type, record }
  const[deleting,setDeleting]=useState("");
  const[resetting,setResetting]=useState("");
  const[rowErr,setRowErr]=useState("");
  const[rowNote,setRowNote]=useState("");

  /**
   * Admin-forced password reset. The API returns the new password once —
   * show it so the admin can pass it on, since it isn't recoverable later.
   */
  const resetPw=async record=>{
    if(!record.userId)return;
    if(!window.confirm(`Reset ${record.name}'s password?\n\nThey will be signed out everywhere and will need the new password to sign back in.`))return;

    setResetting(record.userId);setRowErr("");setRowNote("");
    try{
      const r=await api.users.resetPassword(record.userId);
      setRowNote(`New password for ${record.name} (${r.email}): ${r.password} — share it securely and ask them to change it.`);
    }catch(e){
      setRowErr(e.message||"Could not reset the password.");
    }finally{
      setResetting("");
    }
  };

  const API_FOR={Student:api.students,Teacher:api.teachers,Parent:api.parents};

  const removeRow=async(type,record)=>{
    const extra=type==="Parent"
      ? "\n\nTheir children stay enrolled but lose the guardian link."
      : type==="Teacher"
        ? "\n\nTheir subjects stay, but become unassigned."
        : "\n\nThis also removes their marks, attendance and fee records.";
    if(!window.confirm(`Delete ${record.name}?${extra}\n\nThis cannot be undone.`))return;

    setDeleting(record.id);setRowErr("");
    try{
      await API_FOR[type].remove(record.id);
      if(type==="Student"&&selStu?.id===record.id)setSelStu(null);
      onReload?.();
    }catch(e){
      setRowErr(e.message||`Could not delete ${record.name}.`);
    }finally{
      setDeleting("");
    }
  };

  /** Edit an existing student, teacher or parent. Only sends changed fields. */
  const EditModal=({type,record})=>{
    const[f,setF]=useState({
      name:record.name??"",
      email:record.email??"",
      phone:record.phone??"",
      grade:record.grade??"",
      section:record.section??"",
      roll:record.roll??"",
      rel:record.rel??"",
    });
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    const[saving,setSaving]=useState(false);
    const[err,setErr]=useState("");

    const save=async()=>{
      setSaving(true);setErr("");
      try{
        const payload=type==="Student"
          ? {name:f.name,grade:f.grade,section:f.section,rollNo:f.roll,phone:f.phone||null}
          : type==="Teacher"
            ? {name:f.name,email:f.email,phone:f.phone||null}
            : {name:f.name,email:f.email,phone:f.phone||null,...(f.rel&&{relation:f.rel})};
        await API_FOR[type].update(record.id,payload);
        setEditing(null);
        onReload?.();
      }catch(e){
        setErr(e.errors?.[0]?.message||e.message||"Could not save changes.");
      }finally{
        setSaving(false);
      }
    };

    return(
      <Modal title={`Edit ${type} — ${record.name}`} onClose={()=>setEditing(null)} width={500}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Inp label="Full Name*" value={f.name} onChange={e=>s("name",e.target.value)} style={{gridColumn:"1/-1"}}/>
          {type!=="Student"&&<Inp label="Email*" value={f.email} onChange={e=>s("email",e.target.value)} type="email"/>}
          <Inp label="Phone" value={f.phone} onChange={e=>s("phone",e.target.value)} placeholder="03001234567" maxLength={11}/>
          {type==="Student"&&<>
            <Inp label="Grade*" value={f.grade} onChange={e=>s("grade",e.target.value)}/>
            <Inp label="Section*" value={f.section} onChange={e=>s("section",e.target.value)}/>
            <Inp label="Roll No.*" value={f.roll} onChange={e=>s("roll",e.target.value)} style={{gridColumn:"1/-1"}}/>
          </>}
          {type==="Parent"&&<Sel label="Relation" options={["Mother","Father","Guardian"]} value={f.rel} onChange={e=>s("rel",e.target.value)}/>}
        </div>
        {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={()=>setEditing(null)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={save} style={{flex:2,padding:"11px"}} disabled={!f.name||saving}>{saving?"Saving…":"Save Changes"}</Btn>
        </div>
      </Modal>
    );
  };

  /**
   * Live subscription card. Everything here reads and writes
   * /institutes/me/subscription — the same record the backend enforces
   * student limits against, so an upgrade takes effect immediately rather
   * than living in React state.
   */
  const SubscriptionCard=()=>{
    const[busy,setBusy]=useState("");
    const[e2,setE2]=useState("");
    const[picking,setPicking]=useState(false);
    const[limitDraft,setLimitDraft]=useState(String(sub?.customLimit??""));

    if(!sub) return (
      <Crd style={{padding:"26px"}}>
        <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:8}}>Current Subscription</div>
        <div style={{fontSize:13,color:T.muted}}>Loading subscription…</div>
      </Crd>
    );

    const act=async(key,fn,confirmMsg)=>{
      if(confirmMsg&&!window.confirm(confirmMsg))return;
      setBusy(key);setE2("");
      try{
        const r=await fn();
        setPNote(r?.__message??"Subscription updated.");
        setPicking(false);
        onReload?.();
      }catch(x){
        setE2(x.errors?.[0]?.message||x.message||"That didn't work.");
      }finally{
        setBusy("");
      }
    };

    const choosePlan=p=>act(`plan-${p.id}`,async()=>{
      await api.institutes.changeMyPlan(p.id);
      return {__message:`Switched to the ${p.name} plan.`};
    },`Switch to the ${p.name} plan?\n\nRs. ${p.price.toLocaleString()}/month · up to ${p.maxStudents.toLocaleString()} students.\n\nYour new student limit applies immediately. No data is affected.`);

    const saveLimit=()=>act("limit",async()=>{
      const v=limitDraft.trim()===""?null:Number(limitDraft);
      if(v!==null&&(!Number.isInteger(v)||v<1)) throw new Error("Student limit must be a whole number of at least 1.");
      await api.institutes.changeMyStudentLimit(v);
      return {__message:v===null?"Limit now follows your plan.":`Student limit set to ${v}.`};
    });

    const cancel=()=>act("cancel",async()=>{
      const r=await api.institutes.cancelMySubscription();
      return {__message:`Cancelled. Active until ${new Date(r.subscriptionEndsAt).toDateString()} — no data is removed.`};
    },`Cancel your subscription?\n\n• ${inst.name} keeps working until the end of the current period\n• Nothing is deleted — students, staff, marks and fees all stay\n• You can resume any time before it ends\n\nContinue?`);

    const resume=()=>act("resume",async()=>{
      await api.institutes.resumeMySubscription();
      return {__message:"Subscription resumed."};
    });

    const pct=sub.studentLimit>0?Math.min(100,(sub.seatsUsed/sub.studentLimit)*100):0;
    const unlimited=sub.studentLimit>=9999;

    return(
      <Crd style={{padding:"26px"}}>
        <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:16}}>Current Subscription</div>

        <div style={{padding:"18px",background:G(`${T.forest}15`,`${T.mint}15`),borderRadius:14,marginBottom:16,border:`1px solid ${T.forest}25`}}>
          <div style={{fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Active Plan</div>
          <div style={{fontFamily:"Georgia,serif",fontSize:26,fontWeight:800,color:T.forest}}>{sub.plan?.name}</div>
          <div style={{fontSize:13,color:T.muted,marginTop:4}}>
            Rs. {sub.plan?.price.toLocaleString()}/month · plan allows {sub.plan?.maxStudents>=9999?"unlimited":sub.plan?.maxStudents.toLocaleString()} students
          </div>
          <div style={{marginTop:12}}>
            <div style={{fontSize:11,color:T.muted,marginBottom:4}}>
              Usage: {sub.seatsUsed}/{unlimited?"∞":sub.studentLimit} students
              {sub.customLimit!=null&&sub.customLimit<(sub.plan?.maxStudents??0)&&
                <span style={{color:T.warning,fontWeight:600}}> · custom limit</span>}
            </div>
            {!unlimited&&<Bar val={pct} color={pct>=90?T.danger:T.forest}/>}
          </div>
        </div>

        {sub.cancelAtPeriodEnd&&(
          <div style={{background:`${T.warning}12`,border:`1px solid ${T.warning}35`,borderRadius:11,padding:"12px 14px",marginBottom:14,fontSize:12.5,color:T.ink,lineHeight:1.6}}>
            <b style={{color:T.warning}}>Cancellation scheduled.</b> {inst.name} stays fully active until{" "}
            <b>{sub.subscriptionEndsAt?new Date(sub.subscriptionEndsAt).toDateString():"the end of the period"}</b>. No data has been removed.
          </div>
        )}

        {/* Adjust the cap within the plan — this is what the dashboard shows
            and what student creation is checked against. */}
        <div style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:14}}>
          <div style={{flex:1}}>
            <Inp label="Student Limit" value={limitDraft} onChange={e=>setLimitDraft(e.target.value)} type="number" min="1" placeholder={`Blank = plan max (${sub.plan?.maxStudents})`}/>
          </div>
          <Btn onClick={saveLimit} out color={T.forest} style={{padding:"10px 14px",fontSize:12,marginBottom:14}} disabled={busy==="limit"}>
            {busy==="limit"?"Saving…":"Save"}
          </Btn>
        </div>

        {e2&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:12.5,marginBottom:12,border:`1px solid ${T.danger}30`}}>{e2}</div>}

        {picking&&(
          <div style={{marginBottom:14,display:"flex",flexDirection:"column",gap:8}}>
            {(sub.availablePlans??[]).filter(p=>!p.isCurrent).map(p=>(
              <div key={p.id} style={{border:`1.5px solid ${p.selectable?T.border:`${T.danger}35`}`,borderRadius:12,padding:"12px 14px",opacity:p.selectable?1:.6}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                  <div>
                    <div style={{fontSize:13.5,fontWeight:700,color:T.ink}}>{p.name} {p.isUpgrade&&<span style={{fontSize:10,color:T.forest}}>↑ upgrade</span>}</div>
                    <div style={{fontSize:11.5,color:T.muted,marginTop:2}}>Rs. {p.price.toLocaleString()}/mo · {p.maxStudents>=9999?"unlimited":p.maxStudents.toLocaleString()} students</div>
                    {p.blockedReason&&<div style={{fontSize:11,color:T.danger,marginTop:4}}>{p.blockedReason}</div>}
                  </div>
                  <Btn onClick={()=>choosePlan(p)} out color={T.forest} style={{padding:"7px 13px",fontSize:11.5}} disabled={!p.selectable||busy===`plan-${p.id}`}>
                    {busy===`plan-${p.id}`?"…":"Select"}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}

        <Btn onClick={()=>setPicking(v=>!v)} full style={{marginBottom:10,padding:"11px"}}>
          {picking?"Hide Plans":"Change Plan"}
        </Btn>

        {sub.cancelAtPeriodEnd
          ? <Btn onClick={resume} out color={T.success} full style={{padding:"11px",fontSize:13}} disabled={busy==="resume"}>{busy==="resume"?"Resuming…":"Resume Subscription"}</Btn>
          : <Btn onClick={cancel} out color={T.danger} full style={{padding:"11px",fontSize:13}} disabled={busy==="cancel"}>{busy==="cancel"?"Cancelling…":"Cancel Subscription"}</Btn>}
      </Crd>
    );
  };

  /**
   * Notification preferences. These were decorative switches; each one now
   * gates the matching server-side action, and the card says which.
   */
  const NotificationSettingsCard=()=>{
    const[prefs,setPrefs]=useState(null);
    const[busy,setBusy]=useState("");
    const[e2,setE2]=useState("");
    const[saved,setSaved]=useState("");

    useEffect(()=>{
      let cancelled=false;
      api.institutes.notificationSettings()
        .then(r=>{if(!cancelled)setPrefs(r);})
        .catch(x=>{if(!cancelled)setE2(x.message||"Couldn't load notification settings.");});
      return()=>{cancelled=true;};
    },[]);

    const toggle=async p=>{
      setBusy(p.key);setE2("");setSaved("");
      // Optimistic flip, rolled back if the server refuses.
      setPrefs(list=>list.map(x=>x.key===p.key?{...x,enabled:!x.enabled}:x));
      try{
        const next=await api.institutes.updateNotificationSettings({[p.key]:!p.enabled});
        setPrefs(next);
        setSaved(`${p.label} ${!p.enabled?"enabled":"disabled"}.`);
        setTimeout(()=>setSaved(""),2500);
      }catch(x){
        setPrefs(list=>list.map(y=>y.key===p.key?{...y,enabled:p.enabled}:y));
        setE2(x.message||"Couldn't save that setting.");
      }finally{
        setBusy("");
      }
    };

    return(
      <Crd style={{padding:"26px"}}>
        <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:4}}>Notifications</div>
        <div style={{fontSize:12,color:T.muted,marginBottom:16,lineHeight:1.6}}>
          Each switch controls a real action on the server — turning one off stops it being sent.
        </div>

        {!prefs&&!e2&&<div style={{fontSize:13,color:T.muted,padding:"8px 0"}}>Loading…</div>}

        {prefs?.map(p=>(
          <div key={p.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,padding:"11px 0",borderBottom:`1px solid ${T.border}`,opacity:busy===p.key?.6:1}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:13,color:T.ink,fontWeight:600}}>{p.label}</div>
              <div style={{fontSize:11.5,color:T.muted,marginTop:2,lineHeight:1.5}}>{p.description}</div>
            </div>
            <span onClick={()=>!busy&&toggle(p)} style={{cursor:busy?"default":"pointer",flexShrink:0}}>
              <Toggle on={p.enabled}/>
            </span>
          </div>
        ))}

        {saved&&<div style={{fontSize:12,color:T.success,marginTop:12,fontWeight:600}}>{saved}</div>}
        {e2&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:12.5,marginTop:12,border:`1px solid ${T.danger}30`}}>{e2}</div>}
      </Crd>
    );
  };

  /** Edit an existing notice. The API re-checks institute ownership. */
  const EditNoticeModal=({notice})=>{
    const CAT_LABEL={Academic:"ACADEMIC",Finance:"FINANCE",Event:"EVENT",General:"GENERAL",Urgent:"URGENT"};
    const[f,setF]=useState({title:notice.title,body:notice.body,cat:notice.cat||"General"});
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    const[saving,setSaving]=useState(false);
    const[e2,setE2]=useState("");

    const save=async()=>{
      if(!f.title.trim()||!f.body.trim()){setE2("Title and message are both required.");return;}
      setSaving(true);setE2("");
      try{
        await api.notices.update(notice.id,{
          title:f.title.trim(),
          body:f.body.trim(),
          category:CAT_LABEL[f.cat]??"GENERAL",
        });
        setEditNotice(null);
        setPNote(`"${f.title.trim()}" updated.`);
        onReload?.();
      }catch(x){
        setE2(x.errors?.[0]?.message||x.message||"Could not update the notice.");
      }finally{
        setSaving(false);
      }
    };

    return(
      <Modal title="Edit Notice" onClose={()=>setEditNotice(null)}>
        <Inp label="Title*" value={f.title} onChange={e=>s("title",e.target.value)}/>
        <Sel label="Category" options={["Academic","Finance","Event","General","Urgent"]} value={f.cat} onChange={e=>s("cat",e.target.value)}/>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:".6px"}}>Message*</div>
          <textarea rows={4} value={f.body} onChange={e=>s("body",e.target.value)} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,resize:"none",outline:"none",fontFamily:"inherit"}}/>
        </div>
        {e2&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{e2}</div>}
        <div style={{display:"flex",gap:10,marginTop:4}}>
          <Btn onClick={()=>setEditNotice(null)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={save} style={{flex:2,padding:"11px"}} disabled={!f.title.trim()||!f.body.trim()||saving}>{saving?"Saving…":"Save Changes"}</Btn>
        </div>
      </Modal>
    );
  };

  const UserModal=({type})=>{
    const[f,setF]=useState({name:"",email:"",phone:"",grade:"",section:"",roll:"",subject:"",rel:"",child:""});
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    const subjectOptions=["Mathematics","Physics","Chemistry","Biology","English","Urdu","Computer Sc.","Pak. Studies"];
    const[saving,setSaving]=useState(false);
    const[err,setErr]=useState("");

    // Same rules the API enforces, surfaced before a round-trip. A student
    // needs no email (they never get an account); staff and guardians do.
    const vName  = f.name  ? nameError(f.name, `${type} name`) : "";
    const vEmail = f.email ? emailError(f.email,{required:type!=="Student"}) : "";
    const vPhone = f.phone ? phoneError(f.phone,{required:false}) : "";
    const formOk =
      !nameError(f.name, `${type} name`) && !vPhone && !vEmail &&
      (type==="Student" ? Boolean(f.grade.trim()&&f.roll.trim()) : !emailError(f.email));

    const create=async()=>{
      setSaving(true);setErr("");
      try{
        if(type==="Student"){
          await api.students.create({
            name:f.name,
            grade:f.grade||"Grade 1",
            section:f.section||"A",
            rollNo:f.roll||`${new Date().getFullYear()}-${Math.floor(Math.random()*900+100)}`,
            ...(f.phone&&{phone:f.phone}),
          });
        }else if(type==="Teacher"){
          // The form picks a subject by name; resolve it to an id in this
          // institute, creating the subject if the school doesn't teach it yet.
          let subjectIds=[];
          if(f.subject){
            const existing=await api.subjects.list({search:f.subject});
            const match=existing.find(x=>x.name===f.subject);
            const subject=match||await api.subjects.create({name:f.subject});
            subjectIds=[subject.id];
          }
          await api.teachers.create({
            name:f.name,email:f.email,
            ...(f.phone&&{phone:f.phone}),
            ...(f.subject&&{designation:`${f.subject} Teacher`}),
            createLogin:true,
            ...(subjectIds.length&&{subjectIds}),
          });
        }else{
          await api.parents.create({
            name:f.name,email:f.email,
            ...(f.phone&&{phone:f.phone}),
            ...(f.rel&&{relation:f.rel}),
            ...(f.child&&{studentIds:[f.child]}),
            createLogin:true,
          });
        }
        setModal(null);
        onReload?.();
      }catch(e){
        setErr(e.errors?.[0]?.message||e.message||`Could not create ${type.toLowerCase()}.`);
      }finally{
        setSaving(false);
      }
    };

    return(
      <Modal title={`Add New ${type}`} onClose={()=>setModal(null)} width={500}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Inp label="Full Name*" value={f.name} onChange={e=>s("name",e.target.value)} placeholder={type==="Student"?"Zain Ahmed":type==="Teacher"?"Mr. Hassan":"Sara Ahmed"} style={{gridColumn:"1/-1"}}/>
          <Inp label="Email*" value={f.email} onChange={e=>s("email",e.target.value)} placeholder="email@example.com" type="email"/>
          <Inp label="Phone" value={f.phone} onChange={e=>s("phone",e.target.value)} placeholder="03001234567" maxLength={11}/>
          {type==="Student"&&<>
            <Inp label="Grade*" value={f.grade} onChange={e=>s("grade",e.target.value)} placeholder="Grade 8"/>
            <Inp label="Section" value={f.section} onChange={e=>s("section",e.target.value)} placeholder="A"/>
            <Inp label="Roll No.*" value={f.roll} onChange={e=>s("roll",e.target.value)} placeholder="2024-001" style={{gridColumn:"1/-1"}}/>
          </>}
          {type==="Teacher"&&<Sel label="Subject*" options={subjectOptions} value={f.subject} onChange={e=>s("subject",e.target.value)} style={{gridColumn:"1/-1"}}/>}
          {type==="Parent"&&<>
            <Sel label="Relation" options={["Mother","Father","Guardian"]} value={f.rel} onChange={e=>s("rel",e.target.value)}/>
            <Sel label="Child (Student)" options={students.map(st=>({v:st.id,l:st.name}))} value={f.child} onChange={e=>s("child",e.target.value)}/>
          </>}
        </div>
        <div style={{background:`${T.forest}10`,borderRadius:12,padding:"13px 16px",marginBottom:16,border:`1px solid ${T.forest}25`}}>
          {/* Students are records, not users of the app — only teachers and
              parents get accounts. The backend never creates a student login. */}
          <div style={{fontSize:12,color:T.forest,fontWeight:700,marginBottom:3}}>
            {type==="Student"?"👤 Student Record":"🔑 Auto-generated Login"}
          </div>
          <div style={{fontSize:12,color:T.muted}}>
            {type==="Student"
              ? <>Students don't sign in to EduConnect. Their academic information is accessed by the linked <b>parent/guardian</b> account. Any email you enter is stored as contact information only.</>
              : <>A login email and temporary password will be generated and sent to <b>{f.email||"the provided email"}</b>.</>}
          </div>
        </div>
        {[vName,vEmail,vPhone].filter(Boolean).map(m=>(
          <div key={m} style={{background:`${T.danger}0D`,color:T.danger,borderRadius:9,padding:"8px 12px",fontSize:12,marginBottom:8,border:`1px solid ${T.danger}25`}}>{m}</div>
        ))}
        {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={()=>setModal(null)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={create} style={{flex:2,padding:"11px"}} disabled={!formOk||saving}>
            {saving?"Creating…":type==="Student"?"Add Student":"Create & Send Login"}
          </Btn>
        </div>
      </Modal>
    );
  };

  return(
    <Shell nav={nav} tab={tab} setTab={setTab} user={user} inst={inst} collapsed={col} setCollapsed={setCol} onLogout={onLogout}>
      <PortalFeedback/>
      {/* DASHBOARD */}
      {tab==="dashboard"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre={inst.name} title="Admin Dashboard"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
            <KPI label="Students" value={seatsUsed} color={T.forest} icon="◈" sub={isUnlimited?"Unlimited":`${studentLimit} limit`}/>
            <KPI label="Teachers" value={inst.teachers} color={T.purple} icon="◉" sub="Active staff"/>
            <KPI label="Parents" value={parents.length} color={T.blue} icon="◎" sub="Registered"/>
            <KPI label="Plan" value={plan?.name} color={T.gold} icon="◑" sub={`Rs. ${plan?.price.toLocaleString()}/mo`}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 300px",gap:18}}>
            <Crd style={{padding:"24px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink}}>Students</div>
                <Btn onClick={()=>setModal("Student")} style={{padding:"7px 14px",fontSize:12}}>+ Add</Btn>
              </div>
              {students.map(s=>(
                <div key={s.id} onClick={()=>setSelStu(selStu?.id===s.id?null:s)} style={{display:"flex",gap:12,alignItems:"center",padding:"11px 6px",borderBottom:`1px solid ${T.border}`,cursor:"pointer",background:selStu?.id===s.id?`${T.forest}05`:"transparent",borderRadius:selStu?.id===s.id?8:0}}>
                  <Av name={s.name} size={36} bg={`${T.forest}15`} color={T.forest} fs={12}/>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.ink}}>{s.name}</div><div style={{fontSize:11,color:T.muted}}>{s.grade} · Section {s.section} · Roll {s.roll}</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:700,color:T.forest}}>GPA {s.gpa}</div><div style={{fontSize:10,color:T.muted}}>Rank #{s.rank}</div></div>
                </div>
              ))}
              <Btn onClick={()=>setTab("students")} out color={T.forest} full style={{marginTop:14,padding:"9px",fontSize:12}}>View All Students →</Btn>
            </Crd>
            <Crd style={{padding:"24px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink}}>Teachers</div>
                <Btn onClick={()=>setModal("Teacher")} style={{padding:"7px 14px",fontSize:12}}>+ Add</Btn>
              </div>
              {teachers.map(t=>(
                <div key={t.id} style={{display:"flex",gap:12,alignItems:"center",padding:"11px 0",borderBottom:`1px solid ${T.border}`}}>
                  <Av name={t.name} size={36} bg={`${T.purple}15`} color={T.purple} fs={12}/>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.ink}}>{t.name}</div><div style={{fontSize:11,color:T.muted}}>{t.subject} · {t.students} students</div></div>
                  <Bdg label={`${t.classes.length} classes`} color={T.purple} bg={`${T.purple}15`}/>
                </div>
              ))}
              <Btn onClick={()=>setTab("teachers")} out color={T.purple} full style={{marginTop:14,padding:"9px",fontSize:12}}>View All Teachers →</Btn>
            </Crd>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Attendance Today</div>
                {/* Real figures from /dashboard/admin. A school with no register
                    taken today has nothing to show — say so rather than invent. */}
                {!todayMarked ? (
                  <div style={{textAlign:"center",padding:"18px 0"}}>
                    <div style={{fontSize:26,marginBottom:6,opacity:.35}}>◷</div>
                    <div style={{fontSize:12.5,color:T.muted,lineHeight:1.6}}>
                      {students.length===0
                        ? "No students enrolled yet."
                        : "Attendance hasn't been taken today."}
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{display:"flex",justifyContent:"center",marginBottom:12}}><Donut p={todayAtt.rate} color={T.forest} size={84}/></div>
                    <div style={{fontSize:12,color:T.muted,textAlign:"center",marginBottom:10}}>{todayAtt.rate}% of students present today</div>
                    {[["Present",todayAtt.present,T.success],["Absent",todayAtt.absent,T.danger],["Late",todayAtt.late,T.warning],["Leave",todayAtt.leave,T.muted]].map(([l,v,c])=>(
                      <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0"}}><div style={{display:"flex",gap:6,alignItems:"center"}}><div style={{width:7,height:7,borderRadius:"50%",background:c}}/><span style={{fontSize:12,color:T.muted}}>{l}</span></div><span style={{fontSize:12,fontWeight:700,color:c}}>{v}</span></div>
                    ))}
                  </>
                )}
              </Crd>
              <Crd style={{padding:"22px",border:`1.5px solid ${feeOutstanding>0?T.warning:T.success}44`}}>
                <div style={{fontSize:11,fontWeight:700,color:feeOutstanding>0?T.warning:T.success,textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>{feeOutstanding>0?"⚠ Fee Alert":"✓ Fees"}</div>
                <div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:T.ink}}>Rs. {feeOutstanding.toLocaleString()}</div>
                <div style={{fontSize:12,color:T.muted,marginTop:4}}>
                  {feeOutstanding>0
                    ? `Pending from ${unpaidStudents} student${unpaidStudents===1?"":"s"}`
                    : students.length===0 ? "No students enrolled yet" : "Everything collected"}
                </div>
                <Btn onClick={()=>setTab("fees")} full style={{marginTop:12,padding:"9px",fontSize:12}}>Manage Fees →</Btn>
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>Quick Actions</div>
                {[["+ Add Student","Student",T.forest],["+ Add Teacher","Teacher",T.purple],["+ Add Parent","Parent",T.blue]].map(([l,t,c])=>(
                  <Btn key={l} onClick={()=>setModal(t)} out color={c} full style={{marginBottom:8,padding:"9px",fontSize:12}}>{l}</Btn>
                ))}
              </Crd>
            </div>
          </div>
          {selStu&&(
            <Crd style={{marginTop:18,padding:"26px",border:`1.5px solid ${T.forest}30`,animation:"fadeUp .3s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
                <div style={{display:"flex",gap:14,alignItems:"center"}}>
                  <Av name={selStu.name} size={50} bg={G(T.forest,T.mint)} fs={17}/>
                  <div><div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:700,color:T.ink}}>{selStu.name}</div><div style={{fontSize:12,color:T.muted}}>{selStu.grade} · Section {selStu.section} · Roll {selStu.roll}</div></div>
                </div>
                <span onClick={()=>setSelStu(null)} style={{cursor:"pointer",color:T.muted,fontSize:22}}>×</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                {/* Every tile is a real figure from the students endpoint. The
                    fourth used to read a literal "82/100" AI score for every
                    student alike; the list payload carries no insight data, so
                    it now shows the subject average, which it does carry. */}
                {[["GPA",selStu.gpa,T.forest],["Rank",`#${selStu.rank}`,T.purple],["Attendance",`${selStu.att.present}%`,T.success],["Average",`${selStu.average}%`,T.gold]].map(([l,v,c])=>(
                  <div key={l} style={{padding:"12px",background:T.paper,borderRadius:12,textAlign:"center"}}>
                    <div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:c}}>{v}</div>
                    <div style={{fontSize:10,color:T.muted,marginTop:3}}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:12,fontWeight:700,color:T.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:".5px"}}>Subject Performance</div>
              {selStu.subjects.map((s,i)=>(
                <div key={i} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:T.muted}}>{s.name}</span><span style={{fontSize:12,fontWeight:700,color:s.color}}>{s.score}%</span></div>
                  <Bar val={s.score} color={s.color} delay={i*50}/>
                </div>
              ))}
            </Crd>
          )}
        </div>
      )}
      {/* STUDENTS */}
      {tab==="students"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Management" title="Students" action={<Btn onClick={()=>setModal("Student")} style={{marginBottom:4}}>+ Add Student</Btn>}/>
          <div style={{display:"grid",gridTemplateColumns:selStu?"1fr 370px":"1fr",gap:18}}>
            <Crd style={{padding:"26px"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Student","Grade","Roll No","GPA","Attendance","Fees","Status",""].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                <tbody>{students.map(s=>(
                  <tr key={s.id} onClick={()=>setSelStu(selStu?.id===s.id?null:s)} style={{borderBottom:`1px solid ${T.border}`,cursor:"pointer",background:selStu?.id===s.id?`${T.forest}07`:"transparent",transition:"background .1s"}}>
                    <td style={{padding:"12px"}}><div style={{display:"flex",gap:10,alignItems:"center"}}><Av name={s.name} size={32} bg={`${T.forest}18`} color={T.forest} fs={11}/><span style={{fontSize:13,fontWeight:600,color:T.ink}}>{s.name}</span></div></td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{s.grade} {s.section}</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{s.roll}</td>
                    <td style={{padding:"12px",fontSize:13,fontWeight:700,color:T.forest}}>{s.gpa}</td>
                    <td style={{padding:"12px",fontSize:13,color:s.att.present>=90?T.success:T.warning,fontWeight:600}}>{s.att.present}%</td>
                    <td style={{padding:"12px"}}><Bdg label={s.fees.some(f=>f.status==="pending")?"Pending":"Paid"} color={s.fees.some(f=>f.status==="pending")?T.warning:T.success} bg={s.fees.some(f=>f.status==="pending")?`${T.warning}15`:`${T.success}15`}/></td>
                    <td style={{padding:"12px"}}><Bdg label={s.status==="active"?"Active":s.status.charAt(0).toUpperCase()+s.status.slice(1)} color={s.status==="active"?T.success:T.muted} bg={s.status==="active"?`${T.success}15`:`${T.muted}15`}/></td>
                    <td style={{padding:"12px"}}><RowActions busy={deleting===s.id} onEdit={()=>setEditing({type:"Student",record:s})} onDelete={()=>removeRow("Student",s)}/></td>
                  </tr>
                ))}</tbody>
              </table>
            </Crd>
            {selStu&&(
              <Crd style={{padding:"24px",height:"fit-content",position:"sticky",top:20,animation:"fadeUp .3s"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
                  <div style={{display:"flex",gap:12,alignItems:"center"}}>
                    <Av name={selStu.name} size={44} bg={G(T.forest,T.mint)} fs={15}/>
                    <div><div style={{fontSize:15,fontWeight:700,color:T.ink}}>{selStu.name}</div><div style={{fontSize:11,color:T.muted}}>{selStu.grade} · {selStu.roll}</div></div>
                  </div>
                  <span onClick={()=>setSelStu(null)} style={{cursor:"pointer",color:T.muted,fontSize:20}}>×</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                  {[["GPA",selStu.gpa,T.forest],["Rank",`#${selStu.rank}`,T.purple],["Att.",`${selStu.att.present}%`,T.success],["Avg.",`${selStu.average}%`,T.gold]].map(([l,v,c])=>(
                    <div key={l} style={{padding:"10px",background:T.paper,borderRadius:10,textAlign:"center"}}>
                      <div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:800,color:c}}>{v}</div>
                      <div style={{fontSize:10,color:T.muted}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:8,textTransform:"uppercase",letterSpacing:".5px"}}>Subjects</div>
                {selStu.subjects.map((s,i)=>(
                  <div key={i} style={{marginBottom:9}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:T.muted}}>{s.name}</span><span style={{fontSize:12,fontWeight:700,color:s.color}}>{s.score}%</span></div>
                    <Bar val={s.score} color={s.color} delay={i*40}/>
                  </div>
                ))}
                {/* These three were decorative. Students have no login, so the
                    old "Reset PW" had nothing to reset — the guardian's account
                    is the one that exists, and that's what it offers now. */}
                <div style={{display:"flex",gap:8,marginTop:16}}>
                  <Btn out color={T.forest} onClick={()=>setEditing({type:"Student",record:selStu})} style={{flex:1,padding:"8px",fontSize:12}}>Edit</Btn>
                  {(()=>{
                    const guardian=parents.find(p=>p.id===selStu.parentId);
                    return guardian?.userId
                      ? <Btn out color={T.blue} onClick={()=>resetPw(guardian)} disabled={resetting===guardian.userId} style={{flex:1,padding:"8px",fontSize:12}}>
                          {resetting===guardian.userId?"…":"Guardian PW"}
                        </Btn>
                      : null;
                  })()}
                  <Btn out color={T.danger} onClick={()=>removeRow("Student",selStu)} disabled={deleting===selStu.id} style={{flex:1,padding:"8px",fontSize:12}}>
                    {deleting===selStu.id?"…":"Remove"}
                  </Btn>
                </div>
              </Crd>
            )}
          </div>
        </div>
      )}
      {/* TEACHERS */}
      {tab==="teachers"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Staff" title="Teachers" action={<Btn onClick={()=>setModal("Teacher")} style={{marginBottom:4}}>+ Add Teacher</Btn>}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
            {teachers.map(t=>(
              <Crd key={t.id} style={{padding:"24px"}}>
                <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:16}}>
                  <Av name={t.name} size={50} bg={G(T.purple,T.blue)} fs={16}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:700,color:T.ink}}>{t.name}</div>
                    <div style={{fontSize:12,color:T.muted,marginTop:2}}>{t.subject}</div>
                    <div style={{fontSize:11,color:T.muted}}>{t.email}</div>
                  </div>
                  {/* Coloured from the actual status — an inactive teacher used
                      to get a green "inactive" badge. */}
                  <Bdg label={t.status} color={t.status==="active"?T.success:T.muted} bg={t.status==="active"?`${T.success}15`:`${T.muted}15`}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
                  {[[t.classes.length,"Classes"],[t.students,"Students"],[t.subjects.length,"Subjects"]].map(([v,l])=>(
                    <div key={l} style={{padding:"10px",background:T.paper,borderRadius:10,textAlign:"center"}}>
                      <div style={{fontSize:17,fontWeight:800,color:T.ink}}>{v}</div>
                      <div style={{fontSize:10,color:T.muted}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:12,color:T.muted,marginBottom:14}}>Classes: {t.classes.join(", ")}</div>
                <div style={{display:"flex",gap:8}}>
                  <Btn out color={T.blue} onClick={()=>setEditing({type:"Teacher",record:t})} style={{flex:1,padding:"8px",fontSize:12}}>Edit Profile</Btn>
                  {t.userId&&<Btn out color={T.warning} onClick={()=>resetPw(t)} disabled={resetting===t.userId} style={{flex:1,padding:"8px",fontSize:12}}>{resetting===t.userId?"…":"Reset PW"}</Btn>}
                  <Btn out color={T.danger} onClick={()=>removeRow("Teacher",t)} disabled={deleting===t.id} style={{flex:1,padding:"8px",fontSize:12}}>{deleting===t.id?"…":"Remove"}</Btn>
                </div>
              </Crd>
            ))}
          </div>
        </div>
      )}
      {/* PARENTS */}
      {tab==="parents"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Community" title="Parents" action={<Btn onClick={()=>setModal("Parent")} style={{marginBottom:4}}>+ Add Parent</Btn>}/>
          <Crd style={{padding:"26px"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Parent","Relation","Child","Email","Phone","Actions"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
              <tbody>{parents.map(p=>{
                const child=students.find(s=>s.id===p.studentId);
                return(
                  <tr key={p.id} style={{borderBottom:`1px solid ${T.border}`}}>
                    <td style={{padding:"12px"}}><div style={{display:"flex",gap:10,alignItems:"center"}}><Av name={p.name} size={32} bg={`${T.blue}18`} color={T.blue} fs={11}/><span style={{fontSize:13,fontWeight:600,color:T.ink}}>{p.name}</span></div></td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{p.rel}</td>
                    <td style={{padding:"12px",fontSize:13,fontWeight:600,color:T.ink}}>{child?.name||"—"}</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{p.email}</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{p.phone}</td>
                    <td style={{padding:"12px"}}>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <span onClick={()=>setEditing({type:"Parent",record:p})} style={{cursor:"pointer"}}><Bdg label="Edit" color={T.forest} bg={`${T.forest}15`}/></span>
                        {p.userId&&<span onClick={()=>resetPw(p)} style={{cursor:resetting===p.userId?"wait":"pointer"}}><Bdg label={resetting===p.userId?"…":"Reset PW"} color={T.warning} bg={`${T.warning}15`}/></span>}
                        <RowActions busy={deleting===p.id} onEdit={()=>setEditing({type:"Parent",record:p})} onDelete={()=>removeRow("Parent",p)}/>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </Crd>
        </div>
      )}
      {/* ATTENDANCE */}
      {tab==="attendance"&&<AdminAttendanceTab/>}
      {/* FEES */}
      {tab==="fees"&&<FeesTab/>}
      {/* NOTICES */}
      {tab==="notices"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Communication" title="Notices" action={<Btn onClick={()=>setModal("notice")} style={{marginBottom:4}}>+ Post Notice</Btn>}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
            {notices.map(n=>(
              <Crd key={n.id} style={{padding:"24px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                  <Bdg label={n.cat} color={catC(n.cat)} bg={`${catC(n.cat)}15`}/>
                  <span style={{fontSize:12,color:T.muted}}>{n.date}</span>
                </div>
                <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:T.ink,marginBottom:8,lineHeight:1.3}}>{n.title}</div>
                <p style={{fontSize:13,color:T.muted,lineHeight:1.7,marginBottom:14}}>{n.body}</p>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span onClick={()=>setEditNotice(n)} style={{cursor:"pointer"}}>
                    <Bdg label="Edit" color={T.forest} bg={`${T.forest}15`}/>
                  </span>
                  <span onClick={()=>removeNotice(n)} style={{cursor:noticeBusy===n.id?"default":"pointer",opacity:noticeBusy===n.id?.5:1}}>
                    <Bdg label={noticeBusy===n.id?"Deleting…":"Delete"} color={T.danger} bg={`${T.danger}15`}/>
                  </span>
                </div>
              </Crd>
            ))}
          </div>
        </div>
      )}
      {/* REPORTS */}
      {tab==="reports"&&<ReportsTab/>}
      {/* SETTINGS */}
      {tab==="settings"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Configuration" title="Institute Settings"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
            <InstituteSettingsCard/>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <SubscriptionCard/>
              <NotificationSettingsCard/>
            </div>
          </div>
        </div>
      )}
      {modal&&["Student","Teacher","Parent"].includes(modal)&&<UserModal type={modal}/>}
      {modal==="notice"&&<NoticeModal/>}
      {editNotice&&<EditNoticeModal notice={editNotice}/>}
      {editing&&<EditModal type={editing.type} record={editing.record}/>}

      {/* Row-action feedback — fixed so it's visible whichever tab you're on. */}
      {(rowErr||rowNote)&&(
        <div style={{position:"fixed",right:22,bottom:22,maxWidth:400,zIndex:60,animation:"fadeUp .25s"}}>
          <div style={{background:rowErr?`${T.danger}f0`:`${T.success}f0`,color:"#fff",borderRadius:12,padding:"13px 16px",fontSize:13,lineHeight:1.6,boxShadow:"0 12px 36px rgba(0,0,0,.24)"}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{flex:1,wordBreak:"break-word"}}>{rowErr||rowNote}</span>
              <span onClick={()=>{setRowErr("");setRowNote("");}} style={{cursor:"pointer",opacity:.8,fontSize:16,lineHeight:1}}>×</span>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
};

// ═══════════════════════════════════════════════════════════════════
// TEACHER PORTAL
// ═══════════════════════════════════════════════════════════════════
const TEACHER_TABS=["dashboard","classes","gradebook","attendance","messages","notices","profile"];

const TeacherPortal=({user,db,onLogout,onReload,onUser})=>{
  const[tab,setTab]=useHashTab("dashboard",TEACHER_TABS);
  const[col,setCol]=useState(false);
  const[selMsg,setSelMsg]=useState(null);
  const[reply,setReply]=useState("");
  const[replyBusy,setReplyBusy]=useState(false);
  const[replySent,setReplySent]=useState("");
  // Portal-level so it survives the remount that follows a profile save.
  const[profileNote,setProfileNote]=useState("");
  const[modal,setModal]=useState(null);
  const inst=db.institutes.find(i=>i.id===user.inst)||db.institutes[0];
  const teacher=db.teachers.find(t=>t.id===user.ref)||db.teachers[0];
  const myStudents=db.students.filter(s=>s.instId===user.inst);
  const msgs=db.messages.filter(m=>m.instId===user.inst);
  const notices=db.notices.filter(n=>n.instId===user.inst);
  const mySubjects=db.teacherDashboard?.subjects??[];
  const todaySchedule=db.teacherDashboard?.todaySchedule??[];
  // Weakest and strongest of this teacher's students, by overall average.
  /**
   * A subject this teacher actually teaches, on a given student.
   *
   * Matched on teacherId, not the display name: the student list used to omit
   * the subject's teacher entirely, so this filter silently matched nothing
   * and left the dashboard roster, quick-grade panel and grade book blank.
   */
  const mySubjectOf=s=>s.subjects.find(x=>x.teacherId&&x.teacherId===teacher?.id);
  const ranked=[...myStudents].filter(s=>s.average>0).sort((a,b)=>a.average-b.average);

  /**
   * Reply to a message. This used to clear the input and nothing else, so the
   * teacher saw their message vanish and assumed it had been sent.
   */
  const sendReply=async()=>{
    if(!reply.trim()||!selMsg||replyBusy)return;
    const body=reply;
    setReply("");setReplyBusy(true);setReplySent("");
    try{
      await api.messages.reply(selMsg.id,body);
      setReplySent(`Reply sent to ${selMsg.from}.`);
      setTimeout(()=>setReplySent(""),2500);
      onReload?.();
    }catch(e){
      setReply(body); // don't lose what they typed
      setReplySent(e.message||"Could not send the reply.");
    }finally{
      setReplyBusy(false);
    }
  };

  /** Opening a message marks it read, so the sidebar badge means something. */
  const openMessage=async m=>{
    setSelMsg(m);
    if(!m.unread)return;
    try{
      await api.messages.markRead(m.id);
      onReload?.();
    }catch{/* a failed read receipt shouldn't block reading the message */}
  };

  // Quick grade entry — writes the enrolment's current score. The server
  // recomputes letter grade and prediction from it, so nothing is derived here.
  const[quickScores,setQuickScores]=useState({});
  const[quickBusy,setQuickBusy]=useState("");
  const[quickMsg,setQuickMsg]=useState(null);

  const saveQuickScore=async(sub,student)=>{
    const raw=quickScores[sub.enrollmentId];
    const value=Number(raw);
    if(raw===undefined||raw===""||!Number.isFinite(value)||value<0||value>100){
      setQuickMsg({bad:true,text:"Score must be a number between 0 and 100."});
      return;
    }
    setQuickBusy(sub.enrollmentId);setQuickMsg(null);
    try{
      await api.subjects.updateEnrollment(sub.enrollmentId,{currentScore:value});
      setQuickMsg({bad:false,text:`${student.name} — ${sub.name} updated to ${value}%.`});
      setQuickScores(v=>{const{[sub.enrollmentId]:_,...rest}=v;return rest;});
      onReload?.();
    }catch(e){
      setQuickMsg({bad:true,text:e.errors?.[0]?.message||e.message||"Could not save that score."});
    }finally{
      setQuickBusy("");
    }
  };
  const atRisk=ranked.find(s=>s.average<70||s.att.rate<85)??null;
  const topPerformer=ranked[ranked.length-1]??null;


  // Distinct classes this teacher actually teaches, from their own roster.
  const myClasses=[...new Map(
    myStudents.map(s=>[`${s.grade}|${s.section}`,{grade:s.grade,section:s.section}])
  ).values()].sort((a,b)=>`${a.grade}${a.section}`.localeCompare(`${b.grade}${b.section}`,undefined,{numeric:true}));

  /**
   * Per-subject class breakdown with real rosters, averages, attendance and
   * assessment counts. One teacher can teach the same class for two subjects,
   * so these are keyed by subject *and* class rather than class alone.
   */
  const classCards=db.myClasses??[];

  // Headline averages, computed per student so they don't drift from the
  // per-class figures shown on the "My Classes" cards.
  const mean=(nums)=>nums.length?Math.round(nums.reduce((a,b)=>a+b,0)/nums.length):0;
  const avgScore=mean(myStudents.filter(s=>s.average>0).map(s=>s.average));
  const avgAttendance=mean(myStudents.filter(s=>s.att.days>0).map(s=>s.att.rate));
  // Set when the teacher drills into a class from the "My Classes" tab, so the
  // register and grade book open on that class instead of the first one.
  const[focusClass,setFocusClass]=useState(null);
  const[openRoster,setOpenRoster]=useState(null);

  /**
   * Daily register. Loads whatever is already recorded for the chosen class
   * and date, so re-opening it shows the existing marks rather than a blank
   * sheet — submitting again corrects them instead of erroring.
   */
  const AttendanceRegister=()=>{
    const[cls,setCls]=useState(
      focusClass??(myClasses[0]?`${myClasses[0].grade}|${myClasses[0].section}`:"")
    );
    const[date,setDate]=useState(new Date().toISOString().slice(0,10));
    const[register,setRegister]=useState(null);
    const[marks,setMarks]=useState({});
    const[loading,setLoading]=useState(false);
    const[saving,setSaving]=useState(false);
    const[err,setErr]=useState("");
    const[saved,setSaved]=useState("");

    useEffect(()=>{
      if(!cls)return;
      const[grade,section]=cls.split("|");
      let cancelled=false;
      setLoading(true);setErr("");setSaved("");
      api.attendance.register(grade,section,date)
        .then(r=>{
          if(cancelled)return;
          setRegister(r);
          // Pre-fill from what's already saved; default the rest to present.
          setMarks(Object.fromEntries(r.students.map(s=>[s.id,s.status??"PRESENT"])));
        })
        .catch(e=>{if(!cancelled)setErr(e.message);})
        .finally(()=>{if(!cancelled)setLoading(false);});
      return()=>{cancelled=true;};
    },[cls,date]);

    const setAll=status=>setMarks(m=>Object.fromEntries(Object.keys(m).map(k=>[k,status])));

    const save=async()=>{
      setSaving(true);setErr("");setSaved("");
      try{
        const res=await api.attendance.markBulk(
          date,
          Object.entries(marks).map(([studentId,status])=>({studentId,status}))
        );
        setSaved(`Saved for ${res.marked} student(s).`);
        onReload?.();
      }catch(e){
        setErr(e.errors?.[0]?.message||e.message||"Could not save attendance.");
      }finally{
        setSaving(false);
      }
    };

    const counts=Object.values(marks).reduce((a,s)=>({...a,[s]:(a[s]||0)+1}),{});

    return(
      <div style={{animation:"fadeUp .35s"}}>
        <SecHead pre="Tracking" title="Take Attendance"/>
        <Crd style={{padding:"26px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:18,gap:14,flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:12,alignItems:"flex-end"}}>
              <div style={{minWidth:170}}>
                <Sel label="Class" options={myClasses.map(c=>({v:`${c.grade}|${c.section}`,l:`${c.grade} — Section ${c.section}`}))} value={cls} onChange={e=>setCls(e.target.value)}/>
              </div>
              <div style={{minWidth:150}}>
                <Inp label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
              </div>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
              {register?.alreadyMarked&&<Bdg label="Already marked — editing" color={T.blue} bg={`${T.blue}15`}/>}
              <Btn out color={T.success} onClick={()=>setAll("PRESENT")} style={{padding:"7px 14px",fontSize:12}}>Mark All Present</Btn>
            </div>
          </div>

          {loading&&<div style={{fontSize:13,color:T.muted,padding:"14px 0"}}>Loading register…</div>}
          {!loading&&!register?.students?.length&&<div style={{fontSize:13,color:T.muted,padding:"14px 0"}}>No active students in this class.</div>}

          {!loading&&register?.students?.map(s=>(
            <div key={s.id} style={{display:"flex",gap:14,alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${T.border}`}}>
              <Av name={s.name} size={36} bg={`${T.forest}15`} color={T.forest} fs={12}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:T.ink}}>{s.name}</div>
                <div style={{fontSize:11,color:T.muted}}>{s.rollNo}</div>
              </div>
              <div style={{display:"flex",gap:8}}>
                {[["Present","PRESENT",T.success],["Absent","ABSENT",T.danger],["Late","LATE",T.warning],["Leave","LEAVE",T.muted]].map(([l,sv,c])=>(
                  <span key={sv} onClick={()=>setMarks(m=>({...m,[s.id]:sv}))}
                    style={{padding:"7px 14px",borderRadius:99,fontSize:12,fontWeight:600,cursor:"pointer",background:marks[s.id]===sv?c:"transparent",color:marks[s.id]===sv?"#fff":c,border:`1.5px solid ${c}`,transition:"all .15s"}}>{l}</span>
                ))}
              </div>
            </div>
          ))}

          {register?.students?.length>0&&(
            <div style={{display:"flex",gap:14,marginTop:16,fontSize:12,color:T.muted}}>
              <span style={{color:T.success,fontWeight:600}}>{counts.PRESENT||0} present</span>
              <span style={{color:T.danger,fontWeight:600}}>{counts.ABSENT||0} absent</span>
              <span style={{color:T.warning,fontWeight:600}}>{counts.LATE||0} late</span>
              {counts.LEAVE>0&&<span style={{fontWeight:600}}>{counts.LEAVE} on leave</span>}
            </div>
          )}

          {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginTop:14,border:`1px solid ${T.danger}30`}}>{err}</div>}
          {saved&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"10px 14px",fontSize:13,marginTop:14,border:`1px solid ${T.success}30`}}>✓ {saved}</div>}

          <Btn full onClick={save} disabled={saving||loading||!register?.students?.length} style={{marginTop:18,padding:"12px"}}>{saving?"Saving…":"Save Attendance"}</Btn>
        </Crd>
      </div>
    );
  };

  /** Marks entry: pick a subject, then type a mark for each enrolled student. */
  const AssessmentModal=()=>{
    const[f,setF]=useState({
      subjectId:mySubjects[0]?.id??"",
      title:"",type:"QUIZ",total:"20",
      takenOn:new Date().toISOString().slice(0,10),
    });
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    const[roster,setRoster]=useState([]);
    const[marks,setMarks]=useState({});
    const[loadingRoster,setLoadingRoster]=useState(false);
    const[saving,setSaving]=useState(false);
    const[err,setErr]=useState("");

    // Pull the class list whenever the chosen subject changes.
    useEffect(()=>{
      if(!f.subjectId){setRoster([]);return;}
      let cancelled=false;
      setLoadingRoster(true);
      api.subjects.get(f.subjectId)
        .then(sub=>{if(!cancelled){setRoster(sub.enrollments??[]);setMarks({});}})
        .catch(e=>{if(!cancelled)setErr(e.message);})
        .finally(()=>{if(!cancelled)setLoadingRoster(false);});
      return()=>{cancelled=true;};
    },[f.subjectId]);

    const save=async()=>{
      const results=roster
        .filter(r=>marks[r.student.id]!==undefined&&marks[r.student.id]!=="")
        .map(r=>({studentId:r.student.id,obtained:Number(marks[r.student.id])}));

      if(!results.length){setErr("Enter a mark for at least one student.");return;}

      setSaving(true);setErr("");
      try{
        await api.assessments.bulkCreate({
          subjectId:f.subjectId,
          title:f.title,
          type:f.type,
          total:Number(f.total),
          takenOn:f.takenOn,
          results,
        });
        setModal(null);
        onReload?.();
      }catch(e){
        setErr(e.errors?.[0]?.message||e.message||"Could not save the assessment.");
      }finally{
        setSaving(false);
      }
    };

    return(
      <Modal title="Add New Assessment" onClose={()=>setModal(null)} width={520}>
        <Inp label="Assessment Title*" value={f.title} onChange={e=>s("title",e.target.value)} placeholder="e.g. Quiz 3 / Test 2 / Project"/>
        <Sel label="Subject*" options={mySubjects.map(x=>({v:x.id,l:`${x.name}${x.grade?` — ${x.grade}`:""}`}))} value={f.subjectId} onChange={e=>s("subjectId",e.target.value)}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <Sel label="Type" options={["QUIZ","TEST","ASSIGNMENT","PROJECT","LAB","EXAM"]} value={f.type} onChange={e=>s("type",e.target.value)}/>
          <Inp label="Date" value={f.takenOn} onChange={e=>s("takenOn",e.target.value)} type="date"/>
          <Inp label="Total Marks*" value={f.total} onChange={e=>s("total",e.target.value)} type="number"/>
        </div>

        <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:".6px"}}>
          Marks {roster.length>0&&`(${roster.length} students)`}
        </div>
        <div style={{maxHeight:220,overflowY:"auto",border:`1.5px solid ${T.border}`,borderRadius:10,padding:"6px",marginBottom:14,background:T.paper}}>
          {loadingRoster&&<div style={{padding:"12px",fontSize:13,color:T.muted}}>Loading class list…</div>}
          {!loadingRoster&&!roster.length&&<div style={{padding:"12px",fontSize:13,color:T.muted}}>No students enrolled in this subject yet.</div>}
          {roster.map(r=>(
            <div key={r.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"6px 8px"}}>
              <div style={{fontSize:13,color:T.ink}}>
                {r.student.name}
                <span style={{color:T.muted,fontSize:11,marginLeft:6}}>{r.student.rollNo}</span>
              </div>
              <input
                type="number" min="0" max={f.total} placeholder="—"
                value={marks[r.student.id]??""}
                onChange={e=>setMarks(m=>({...m,[r.student.id]:e.target.value}))}
                style={{width:76,padding:"6px 10px",borderRadius:8,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.card,outline:"none",textAlign:"right"}}
              />
            </div>
          ))}
        </div>

        {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn onClick={()=>setModal(null)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={save} style={{flex:2,padding:"11px"}} disabled={!f.title||!f.subjectId||!f.total||saving}>{saving?"Saving…":"Create Assessment"}</Btn>
        </div>
      </Modal>
    );
  };

  /**
   * Grade book. One column per real assessment title in the chosen subject.
   *
   * The columns used to be a fixed "Quiz 1 / Quiz 2 / Test 1 / Test 2 / Project"
   * header row filled by arithmetic on the enrolment's current and previous
   * score — invented marks presented as if they had been graded. The API
   * already returns the actual per-assessment breakdown, so it drives this now.
   */
  const GradeBookTab=()=>{
    const[subjectId,setSubjectId]=useState(mySubjects[0]?.id??"");
    const[book,setBook]=useState(null);
    const[loading,setLoading]=useState(false);
    const[err,setErr]=useState("");

    useEffect(()=>{
      if(!subjectId){setBook(null);return;}
      let cancelled=false;
      setLoading(true);setErr("");
      api.assessments.gradebook({subjectId})
        .then(r=>{if(!cancelled)setBook(r);})
        .catch(e=>{if(!cancelled)setErr(e.message||"Could not load the grade book.");})
        .finally(()=>{if(!cancelled)setLoading(false);});
      return()=>{cancelled=true;};
    },[subjectId]);

    const cols=book?.columns??[];

    const exportCsv=()=>{
      if(!book?.rows?.length)return;
      downloadCsv(
        stamped(`gradebook-${book.subject.name.replace(/\W+/g,"-").toLowerCase()}`,"csv"),
        book.rows.map(r=>({
          roll:r.student.rollNo,name:r.student.name,
          ...Object.fromEntries(cols.map(c=>[c,r.marks[c]?`${r.marks[c].obtained}/${r.marks[c].total}`:""])),
          average:r.average??"",grade:r.letterGrade??"",trend:r.trend??"",
        })),
        [["Roll No","roll"],["Student","name"],...cols.map(c=>[c,c]),
          ["Average (%)","average"],["Grade","grade"],["Trend","trend"]]
      );
    };

    return(
      <div style={{animation:"fadeUp .35s"}}>
        <SecHead pre="Academic" title="Grade Book" action={
          <Btn onClick={()=>setModal("assessment")} style={{marginBottom:4}}>+ Add Assessment</Btn>
        }/>
        <Crd style={{padding:"26px"}}>
          <div style={{display:"flex",gap:12,alignItems:"flex-end",justifyContent:"space-between",flexWrap:"wrap",marginBottom:8}}>
            <div style={{minWidth:230}}>
              <Sel label="Subject" options={mySubjects.map(x=>({v:x.id,l:`${x.name}${x.grade?` — ${x.grade}`:""}`}))} value={subjectId} onChange={e=>setSubjectId(e.target.value)}/>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
              {book&&<Bdg label={`Class average ${book.classAverage??0}%`} color={T.forest} bg={`${T.forest}15`}/>}
              <Btn out color={T.blue} onClick={exportCsv} disabled={!book?.rows?.length} style={{padding:"7px 14px",fontSize:12}}>Export CSV</Btn>
            </div>
          </div>

          {!mySubjects.length&&<div style={{fontSize:13,color:T.muted,padding:"12px 0"}}>You aren't assigned to any subjects yet.</div>}
          {loading&&<div style={{fontSize:13,color:T.muted,padding:"12px 0"}}>Loading grade book…</div>}
          {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,border:`1px solid ${T.danger}30`}}>{err}</div>}

          {!loading&&!err&&book&&!book.rows.length&&(
            <div style={{fontSize:13,color:T.muted,padding:"12px 0"}}>No students are enrolled in this subject yet.</div>
          )}
          {!loading&&!err&&book?.rows?.length>0&&!cols.length&&(
            <div style={{fontSize:13,color:T.muted,padding:"12px 0",lineHeight:1.6}}>
              No assessments recorded for this subject yet. Use <b>+ Add Assessment</b> to enter the first set of marks.
            </div>
          )}

          {!loading&&!err&&book?.rows?.length>0&&cols.length>0&&(
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Student",...cols,"Avg.","Grade","Trend"].map(h=>(
                <th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>
              ))}</tr></thead>
              <tbody>{book.rows.map(r=>(
                <tr key={r.enrollmentId} style={{borderBottom:`1px solid ${T.border}`}}>
                  <td style={{padding:"12px"}}><div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <Av name={r.student.name} size={28} bg={`${T.purple}18`} color={T.purple} fs={10}/>
                    <span style={{fontSize:13,color:T.ink,fontWeight:600}}>{r.student.name}</span>
                  </div></td>
                  {cols.map(c=>{
                    const m=r.marks[c];
                    return(
                      <td key={c} style={{padding:"12px",fontSize:13,fontWeight:600,
                        color:!m?T.muted:m.percentage>=80?T.success:m.percentage>=60?T.warning:T.danger}}>
                        {m?`${m.obtained}/${m.total}`:"—"}
                      </td>
                    );
                  })}
                  <td style={{padding:"12px",fontSize:15,fontWeight:800,color:T.ink,fontFamily:"Georgia,serif"}}>{r.average!=null?`${Math.round(r.average)}%`:"—"}</td>
                  <td style={{padding:"12px"}}>{r.letterGrade?<Bdg label={r.letterGrade} color={gc(r.letterGrade)} bg={`${gc(r.letterGrade)}15`}/>:<span style={{fontSize:12,color:T.muted}}>—</span>}</td>
                  <td style={{padding:"12px",fontSize:13,fontWeight:600,color:r.trend>0?T.success:r.trend<0?T.danger:T.muted}}>
                    {r.trend>0?`↑ ${r.trend}`:r.trend<0?`↓ ${Math.abs(r.trend)}`:"—"}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Crd>
      </div>
    );
  };

  /**
   * Name and phone go to PATCH /auth/me. Email isn't editable here — it is the
   * sign-in identity and the API deliberately doesn't accept it on this route,
   * so the field is shown read-only rather than as a control that does nothing.
   */
  const EditProfileCard=()=>{
    const[f,setF]=useState({name:user.name??"",phone:user.phone??teacher?.phone??""});
    const[saving,setSaving]=useState(false);
    const[e2,setE2]=useState("");

    const vName=f.name?nameError(f.name,"Name"):"";
    const vPhone=f.phone?phoneError(f.phone,{required:false}):"";

    const save=async()=>{
      setSaving(true);setE2("");setProfileNote("");
      try{
        const updated=await api.auth.updateProfile({name:f.name.trim(),phone:f.phone.trim()||null});
        // Feedback lives on the portal, not here: pushing the new user up
        // re-runs the data load, which remounts this card and would wipe any
        // state it held.
        setProfileNote("Profile updated.");
        onUser?.({...user,...toLegacyUser(updated)});
      }catch(x){
        setE2(x.errors?.[0]?.message||x.message||"Could not update your profile.");
      }finally{
        setSaving(false);
      }
    };

    return(
      <Crd style={{padding:"26px"}}>
        <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Edit Profile</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Inp label="Full Name" value={f.name} onChange={e=>setF(v=>({...v,name:e.target.value}))}/>
          <Inp label="Phone" value={f.phone} onChange={e=>setF(v=>({...v,phone:e.target.value}))} placeholder="03001234567" maxLength={11}/>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:".6px"}}>Email</div>
          <div style={{padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.muted,background:T.paper}}>{teacher?.email||user.email}</div>
          <div style={{fontSize:11.5,color:T.muted,marginTop:5}}>Your sign-in address. Ask an admin to change it.</div>
        </div>
        {[vName,vPhone].filter(Boolean).map(m=>(
          <div key={m} style={{background:`${T.danger}0D`,color:T.danger,borderRadius:9,padding:"8px 12px",fontSize:12,marginBottom:8,border:`1px solid ${T.danger}25`}}>{m}</div>
        ))}
        {e2&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{e2}</div>}
        {profileNote&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.success}30`}}>✓ {profileNote}</div>}
        <Btn full onClick={save} disabled={saving||!f.name.trim()||Boolean(vName||vPhone)} style={{padding:"11px",marginTop:4}}>{saving?"Saving…":"Update Profile"}</Btn>
      </Crd>
    );
  };

  /** Change own password. The API signs out every other device on success. */
  const ChangePasswordCard=()=>{
    const[f,setF]=useState({current:"",next:"",confirm:""});
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    const[saving,setSaving]=useState(false);
    const[e2,setE2]=useState("");
    const[done,setDone]=useState("");

    const vNext=f.next?passwordError(f.next):"";
    const mismatch=f.confirm&&f.next!==f.confirm?"The two new passwords don't match.":"";

    const save=async()=>{
      setSaving(true);setE2("");setDone("");
      try{
        const r=await api.auth.changePassword(f.current,f.next);
        setF({current:"",next:"",confirm:""});
        setDone(r?.message||"Password changed. Your other devices have been signed out.");
      }catch(x){
        setE2(x.errors?.[0]?.message||x.message||"Could not change your password.");
      }finally{
        setSaving(false);
      }
    };

    return(
      <Crd style={{padding:"26px"}}>
        <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Change Password</div>
        <Inp label="Current Password" type="password" value={f.current} onChange={e=>s("current",e.target.value)} placeholder="••••••••"/>
        <Inp label="New Password" type="password" value={f.next} onChange={e=>s("next",e.target.value)} placeholder="Min 8 characters"/>
        <Inp label="Confirm New Password" type="password" value={f.confirm} onChange={e=>s("confirm",e.target.value)} placeholder="••••••••"/>
        {[vNext,mismatch].filter(Boolean).map(m=>(
          <div key={m} style={{background:`${T.danger}0D`,color:T.danger,borderRadius:9,padding:"8px 12px",fontSize:12,marginBottom:8,border:`1px solid ${T.danger}25`}}>{m}</div>
        ))}
        {e2&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{e2}</div>}
        {done&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.success}30`}}>✓ {done}</div>}
        <Btn full onClick={save} disabled={saving||!f.current||!f.next||!f.confirm||Boolean(vNext||mismatch)} style={{padding:"11px",marginTop:4}}>{saving?"Updating…":"Update Password"}</Btn>
      </Crd>
    );
  };

  const nav=[
    {id:"dashboard",label:"Dashboard",  icon:"⊞"},
    {id:"classes",  label:"My Classes", icon:"▦"},
    {id:"gradebook",label:"Grade Book", icon:"◈"},
    {id:"attendance",label:"Attendance",icon:"◷"},
    {id:"messages", label:"Messages",   icon:"◎",badge:msgs.filter(m=>m.unread).length},
    {id:"notices",  label:"Notices",    icon:"◆"},
    {id:"profile",  label:"My Profile", icon:"◉"},
  ];

  return(
    <Shell nav={nav} tab={tab} setTab={setTab} user={user} inst={inst} collapsed={col} setCollapsed={setCol} onLogout={onLogout}>
      {tab==="dashboard"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <div style={{marginBottom:22}}>
            <div style={{fontSize:10,fontWeight:700,color:T.muted,letterSpacing:"1.8px",textTransform:"uppercase",marginBottom:5}}>Welcome back</div>
            <h1 style={{fontFamily:"Georgia,serif",fontSize:32,fontWeight:800,color:T.ink}}>{greeting()}, <em style={{color:T.green,fontStyle:"italic"}}>{teacher.name}!</em></h1>
            <p style={{color:T.muted,fontSize:14,marginTop:5}}>You teach {teacher.subject} across {teacher.classes.length} classes.</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
            <KPI label="My Classes" value={teacher.classes.length} color={T.forest} icon="▦" sub={teacher.subject}/>
            <KPI label="Students" value={teacher.students} color={T.purple} icon="◈" sub="Total enrolled"/>
            <KPI label="Avg Score" value={`${avgScore}%`} color={T.success} icon="◈" sub="Across your students"/>
            <KPI label="Avg Attendance" value={`${avgAttendance}%`} color={T.blue} icon="◷" sub="Across all classes"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 280px",gap:18}}>
            <Crd style={{padding:"24px"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:16}}>My Students — {teacher.subject}</div>
              {myStudents.map(s=>{
                const sub=mySubjectOf(s);
                return sub?(
                  <div key={s.id} style={{display:"flex",gap:12,alignItems:"center",padding:"11px 0",borderBottom:`1px solid ${T.border}`}}>
                    <Av name={s.name} size={36} bg={`${T.forest}15`} color={T.forest} fs={12}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:T.ink}}>{s.name}</div>
                      <div style={{fontSize:11,color:T.muted,marginBottom:4}}>{s.grade} · {sub.name}: {sub.score}%</div>
                      <Bar val={sub.score} color={sub.color} h={3}/>
                    </div>
                    <Bdg label={sub.grade} color={gc(sub.grade)} bg={`${gc(sub.grade)}15`}/>
                  </div>
                ):null;
              })}
            </Crd>
            <Crd style={{padding:"24px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink}}>Quick Grade Entry</div>
                <Btn onClick={()=>setModal("assessment")} style={{padding:"7px 14px",fontSize:12}}>+ Assessment</Btn>
              </div>
              {!myStudents.some(mySubjectOf)&&(
                <div style={{fontSize:12.5,color:T.muted,padding:"10px 0",lineHeight:1.6}}>
                  No students are enrolled in the subjects you teach yet.
                </div>
              )}
              {myStudents.map(s=>{
                const sub=mySubjectOf(s);
                if(!sub)return null;
                const key=sub.enrollmentId;
                return(
                  <div key={s.id} style={{display:"flex",gap:10,alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:12,color:T.muted,flex:1}}>{s.name}</span>
                    <input type="number" min="0" max="100"
                      value={quickScores[key]??String(sub.score)}
                      onChange={e=>setQuickScores(v=>({...v,[key]:e.target.value}))}
                      style={{width:58,padding:"5px 8px",borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,textAlign:"center",color:T.ink,background:T.paper,outline:"none"}}/>
                    <span style={{fontSize:11,color:T.muted}}>/ 100</span>
                    <Btn onClick={()=>saveQuickScore(sub,s)} disabled={!key||quickBusy===key||(quickScores[key]??String(sub.score))===String(sub.score)}
                      style={{padding:"5px 10px",fontSize:11}}>
                      {quickBusy===key?"…":"Save"}
                    </Btn>
                  </div>
                );
              })}
              {quickMsg&&<div style={{fontSize:12,color:quickMsg.bad?T.danger:T.success,marginTop:10,fontWeight:600}}>{quickMsg.text}</div>}
            </Crd>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>Today's Schedule</div>
                {!todaySchedule.length&&<div style={{fontSize:12,color:T.muted,padding:"9px 0"}}>No classes scheduled today.</div>}
                {todaySchedule.map(sl=>(
                  <div key={sl.id} style={{display:"flex",gap:10,alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:11,color:T.muted,width:62,flexShrink:0,fontWeight:600}}>{sl.startTime||`P${sl.period}`}</span>
                    <div><div style={{fontSize:12,fontWeight:600,color:T.ink}}>{sl.grade} {sl.section}</div><div style={{fontSize:11,color:T.muted}}>{sl.subject}</div></div>
                  </div>
                ))}
              </Crd>
              <Crd style={{padding:"22px",border:`1.5px solid ${T.gold}44`,background:`linear-gradient(135deg,#fff,${T.gold}06)`}}>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:10}}><span style={{color:T.gold,animation:"shimmer 2s infinite"}}>✦</span><span style={{fontSize:10,fontWeight:700,color:T.gold,letterSpacing:"1.5px",textTransform:"uppercase"}}>AI Insights</span></div>
                <div style={{padding:"10px",background:`${T.danger}10`,borderRadius:10,marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.danger,marginBottom:3}}>⚠ At-Risk</div>
                  <div style={{fontSize:12,color:T.muted}}>{atRisk?`${atRisk.name} — averaging ${atRisk.average}%${atRisk.att.rate<85?`, attendance ${atRisk.att.rate}%`:""}`:"No students currently at risk."}</div>
                </div>
                <div style={{padding:"10px",background:`${T.success}10`,borderRadius:10}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.success,marginBottom:3}}>↑ Top Performer</div>
                  <div style={{fontSize:12,color:T.muted}}>{topPerformer?`${topPerformer.name} — averaging ${topPerformer.average}%`:"Not enough data yet."}</div>
                </div>
              </Crd>
            </div>
          </div>
        </div>
      )}
      {tab==="classes"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Teaching" title="My Classes"/>
          {!classCards.length&&<Crd style={{padding:"26px",fontSize:13,color:T.muted}}>
            You aren't assigned to any classes yet. Once an admin enrols students in a subject you teach, it appears here.
          </Crd>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
            {classCards.map(c=>{
              const key=`${c.subjectId}|${c.grade}|${c.section}`;
              const open=openRoster===key;
              return(
              <Crd key={key} style={{padding:"26px",gridColumn:open?"1/-1":undefined,transition:"all .2s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:800,color:T.forest,marginBottom:4}}>{c.grade} {c.section}</div>
                    <div style={{fontSize:13,color:T.muted,marginBottom:18}}>{c.subject}</div>
                  </div>
                  <span style={{width:12,height:12,borderRadius:99,background:c.color||T.forest,marginTop:6}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                  {[
                    [c.studentCount,"Students",T.ink],
                    [`${c.attendanceRate}%`,"Avg Att.",c.attendanceRate>=85?T.success:T.warning],
                    [`${c.average}%`,"Avg Score",c.average>=70?T.forest:T.warning],
                    [c.assessmentCount,"Assessments",T.ink],
                  ].map(([v,l,col])=>(
                    <div key={l} style={{padding:"12px",background:T.paper,borderRadius:12,textAlign:"center"}}>
                      <div style={{fontSize:18,fontWeight:800,color:col}}>{v}</div>
                      <div style={{fontSize:10,color:T.muted,marginTop:2}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <Btn onClick={()=>setOpenRoster(open?null:key)} out color={T.forest} style={{flex:1,padding:"9px",fontSize:12,textAlign:"center"}}>
                    {open?"Hide Students":"Students"}
                  </Btn>
                  <Btn onClick={()=>{setFocusClass(`${c.grade}|${c.section}`);setTab("attendance");}} style={{flex:1,padding:"9px",fontSize:12,textAlign:"center"}}>Attendance</Btn>
                </div>

                {open&&(
                  <div style={{marginTop:18,borderTop:`1px solid ${T.border}`,paddingTop:14,animation:"fadeUp .25s"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div style={{fontSize:13,fontWeight:700,color:T.ink}}>{c.subject} — {c.grade} {c.section}</div>
                      <Btn onClick={()=>{
                        if(!downloadCsv(stamped(`class-${c.label}-${c.subject.replace(/\W+/g,"-").toLowerCase()}`,"csv"),c.students.map(s=>({
                          roll:s.rollNo,name:s.name,score:s.score??"",grade:s.letterGrade??"",
                          previous:s.previousScore??"",attendance:s.attendanceRate,
                        })),[["Roll No","roll"],["Student","name"],["Score (%)","score"],["Grade","grade"],["Previous (%)","previous"],["Attendance (%)","attendance"]]))
                          alert("No students to export.");
                      }} out color={T.blue} style={{padding:"6px 12px",fontSize:11}}>Export CSV</Btn>
                    </div>
                    <table style={{width:"100%",borderCollapse:"collapse"}}>
                      <thead><tr>{["Roll","Student","Score","Grade","Trend","Attendance"].map(h=>(
                        <th key={h} style={{textAlign:"left",padding:"8px 10px",fontSize:10.5,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".6px",borderBottom:`2px solid ${T.border}`}}>{h}</th>
                      ))}</tr></thead>
                      <tbody>
                        {[...c.students].sort((a,b)=>(b.score??0)-(a.score??0)).map(s=>{
                          const trend=s.score!=null&&s.previousScore!=null?Math.round(s.score-s.previousScore):null;
                          return(
                          <tr key={s.id} style={{borderBottom:`1px solid ${T.border}`}}>
                            <td style={{padding:"9px 10px",fontSize:12,color:T.muted}}>{s.rollNo}</td>
                            <td style={{padding:"9px 10px"}}><div style={{display:"flex",gap:9,alignItems:"center"}}>
                              <Av name={s.name} size={28} bg={`${T.forest}15`} color={T.forest} fs={10}/>
                              <span style={{fontSize:13,fontWeight:600,color:T.ink}}>{s.name}</span>
                            </div></td>
                            <td style={{padding:"9px 10px",fontSize:13,fontWeight:700,color:(s.score??0)>=70?T.forest:T.warning}}>{s.score!=null?`${Math.round(s.score)}%`:"—"}</td>
                            <td style={{padding:"9px 10px"}}>{s.letterGrade?<Bdg label={s.letterGrade} color={T.forest} bg={`${T.forest}15`}/>:<span style={{fontSize:12,color:T.muted}}>—</span>}</td>
                            <td style={{padding:"9px 10px",fontSize:12,fontWeight:600,color:trend==null?T.muted:trend>0?T.success:trend<0?T.danger:T.muted}}>
                              {trend==null?"—":trend>0?`↑ ${trend}`:trend<0?`↓ ${Math.abs(trend)}`:"—"}
                            </td>
                            <td style={{padding:"9px 10px",fontSize:12,fontWeight:600,color:s.attendanceRate>=85?T.success:T.warning}}>{s.attendanceRate}%</td>
                          </tr>
                        );})}
                      </tbody>
                    </table>
                  </div>
                )}
              </Crd>
            );})}
          </div>
        </div>
      )}
      {tab==="gradebook"&&<GradeBookTab/>}
      {tab==="attendance"&&<AttendanceRegister/>}
      {tab==="messages"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Communication" title="Messages"/>
          <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:18,height:520}}>
            <Crd style={{overflow:"hidden",display:"flex",flexDirection:"column"}}>
              <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink}}>Inbox</div>
                <Bdg label={`${msgs.filter(m=>m.unread).length} new`} color={T.clay} bg={`${T.clay}15`}/>
              </div>
              <div style={{flex:1,overflowY:"auto"}}>
                {!msgs.length&&<div style={{padding:"18px 16px",fontSize:12.5,color:T.muted,lineHeight:1.6}}>No messages yet.</div>}
                {msgs.map(m=>(
                  <div key={m.id} onClick={()=>openMessage(m)} style={{padding:"13px 16px",cursor:"pointer",borderBottom:`1px solid ${T.border}`,background:selMsg?.id===m.id?`${T.forest}09`:"transparent",borderLeft:`3px solid ${selMsg?.id===m.id?T.forest:"transparent"}`,transition:"background .15s"}}>
                    <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                      <Av name={m.from} size={30} bg={T.paper} color={T.forest} fs={10}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:m.unread?700:500,color:T.ink}}>{m.from}</span><span style={{fontSize:10,color:T.muted}}>{m.time}</span></div>
                        <div style={{fontSize:11,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.subj}</div>
                      </div>
                      {m.unread&&<div style={{width:7,height:7,background:T.clay,borderRadius:"50%",flexShrink:0,marginTop:4}}/>}
                    </div>
                  </div>
                ))}
              </div>
            </Crd>
            <Crd style={{display:"flex",flexDirection:"column",overflow:"hidden"}}>
              {selMsg?(
                <>
                  <div style={{padding:"20px 26px",borderBottom:`1px solid ${T.border}`}}>
                    <div style={{fontFamily:"Georgia,serif",fontSize:19,fontWeight:800,color:T.ink,marginBottom:5}}>{selMsg.subj}</div>
                    <div style={{fontSize:12,color:T.muted}}>{selMsg.from} · {selMsg.fromRole} → {selMsg.to} · {selMsg.time}</div>
                  </div>
                  <div style={{flex:1,padding:"26px",overflowY:"auto"}}>
                    <div style={{background:T.paper,borderRadius:14,padding:"20px 24px",maxWidth:560,fontSize:14,color:T.ink,lineHeight:1.85,border:`1px solid ${T.border}`}}>{selMsg.body}</div>
                  </div>
                  {replySent&&<div style={{background:`${T.success}12`,color:T.success,padding:"10px 26px",fontSize:13,fontWeight:600,border:`1px solid ${T.success}30`}}>{replySent}</div>}
                  <div style={{padding:"16px 26px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10}}>
                    <input value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendReply()} placeholder={`Reply to ${selMsg.from}…`} style={{flex:1,background:T.paper,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"10px 16px",color:T.ink,fontSize:13,outline:"none"}}/>
                    <Btn onClick={sendReply} disabled={!reply.trim()||replyBusy}>{replyBusy?"Sending…":"Send"}</Btn>
                  </div>
                </>
              ):(
                <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:T.border}}>
                  <div style={{fontSize:48,marginBottom:12}}>◎</div>
                  <div style={{fontFamily:"Georgia,serif",fontSize:18,color:T.muted}}>Select a message</div>
                </div>
              )}
            </Crd>
          </div>
        </div>
      )}
      {tab==="notices"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="School" title="Notices"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
            {notices.map(n=>(
              <Crd key={n.id} style={{padding:"24px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><Bdg label={n.cat} color={catC(n.cat)} bg={`${catC(n.cat)}15`}/><span style={{fontSize:12,color:T.muted}}>{n.date}</span></div>
                <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:T.ink,marginBottom:8}}>{n.title}</div>
                <p style={{fontSize:13,color:T.muted,lineHeight:1.7}}>{n.body}</p>
              </Crd>
            ))}
          </div>
        </div>
      )}
      {tab==="profile"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Account" title="My Profile"/>
          <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:18}}>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"26px",textAlign:"center"}}>
                <div style={{width:80,height:80,borderRadius:"50%",background:G(T.purple,T.blue),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:28,color:"#fff",margin:"0 auto 14px"}}>{ini(teacher.name)}</div>
                <div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:700,color:T.ink}}>{teacher.name}</div>
                <div style={{fontSize:13,color:T.muted,marginTop:4}}>{teacher.subject} Teacher</div>
                <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:12}}>
                  <Bdg label={`${teacher.classes.length} Classes`} color={T.forest} bg={`${T.forest}15`}/>
                  <Bdg label={`${teacher.students} Students`} color={T.purple} bg={`${T.purple}15`}/>
                </div>
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>Teaching Info</div>
                {[["Subject",teacher.subject],["Classes",teacher.classes.join(", ")],["Total Students",teacher.students],["Email",teacher.email],["Phone",teacher.phone]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:12,color:T.muted}}>{l}</span><span style={{fontSize:12,fontWeight:600,color:T.ink}}>{v}</span>
                  </div>
                ))}
              </Crd>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <EditProfileCard/>
              <ChangePasswordCard/>
            </div>
          </div>
        </div>
      )}
      {modal==="assessment"&&<AssessmentModal/>}
    </Shell>
  );
};

// ═══════════════════════════════════════════════════════════════════
// PARENT PORTAL — FULL FEATURED
// ═══════════════════════════════════════════════════════════════════
const PARENT_TABS=["dashboard","attendance","grades","ai","messages","fees","timetable","notices","profile"];

const ParentPortal=({user,db,onLogout,onReload})=>{
  const[tab,setTab]=useHashTab("dashboard",PARENT_TABS);
  const[col,setCol]=useState(false);
  const[selMsg,setSelMsg]=useState(db.messages[0]);
  const[msgs,setMsgs]=useState(db.messages);
  // Keep the local copy in step when the parent reloads db after a mutation.
  useEffect(()=>{setMsgs(db.messages);setSelMsg(m=>db.messages.find(x=>x.id===m?.id)||db.messages[0]);},[db.messages]);
  const[reply,setReply]=useState("");
  const[sent,setSent]=useState(false);
  const[compose,setCompose]=useState(false);
  const[selNotice,setSelNotice]=useState(null);
  const[selSub,setSelSub]=useState(null);
  const inst=db.institutes.find(i=>i.id===user.inst)||db.institutes[0];
  const parent=db.parents.find(p=>p.id===user.ref)||db.parents[0];
  const student=db.students.find(s=>s.id===parent?.studentId)||db.students[0];
  // Highest-severity concern from the insight engine — drives the AI alert card.
  const topInsight=(student?.aiRecs??[])
    .filter(r=>r.type==="WEAKNESS"||r.type==="ATTENDANCE")
    .sort((a,b)=>b.severity-a.severity)[0]??null;
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const nav=[
    {id:"dashboard", label:"Dashboard",   icon:"⊞"},
    {id:"attendance",label:"Attendance",  icon:"◷"},
    {id:"grades",    label:"Grades",      icon:"◈"},
    {id:"ai",        label:"AI Insights", icon:"✦"},
    {id:"messages",  label:"Messages",    icon:"◎",badge:msgs.filter(m=>m.unread).length},
    {id:"fees",      label:"Fees",        icon:"◑"},
    {id:"timetable", label:"Timetable",   icon:"▦"},
    {id:"notices",   label:"Notices",     icon:"◆"},
    {id:"profile",   label:"Profile",     icon:"◉"},
  ];

  const sendReply=async()=>{
    if(!reply.trim()||!selMsg)return;
    const body=reply;
    setReply("");
    try{
      await api.messages.reply(selMsg.id,body);
      setSent(true);
      setTimeout(()=>setSent(false),2500);
      onReload?.();
    }catch(e){
      setReply(body); // put the text back so it isn't lost
      alert(e.message||"Could not send reply.");
    }
  };

  /**
   * Compose a new message. The recipient list comes from GET /messages/contacts
   * — the staff this guardian is actually allowed to write to. Previously this
   * form's fields were placeholder-only and "Send Message" just closed the
   * card, so nothing was ever sent.
   */
  const ComposeCard=()=>{
    const[contacts,setContacts]=useState(null);
    const[f,setF]=useState({to:"",subject:"",body:""});
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    const[sending,setSending]=useState(false);
    const[e2,setE2]=useState("");

    useEffect(()=>{
      let cancelled=false;
      api.messages.contacts()
        .then(r=>{if(!cancelled)setContacts(r);})
        .catch(x=>{if(!cancelled)setE2(x.message||"Couldn't load your contacts.");});
      return()=>{cancelled=true;};
    },[]);

    const send=async()=>{
      setSending(true);setE2("");
      try{
        await api.messages.send({
          recipientId:f.to,
          subject:f.subject.trim(),
          body:f.body.trim(),
          ...(student?.id&&{studentId:student.id}),
        });
        setCompose(false);
        setSent(true);
        setTimeout(()=>setSent(false),2500);
        onReload?.();
      }catch(x){
        setE2(x.errors?.[0]?.message||x.message||"Could not send the message.");
      }finally{
        setSending(false);
      }
    };

    return(
      <Crd style={{padding:"24px",marginBottom:18,border:`1.5px solid ${T.forest}44`,animation:"fadeUp .3s"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><div style={{fontSize:14,fontWeight:700,color:T.ink}}>New Message</div><span onClick={()=>setCompose(false)} style={{cursor:"pointer",color:T.muted,fontSize:22}}>×</span></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Sel label="To (Teacher / Admin)"
            options={[{v:"",l:contacts?(contacts.length?"Choose a recipient…":"No contacts available"):"Loading…"},
              ...(contacts??[]).map(c=>({v:c.id,l:`${c.name}${c.role?` — ${c.role.toLowerCase()}`:""}`}))]}
            value={f.to} onChange={e=>s("to",e.target.value)}/>
          <Inp label="Subject" value={f.subject} onChange={e=>s("subject",e.target.value)} placeholder="Subject of message"/>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:".6px"}}>Message</div>
          <textarea rows={4} value={f.body} onChange={e=>s("body",e.target.value)} placeholder="Write your message here…" style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,resize:"none",outline:"none",fontFamily:"inherit"}}/>
        </div>
        {e2&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{e2}</div>}
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={()=>setCompose(false)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={send} style={{flex:2,padding:"11px"}} disabled={!f.to||!f.subject.trim()||!f.body.trim()||sending}>{sending?"Sending…":"Send Message"}</Btn>
        </div>
      </Crd>
    );
  };

  return(
    <Shell nav={nav} tab={tab} setTab={setTab} user={user} inst={inst} collapsed={col} setCollapsed={setCol} onLogout={onLogout}>
      {/* DASHBOARD */}
      {tab==="dashboard"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <div style={{marginBottom:24}}>
            <div style={{fontSize:10,fontWeight:700,color:T.muted,letterSpacing:"1.8px",textTransform:"uppercase",marginBottom:5}}>{new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</div>
            <h1 style={{fontFamily:"Georgia,serif",fontSize:34,fontWeight:800,color:T.ink}}>{greeting()}, <em style={{color:T.green,fontStyle:"italic"}}>{parent?.name.split(" ")[0]}.</em></h1>
            <p style={{color:T.muted,fontSize:14,marginTop:5}}>Here's everything about <b>{student.name}</b>'s academic journey.</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
            <KPI label="GPA" value={student.gpa} color={T.forest} icon="◈" sub="Current semester"/>
            <KPI label="Class Rank" value={`#${student.rank}`} color={T.purple} icon="◆" sub={`of ${student.classSize} students`}/>
            <KPI label="Attendance" value={`${student.att.rate??student.att.present}%`} color={T.success} icon="◷" sub={`${student.att.days} school days`}/>
            <KPI label="AI Score" value={`${student.aiScore}/100`} color={T.gold} icon="✦" sub={student.aiScoreLabel}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 300px",gap:18}}>
            {/* Subjects */}
            <Crd style={{padding:"24px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink}}>Subject Performance</div>
                <span onClick={()=>setTab("grades")} style={{fontSize:12,color:T.green,cursor:"pointer",fontWeight:600}}>Full report →</span>
              </div>
              {student.subjects.map((s,i)=>(
                <div key={s.name} style={{marginBottom:13}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}><div style={{width:7,height:7,borderRadius:2,background:s.color}}/><span style={{fontSize:13,fontWeight:500,color:T.ink}}>{s.name}</span></div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:11,color:T.muted}}>{s.score}%</span><Bdg label={s.grade} color={gc(s.grade)} bg={`${gc(s.grade)}15`}/></div>
                  </div>
                  <Bar val={s.score} color={s.color} delay={i*70}/>
                </div>
              ))}
            </Crd>
            {/* Middle col */}
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <Crd style={{padding:"22px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.ink}}>Attendance</div>
                  <span onClick={()=>setTab("attendance")} style={{fontSize:12,color:T.green,cursor:"pointer",fontWeight:600}}>Details →</span>
                </div>
                <div style={{display:"flex",gap:18,alignItems:"center"}}>
                  <Donut p={student.att.present} color={T.forest} size={80}/>
                  <div style={{flex:1}}>
                    {[["Present",student.att.present,T.success],["Absent",student.att.absent,T.danger],["Late",student.att.late,T.warning]].map(([l,v,c])=>(
                      <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}><div style={{width:7,height:7,borderRadius:"50%",background:c}}/><span style={{fontSize:12,color:T.muted}}>{l}</span></div>
                        <span style={{fontSize:13,fontWeight:700,color:T.ink}}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Crd>
              <Crd style={{padding:"22px",flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Recent Assessments</div>
                {student.assessments.slice(0,4).map((a,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:i<3?`1px solid ${T.border}`:"none"}}>
                    <div><div style={{fontSize:12,fontWeight:500,color:T.ink}}>{a.sub} <span style={{color:T.muted,fontWeight:400}}>· {a.type}</span></div><div style={{fontSize:10,color:T.muted}}>{a.date}</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:800,color:a.got>=18?T.success:a.got>=15?T.warning:T.danger,lineHeight:1}}>{a.got}<span style={{fontSize:11,color:T.muted,fontFamily:"system-ui",fontWeight:400}}>/{a.of}</span></div><div style={{fontSize:10,color:T.muted}}>{pct(a.got,a.of)}%</div></div>
                  </div>
                ))}
              </Crd>
            </div>
            {/* Right col */}
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"22px",border:`1.5px solid ${T.gold}44`,background:`linear-gradient(135deg,#fff,${T.gold}06)`}}>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:10}}><span style={{color:T.gold,animation:"shimmer 2s infinite"}}>✦</span><span style={{fontSize:10,fontWeight:700,color:T.gold,letterSpacing:"1.5px",textTransform:"uppercase"}}>AI Alert</span></div>
                <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:700,color:T.ink,lineHeight:1.3,marginBottom:8}}>{topInsight?`${topInsight.sub} needs attention`:"No concerns flagged"}</div>
                <p style={{fontSize:12,color:T.muted,lineHeight:1.7}}>{topInsight?topInsight.tip:`${student.name} has no outstanding academic or attendance concerns this term.`}</p>
                <Btn onClick={()=>setTab("ai")} full style={{marginTop:14,padding:"9px",fontSize:12}}>View AI Insights →</Btn>
              </Crd>
              <Crd style={{padding:"22px",flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.ink}}>Messages</div>
                  <span onClick={()=>setTab("messages")} style={{fontSize:12,color:T.green,cursor:"pointer",fontWeight:600}}>All →</span>
                </div>
                {msgs.slice(0,3).map((m,i)=>(
                  <div key={m.id} onClick={()=>{setTab("messages");setSelMsg(m);}} style={{display:"flex",gap:9,padding:"9px 0",borderBottom:i<2?`1px solid ${T.border}`:"none",cursor:"pointer"}}>
                    <Av name={m.from} size={28} bg={T.paper} color={T.forest} fs={9}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:m.unread?700:500,color:T.ink}}>{m.from}</span><span style={{fontSize:10,color:T.muted}}>{m.time}</span></div>
                      <div style={{fontSize:11,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.subj}</div>
                    </div>
                    {m.unread&&<div style={{width:6,height:6,background:T.clay,borderRadius:"50%",flexShrink:0,marginTop:4}}/>}
                  </div>
                ))}
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.ink}}>Fees</div>
                  <span onClick={()=>setTab("fees")} style={{fontSize:12,color:T.green,cursor:"pointer",fontWeight:600}}>Details →</span>
                </div>
                {student.fees.slice(0,3).map((f,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:12,color:T.muted}}>{f.month}</span>
                    <Bdg label={f.status==="paid"?"✓ Paid":"⏳ Pending"} color={f.status==="paid"?T.success:T.warning} bg={f.status==="paid"?`${T.success}15`:`${T.warning}15`}/>
                  </div>
                ))}
                {(()=>{const due=student.fees.find(f=>f.status==="pending"||f.status==="overdue");
                  return due
                    ?<div style={{fontSize:11,color:T.clay,marginTop:8,fontWeight:600}}>⚠ {due.month} fee pending — due {due.dueDate}</div>
                    :<div style={{fontSize:11,color:T.success,marginTop:8,fontWeight:600}}>✓ All fees cleared</div>;})()}
              </Crd>
            </div>
          </div>
        </div>
      )}
      {/* ATTENDANCE */}
      {tab==="attendance"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Tracking" title="Attendance Record"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:18}}>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <Crd style={{padding:"26px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:16}}>Attendance — last 12 months</div>
                {/* Bars scale to the busiest month in the series rather than an
                    assumed 22-day month, and each is labelled from its own
                    period — the labels used to be a fixed Jan…Dec list. */}
                {(()=>{
                  const peak=Math.max(1,...student.monthlyAtt.map(m=>m.present));
                  const lastIdx=student.monthlyAtt.length-1;
                  return(
                    <div style={{display:"flex",alignItems:"flex-end",gap:5,height:90,marginBottom:4}}>
                      {student.monthlyAtt.map((m,i)=>(
                        <div key={`${m.year}-${m.label}`} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                          <div style={{fontSize:8,color:T.muted,fontWeight:600}}>{m.present}</div>
                          <div title={`${m.label} ${m.year}: ${m.present} of ${m.total} days`}
                            style={{width:"100%",borderRadius:"3px 3px 0 0",background:i===lastIdx?G(T.mint,T.forest,"180deg"):T.border,height:`${(m.present/peak)*65}px`,transition:`height 1s ${i*55}ms`}}/>
                          <span style={{fontSize:8,color:T.muted}}>{m.label}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Real day counts, not the fixed 87/8/5/2/100/87% row. */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginTop:18}}>
                  {[[student.att.counts.present,"Present",T.forest],[student.att.counts.absent,"Absent",T.danger],
                    [student.att.counts.late,"Late",T.warning],[student.att.counts.leave,"Leave",T.muted],
                    [student.att.counts.total,"Total",T.ink],[`${student.att.rate}%`,"Rate",T.success]].map(([v,l,c])=>(
                    <div key={l} style={{padding:"10px 6px",background:T.paper,borderRadius:10,textAlign:"center"}}>
                      <div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:800,color:c}}>{v}</div>
                      <div style={{fontSize:9,color:T.muted,marginTop:2}}>{l}</div>
                    </div>
                  ))}
                </div>
              </Crd>
              <Crd style={{padding:"24px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:16}}>Most Recent Days</div>
                <div style={{display:"flex",gap:12}}>
                  {student.weekAtt.map((w,i)=>{
                    const c=w.s==="present"?T.success:w.s==="absent"?T.danger:T.warning;
                    const lbl=w.s==="present"?"P":w.s==="absent"?"A":"L";
                    return(
                      <div key={i} style={{flex:1,textAlign:"center"}}>
                        <div style={{width:"100%",aspectRatio:"1",borderRadius:14,background:`${c}13`,border:`1.5px solid ${c}44`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}>
                          <span style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:c}}>{lbl}</span>
                        </div>
                        <div style={{fontSize:11,fontWeight:600,color:T.ink}}>{w.d}</div>
                        <div style={{fontSize:10,color:T.muted,textTransform:"capitalize"}}>{w.s}</div>
                      </div>
                    );
                  })}
                </div>
              </Crd>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {/* The insight engine's own attendance findings, if it raised
                  any. This card used to assert a fixed "Irregular Thursday
                  arrivals" pattern for every student. */}
              {(()=>{
                const attInsight=(student.aiRecs??[]).find(r=>r.type==="ATTENDANCE");
                return(
                  <Crd style={{padding:"22px",border:`1.5px solid ${T.gold}44`}}>
                    <div style={{fontSize:10,fontWeight:700,color:T.gold,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:10}}>✦ AI Insight</div>
                    {attInsight?(
                      <>
                        <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:700,color:T.ink,marginBottom:8,lineHeight:1.3}}>{attInsight.sub}</div>
                        <p style={{fontSize:12,color:T.muted,lineHeight:1.7}}>{attInsight.tip}</p>
                      </>
                    ):(
                      <p style={{fontSize:12,color:T.muted,lineHeight:1.7}}>
                        No attendance concerns flagged for {student.name}.
                      </p>
                    )}
                  </Crd>
                );
              })()}
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>vs. Target</div>
                {[["Current",student.att.rate,T.success],["Target",95,T.forest],["Minimum",75,T.muted]].map(([l,v,c])=>(
                  <div key={l} style={{marginBottom:13}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:T.muted}}>{l}</span><span style={{fontSize:12,fontWeight:700,color:c}}>{v}%</span></div>
                    <Bar val={v} color={c}/>
                  </div>
                ))}
              </Crd>
              {/* Derived from the attendance record actually held for this
                  student. Every figure here was previously a literal. */}
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>Quick Stats</div>
                {(()=>{
                  const best=[...student.monthlyAtt].sort((a,b)=>b.present-a.present)[0];
                  const c=student.att.counts;
                  const punctual=c.total?Math.round((c.present/c.total)*100):0;
                  return[
                    ["Days recorded",String(c.total)],
                    ["Best month",best&&best.present?`${best.label} (${best.present} days)`:"—"],
                    ["On-time rate",`${punctual}%`],
                    ["Leave days",String(c.leave)],
                  ].map(([l,v])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                      <span style={{fontSize:12,color:T.muted}}>{l}</span><span style={{fontSize:12,fontWeight:700,color:T.ink}}>{v}</span>
                    </div>
                  ));
                })()}
              </Crd>
            </div>
          </div>
        </div>
      )}
      {/* GRADES */}
      {tab==="grades"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Academic" title="Grades & Results"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 290px",gap:18}}>
            <Crd style={{padding:"26px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink}}>Subject Breakdown</div>
                <span style={{fontSize:11,color:T.muted}}>Click a row for details · ↑↓ = AI trend</span>
              </div>
              {student.subjects.map((s,i)=>(
                <div key={s.name} onClick={()=>setSelSub(selSub===i?null:i)} style={{padding:"14px 0",borderBottom:`1px solid ${T.border}`,cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:9,height:9,borderRadius:3,background:s.color,flexShrink:0}}/>
                      <span style={{fontWeight:600,fontSize:14,color:T.ink}}>{s.name}</span>
                      <span style={{fontSize:11,color:T.muted}}>{s.teacher}</span>
                    </div>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <span style={{fontSize:12,color:s.pred>s.score?T.success:T.danger,fontWeight:700}}>{s.pred>s.score?"↑":"↓"} {s.pred}%</span>
                      <Bdg label={s.grade} color={gc(s.grade)} bg={`${gc(s.grade)}15`}/>
                    </div>
                  </div>
                  <Bar val={s.score} color={s.color} delay={i*70}/>
                  <span style={{fontSize:11,color:T.muted,marginTop:4,display:"block"}}>{s.score}/100 · Previous: {s.prev}%</span>
                  {selSub===i&&(
                    <div style={{marginTop:12,padding:"12px 14px",background:T.paper,borderRadius:10,fontSize:13,color:T.muted,lineHeight:1.7,border:`1px solid ${T.border}`}}>
                      Change from last test: <b style={{color:s.score>s.prev?T.success:T.danger}}>{s.score>s.prev?"+":"-"}{Math.abs(s.score-s.prev)}%</b> · Predicted next: <b style={{color:T.forest}}>{s.pred}%</b>
                    </div>
                  )}
                </div>
              ))}
            </Crd>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"26px",background:G(T.forest,T.green),border:"none"}}>
                <div style={{fontSize:10,color:"rgba(255,255,255,.5)",fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:5}}>Current GPA</div>
                {/* Standing and progress read from the real rank and GPA; this
                    claimed "Top 10% of class" and a fixed 82% bar for everyone. */}
                <div style={{fontFamily:"Georgia,serif",fontSize:52,fontWeight:800,color:"#fff",lineHeight:1}}>{student.gpa}</div>
                <div style={{fontSize:13,color:"rgba(255,255,255,.6)",marginTop:8}}>
                  {student.rank&&student.classSize?`Ranked #${student.rank} of ${student.classSize} in class`:"Class rank not available yet"}
                </div>
                <div style={{marginTop:14,height:4,background:"rgba(255,255,255,.15)",borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(100,Math.round((student.gpa/4)*100))}%`,background:T.mint,borderRadius:99}}/></div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:4}}>{Math.min(100,Math.round((student.gpa/4)*100))}% toward 4.0 GPA</div>
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>All Assessments</div>
                {student.assessments.map((a,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:i<student.assessments.length-1?`1px solid ${T.border}`:"none"}}>
                    <div><div style={{fontSize:12,fontWeight:500,color:T.ink}}>{a.sub}</div><div style={{fontSize:10,color:T.muted}}>{a.type} · {a.date}</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:800,color:a.got>=18?T.success:a.got>=15?T.warning:T.danger,lineHeight:1}}>{a.got}<span style={{fontSize:10,color:T.muted,fontFamily:"system-ui",fontWeight:400}}>/{a.of}</span></div><div style={{fontSize:10,color:T.muted}}>{pct(a.got,a.of)}%</div></div>
                  </div>
                ))}
              </Crd>
            </div>
          </div>
        </div>
      )}
      {/* AI INSIGHTS */}
      {tab==="ai"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Intelligence" title="AI Insights & Predictions"/>
          <Crd style={{padding:"32px",marginBottom:18,background:`linear-gradient(140deg,${T.ink},#1a3355)`,border:"none",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-50,right:-50,width:200,height:200,borderRadius:"50%",background:T.gold,opacity:.05}}/>
            <div style={{position:"absolute",bottom:-40,left:100,width:180,height:180,borderRadius:"50%",background:T.mint,opacity:.05}}/>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}><span style={{color:T.gold,animation:"shimmer 2s infinite",fontSize:18}}>✦</span><span style={{fontSize:10,fontWeight:700,color:T.gold,letterSpacing:"2px",textTransform:"uppercase"}}>AI Academic Intelligence Engine</span></div>
            {/* Every figure below comes from the insight engine's own output:
                the projection is the mean of its per-subject predicted scores,
                the score and risk label are what it computed. This block used
                to state a flat 85% projection, "6 subjects", a 78% model
                confidence and an 82/100 score for every student alike. */}
            {(()=>{
              const subs=student.subjects;
              const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):0;
              const projected=mean(subs.map(s=>s.pred));
              return(
                <>
                  <h2 style={{fontFamily:"Georgia,serif",fontSize:26,fontWeight:800,color:"#fff",marginBottom:10,lineHeight:1.2,maxWidth:560}}>
                    {subs.length
                      ?<>{student.name} is projected to average <em style={{color:T.mint}}>{projected}%</em> across their subjects</>
                      :<>No subject data recorded for {student.name} yet</>}
                  </h2>
                  <p style={{fontSize:14,color:"rgba(255,255,255,.5)",lineHeight:1.8,maxWidth:500,marginBottom:24}}>
                    {subs.length
                      ? `Based on ${subs.length} subject${subs.length===1?"":"s"} and ${student.att.days} day${student.att.days===1?"":"s"} of attendance.`
                      : "Once marks and attendance are recorded, predictions appear here."}
                  </p>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
                    {[[`${student.aiScore} / 100`,"AI Performance Score",T.gold],
                      [student.aiScoreLabel,"Academic Standing",T.mint],
                      [student.rank?`#${student.rank} of ${student.classSize}`:"—","Current Class Rank","#fff"]].map(([v,l,c])=>(
                      <div key={l} style={{padding:"18px",background:"rgba(255,255,255,.07)",borderRadius:14,border:"1px solid rgba(255,255,255,.08)"}}>
                        <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:800,color:c,marginBottom:5}}>{v}</div>
                        <div style={{fontSize:12,color:"rgba(255,255,255,.4)"}}>{l}</div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </Crd>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
            <Crd style={{padding:"24px"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:16}}>Per-Subject Predictions</div>
              {student.subjects.map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 12px",borderRadius:12,background:T.paper,marginBottom:8,border:`1px solid ${T.border}`}}>
                  <div style={{width:36,height:36,borderRadius:10,background:`${s.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:s.color,flexShrink:0}}>{s.grade}</div>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.ink}}>{s.name}</div><div style={{fontSize:11,color:T.muted}}>Now: {s.score}%</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:s.pred>s.score?T.success:T.danger}}>{s.pred}%</div><div style={{fontSize:10,color:T.muted}}>Predicted</div></div>
                  <span style={{fontSize:18,color:s.pred>s.score?T.success:T.danger,fontWeight:700}}>{s.pred>s.score?"↑":"↓"}</span>
                </div>
              ))}
            </Crd>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"24px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:14}}>Personalized Recommendations</div>
                {student.aiRecs.map((r,i)=>(
                  <div key={i} style={{padding:"14px",borderRadius:12,background:T.paper,border:`1px solid ${T.border}`,marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.forest,marginBottom:5,textTransform:"uppercase",letterSpacing:".5px"}}>◈ {r.sub}</div>
                    <p style={{fontSize:13,color:T.muted,lineHeight:1.65}}>{r.tip}</p>
                  </div>
                ))}
              </Crd>
              {/* Shown only when the engine actually raised an attendance
                  finding — this was a fixed "Chemistry" claim before. */}
              {(()=>{
                const att=(student.aiRecs??[]).find(r=>r.type==="ATTENDANCE");
                if(!att)return null;
                return(
                  <Crd style={{padding:"24px",border:`1.5px solid ${T.clay}44`,background:`linear-gradient(135deg,#fff,${T.clay}05)`}}>
                    <div style={{fontSize:10,fontWeight:700,color:T.clay,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:10}}>⚠ Attendance Impact</div>
                    <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:T.ink,marginBottom:8,lineHeight:1.3}}>{att.sub}</div>
                    <p style={{fontSize:13,color:T.muted,lineHeight:1.7}}>{att.tip}</p>
                  </Crd>
                );
              })()}
              {/* Previous vs current subject average — the two figures the API
                  actually stores per enrolment. The old chart drew a fixed
                  eight-point line and a literal "+13% since Sept". */}
              {(()=>{
                const subs=student.subjects;
                if(!subs.length)return null;
                const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):0;
                const prev=mean(subs.map(s=>s.prev)),cur=mean(subs.map(s=>s.score));
                const delta=cur-prev;
                const col=delta>0?T.success:delta<0?T.danger:T.muted;
                return(
                  <Crd style={{padding:"24px"}}>
                    <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:4}}>Overall Performance Trend</div>
                    <div style={{fontSize:11.5,color:T.muted,marginBottom:14}}>Average across all subjects, previous assessment vs current.</div>
                    <div style={{display:"flex",alignItems:"center",gap:20}}>
                      <div style={{display:"flex",alignItems:"flex-end",gap:14}}>
                        {[["Previous",prev,T.border],["Current",cur,T.forest]].map(([l,v,c])=>(
                          <div key={l} style={{textAlign:"center"}}>
                            <div style={{fontSize:10,color:T.muted,marginBottom:4}}>{v}%</div>
                            <div style={{width:34,height:Math.max(4,(v/100)*60),background:c,borderRadius:"4px 4px 0 0"}}/>
                            <div style={{fontSize:10,color:T.muted,marginTop:5}}>{l}</div>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:800,color:col}}>{delta>0?"+":""}{delta}%</div>
                        <div style={{fontSize:12,color:T.muted}}>Change</div>
                        <div style={{fontSize:11,color:col,marginTop:4,fontWeight:600}}>
                          {delta>0?"↑ Improving":delta<0?"↓ Slipping":"→ Holding steady"}
                        </div>
                      </div>
                    </div>
                  </Crd>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {/* MESSAGES */}
      {tab==="messages"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Communication" title="Messages" action={<Btn onClick={()=>setCompose(true)} style={{marginBottom:4}}>+ Compose</Btn>}/>
          {compose&&<ComposeCard/>}
          <div style={{display:"grid",gridTemplateColumns:"290px 1fr",gap:18,height:500}}>
            <Crd style={{overflow:"hidden",display:"flex",flexDirection:"column"}}>
              <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink}}>Inbox</div>
                <Bdg label={`${msgs.filter(m=>m.unread).length} new`} color={T.clay} bg={`${T.clay}15`}/>
              </div>
              <div style={{flex:1,overflowY:"auto"}}>
                {msgs.map(m=>(
                  <div key={m.id} onClick={()=>{setSelMsg(m);setMsgs(prev=>prev.map(x=>x.id===m.id?{...x,unread:false}:x));}}
                    style={{padding:"13px 16px",cursor:"pointer",borderBottom:`1px solid ${T.border}`,background:selMsg?.id===m.id?`${T.forest}09`:"transparent",borderLeft:`3px solid ${selMsg?.id===m.id?T.forest:"transparent"}`,transition:"background .15s"}}>
                    <div style={{display:"flex",gap:9,alignItems:"flex-start"}}>
                      <Av name={m.from} size={30} bg={T.paper} color={T.forest} fs={10}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:m.unread?700:500,color:T.ink}}>{m.from}</span><span style={{fontSize:10,color:T.muted}}>{m.time}</span></div>
                        <div style={{fontSize:11,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.subj}</div>
                      </div>
                      {m.unread&&<div style={{width:7,height:7,background:T.clay,borderRadius:"50%",flexShrink:0,marginTop:4}}/>}
                    </div>
                  </div>
                ))}
              </div>
            </Crd>
            <Crd style={{display:"flex",flexDirection:"column",overflow:"hidden"}}>
              {selMsg?(
                <>
                  <div style={{padding:"20px 26px",borderBottom:`1px solid ${T.border}`}}>
                    <div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:T.ink,marginBottom:5}}>{selMsg.subj}</div>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <Av name={selMsg.from} size={28} bg={T.paper} color={T.forest} fs={9}/>
                      <span style={{fontSize:12,color:T.muted}}>{selMsg.from} · {selMsg.fromRole}</span>
                      <span style={{fontSize:11,color:T.muted,marginLeft:"auto"}}>{selMsg.time}</span>
                    </div>
                  </div>
                  <div style={{flex:1,padding:"26px",overflowY:"auto"}}>
                    <div style={{background:T.paper,borderRadius:14,padding:"20px 24px",maxWidth:580,fontSize:14,color:T.ink,lineHeight:1.85,border:`1px solid ${T.border}`}}>{selMsg.body}</div>
                  </div>
                  {sent&&<div style={{background:`${T.success}12`,color:T.success,padding:"10px 26px",fontSize:13,fontWeight:600,border:`1px solid ${T.success}30`}}>✓ Reply sent successfully</div>}
                  <div style={{padding:"16px 26px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10}}>
                    <input value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendReply()} placeholder={`Reply to ${selMsg.from}…`} style={{flex:1,background:T.paper,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"10px 16px",color:T.ink,fontSize:13,outline:"none",transition:"border-color .15s"}} onFocus={e=>e.target.style.borderColor=T.forest} onBlur={e=>e.target.style.borderColor=T.border}/>
                    <Btn onClick={sendReply}>Send</Btn>
                  </div>
                </>
              ):(
                <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                  <div style={{fontSize:48,color:T.border,marginBottom:12}}>◎</div>
                  <div style={{fontFamily:"Georgia,serif",fontSize:18,color:T.muted}}>Select a message</div>
                  <div style={{fontSize:13,color:T.border,marginTop:6}}>Choose from the inbox on the left</div>
                </div>
              )}
            </Crd>
          </div>
        </div>
      )}
      {/* FEES */}
      {tab==="fees"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Finance" title="Fee Management"/>
          {/* Real invoice totals from the server. These were an assumed
              Rs 1,50,000 a year and an invoice count times a literal 12,500,
              so the figures matched no actual invoice. */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>
            <KPI label="Invoiced" value={`Rs. ${(student.feeTotals.paid+student.feeTotals.outstanding).toLocaleString()}`} color={T.ink} icon="◑" sub={`${student.fees.length} invoice${student.fees.length===1?"":"s"}`}/>
            <KPI label="Paid" value={`Rs. ${student.feeTotals.paid.toLocaleString()}`} color={T.success} icon="✓" sub={`${student.fees.filter(f=>f.status==="paid").length} settled`}/>
            <KPI label="Outstanding" value={`Rs. ${student.feeTotals.outstanding.toLocaleString()}`} color={T.warning} icon="⏳" sub={`${student.fees.filter(f=>f.status!=="paid"&&f.status!=="waived").length} unpaid`}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:18}}>
            <Crd style={{padding:"26px"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Payment History</div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Month","Amount","Due Date","Paid On","Status"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                <tbody>{!student.fees.length&&(
                  <tr><td colSpan={5} style={{padding:"16px 12px",fontSize:13,color:T.muted}}>No invoices have been issued yet.</td></tr>
                )}
                {student.fees.map((f,i)=>{
                  // Each invoice carries its own due date — the column was a
                  // literal "20th" for every row regardless.
                  const c=f.status==="paid"?T.success:f.status==="overdue"?T.danger:T.warning;
                  return(
                  <tr key={f.id??i} style={{borderBottom:`1px solid ${T.border}`}}>
                    <td style={{padding:"12px",fontSize:13,fontWeight:600,color:T.ink}}>{f.month}</td>
                    <td style={{padding:"12px",fontSize:13}}>Rs. {f.amt.toLocaleString()}</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{f.dueDate||"—"}</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{f.date||"—"}</td>
                    <td style={{padding:"12px"}}><Bdg label={f.status==="paid"?"✓ Paid":f.status==="overdue"?"⚠ Overdue":"⏳ Pending"} color={c} bg={`${c}15`}/></td>
                  </tr>
                );})}</tbody>
              </table>
            </Crd>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {/* Built from the outstanding invoices themselves. This card used
                  to state a flat Rs 25,000 for "March + April 2026" with a
                  March 20 deadline, no matter what was actually owed. */}
              {(()=>{
                const unpaid=student.fees.filter(f=>f.status!=="paid"&&f.status!=="waived");
                if(!unpaid.length) return(
                  <Crd style={{padding:"22px",border:`1.5px solid ${T.success}55`,background:`linear-gradient(135deg,#fff,${T.success}05)`}}>
                    <div style={{fontSize:10,fontWeight:700,color:T.success,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:10}}>✓ Nothing Due</div>
                    <div style={{fontSize:13,color:T.muted,lineHeight:1.7}}>All issued invoices for {student.name} have been settled.</div>
                  </Crd>
                );
                const total=unpaid.reduce((s,f)=>s+f.amt,0);
                const next=unpaid[unpaid.length-1];
                return(
                  <Crd style={{padding:"22px",border:`1.5px solid ${T.warning}55`,background:`linear-gradient(135deg,#fff,${T.warning}05)`}}>
                    <div style={{fontSize:10,fontWeight:700,color:T.warning,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:10}}>⚠ Payment Due</div>
                    <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:800,color:T.ink}}>Rs. {total.toLocaleString()}</div>
                    <div style={{fontSize:12,color:T.muted,marginTop:4,marginBottom:16,lineHeight:1.6}}>
                      {unpaid.map(f=>f.month).join(" · ")}
                      {next?.dueDate&&<><br/>Due {next.dueDate}</>}
                    </div>
                    <div style={{fontSize:11.5,color:T.muted,lineHeight:1.6,marginBottom:12}}>
                      Online payment isn't available yet — fees are recorded by the school office when they receive them.
                    </div>
                    <Btn out color={T.forest} full onClick={()=>{
                      if(!downloadCsv(stamped(`fees-${student.name.replace(/\W+/g,"-").toLowerCase()}`,"csv"),
                        student.fees.map(f=>({period:f.month,amount:f.amt,status:f.status,due:f.dueDate??"",paid:f.date??"",method:f.method??""})),
                        [["Period","period"],["Amount (PKR)","amount"],["Status","status"],["Due","due"],["Paid On","paid"],["Method","method"]]))
                        alert("No invoices to download yet.");
                    }} style={{padding:"11px",fontSize:13}}>Download Fee Statement</Btn>
                  </Crd>
                );
              })()}
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:4}}>Invoice Amounts</div>
                <div style={{fontSize:11.5,color:T.muted,marginBottom:12,lineHeight:1.6}}>
                  What the school has billed per period.
                </div>
                {!student.fees.length&&<div style={{fontSize:12,color:T.muted}}>Nothing billed yet.</div>}
                {student.fees.slice(0,6).map((f,i)=>(
                  <div key={f.id??i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:12,color:T.muted}}>{f.month}</span><span style={{fontSize:12,fontWeight:600,color:T.ink}}>Rs. {f.amt.toLocaleString()}</span>
                  </div>
                ))}
              </Crd>
            </div>
          </div>
        </div>
      )}
      {/* TIMETABLE */}
      {tab==="timetable"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Schedule" title="Class Timetable"/>
          <Crd style={{padding:"26px",overflowX:"auto"}}>
            {!student.timetable.length?(
              <div style={{fontSize:13,color:T.muted,padding:"8px 0",lineHeight:1.7}}>
                No timetable has been published for {student.grade} {student.section} yet.
              </div>
            ):(
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:660}}>
                <thead>
                  <tr>
                    <th style={{padding:"10px 16px",textAlign:"left",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",borderBottom:`2px solid ${T.border}`,width:110}}>Day</th>
                    {/* Real period times from the published slots. */}
                    {student.timetablePeriods.map(p=><th key={p.period} style={{padding:"10px 8px",textAlign:"center",fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".4px",borderBottom:`2px solid ${T.border}`}}>{p.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {student.timetable.map((row,i)=>(
                    <tr key={row.day} style={{borderBottom:`1px solid ${T.border}`,background:i%2===0?T.card:T.paper}}>
                      <td style={{padding:"11px 16px",fontSize:12,fontWeight:700,color:T.ink}}>{row.day}</td>
                      {row.p.map((p,j)=>{const c=sc(p);return<td key={j} style={{padding:"7px 5px",textAlign:"center"}}><div style={{background:`${c}15`,color:c,borderRadius:9,padding:"6px 4px",fontSize:10,fontWeight:700,lineHeight:1.3}}>{p}</div></td>;})}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Crd>
          {/* Legend built from the subjects that actually appear, not a fixed list. */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:16}}>
            {[...new Set(student.timetable.flatMap(r=>r.p))].filter(Boolean).map(s=>{
              const c=sc(s);
              return(
                <div key={s} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",background:`${c}12`,borderRadius:99,border:`1px solid ${c}30`}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:c}}/><span style={{fontSize:11,color:c,fontWeight:700}}>{s}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* NOTICES */}
      {tab==="notices"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="School" title="Notices & Announcements"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
            {db.notices.filter(n=>n.instId===user.inst).map(n=>(
              <Crd key={n.id} onClick={()=>setSelNotice(selNotice===n.id?null:n.id)} style={{padding:"24px",border:selNotice===n.id?`1.5px solid ${T.forest}55`:`1px solid ${T.border}`,cursor:"pointer",transition:"border-color .15s"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><Bdg label={n.cat} color={catC(n.cat)} bg={`${catC(n.cat)}15`}/><span style={{fontSize:12,color:T.muted}}>{n.date}</span></div>
                <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:T.ink,marginBottom:8,lineHeight:1.3}}>{n.title}</div>
                {selNotice===n.id?<p style={{fontSize:13,color:T.muted,lineHeight:1.75}}>{n.body}</p>:<p style={{fontSize:13,color:T.muted}}>{n.body.slice(0,65)}…</p>}
                <div style={{marginTop:10,fontSize:12,color:T.green,fontWeight:600}}>{selNotice===n.id?"▲ Collapse":"▼ Read more"}</div>
              </Crd>
            ))}
          </div>
        </div>
      )}
      {/* PROFILE */}
      {tab==="profile"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Account" title="Student Profile"/>
          <div style={{display:"grid",gridTemplateColumns:"290px 1fr",gap:18}}>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"28px",textAlign:"center"}}>
                <div style={{width:80,height:80,borderRadius:"50%",background:G(T.forest,T.mint),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:28,color:"#fff",margin:"0 auto 14px"}}>{ini(student.name)}</div>
                <div style={{fontFamily:"Georgia,serif",fontSize:19,fontWeight:700,color:T.ink}}>{student.name}</div>
                <div style={{fontSize:12,color:T.muted,marginTop:4}}>{student.grade} · Section {student.section}</div>
                <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:12}}>
                  <Bdg label={`GPA ${student.gpa}`} color={T.success} bg={`${T.success}15`}/>
                  <Bdg label={`Rank #${student.rank}`} color={T.purple} bg={`${T.purple}15`}/>
                </div>
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>Academic Info</div>
                {[["Roll No.",student.roll],["Grade",`${student.grade} · ${student.section}`],["GPA",`${student.gpa} / 4.0`],["Rank",`#${student.rank} of ${student.classSize}`],["Subjects",String(student.subjects.length)],["AI Score",`${student.aiScore} / 100`]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:12,color:T.muted}}>{l}</span><span style={{fontSize:12,fontWeight:600,color:T.ink}}>{v}</span>
                  </div>
                ))}
              </Crd>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"26px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Personal Information</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  {[["Full Name",student.name],["Date of Birth",student.dob],["Blood Group",student.blood],["Phone",student.phone]].map(([l,v])=>(
                    <div key={l}><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div><div style={{fontSize:14,color:T.ink,fontWeight:500}}>{v}</div></div>
                  ))}
                  <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:".5px"}}>Address</div><div style={{fontSize:14,color:T.ink,fontWeight:500}}>{student.address}</div></div>
                </div>
              </Crd>
              <Crd style={{padding:"26px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Parent / Guardian</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
                  {[["Name",parent?.name],["Email",parent?.email],["Phone",parent?.phone],["Relation",parent?.rel]].map(([l,v])=>(
                    <div key={l}><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div><div style={{fontSize:13,color:T.ink,fontWeight:500}}>{v}</div></div>
                  ))}
                </div>
              </Crd>
              {/* Notification settings are held per institute and only an admin
                  can change them (GET/PATCH /institutes/me/notifications is
                  ADMIN-only, and there is no per-guardian preference record).
                  This card used to show four switches with preset on/off
                  states and no handler — nothing a parent clicked did
                  anything, or could have. */}
              <Crd style={{padding:"26px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:6}}>Notifications</div>
                <p style={{fontSize:12.5,color:T.muted,lineHeight:1.7,marginBottom:14}}>
                  {inst?.name||"Your school"} decides which alerts go out — fee reminders,
                  attendance notices and message emails are configured by the school office.
                  Contact them to change what you receive at <b style={{color:T.ink}}>{parent?.email}</b>.
                </p>
                <Btn out color={T.forest} full onClick={()=>{setTab("messages");setCompose(true);}} style={{padding:"10px",fontSize:12.5}}>
                  Message the school →
                </Btn>
              </Crd>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
};

// ═══════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════
/** Full-screen status card used while data loads or when a load fails. */
const Splash=({title,detail,tone=T.forest,action,actionLabel})=>(
  <div style={{minHeight:"100vh",background:G(T.forest,"#0C2A1C","160deg"),display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",padding:20}}>
    <style>{css}</style>
    <div style={{width:420,background:T.card,borderRadius:24,padding:"40px",textAlign:"center",boxShadow:"0 32px 80px rgba(0,0,0,.3)",animation:"scaleIn .3s ease"}}>
      <div style={{width:52,height:52,borderRadius:15,background:tone,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,color:"#fff",margin:"0 auto 16px",animation:"shimmer 1.4s ease-in-out infinite"}}>✦</div>
      <div style={{fontFamily:"Georgia,serif",fontSize:22,fontWeight:800,color:T.ink}}>{title}</div>
      {detail&&<div style={{fontSize:13,color:T.muted,marginTop:8,lineHeight:1.6}}>{detail}</div>}
      {action&&<Btn onClick={action} full style={{padding:"11px",fontSize:14,borderRadius:11,marginTop:20}}>{actionLabel}</Btn>}
    </div>
  </div>
);

export default function App() {
  const[screen,setScreen]=useState("landing");
  const[user,setUser]=useState(null);
  // The access token is memory-only, so every load starts signed out until the
  // httpOnly refresh cookie is exchanged for a new one.
  const[restoring,setRestoring]=useState(true);

  const{db,loading,error,reload}=useDb(user);

  const login=u=>{setUser(u);setScreen("app");};

  const logout=async()=>{
    await api.auth.logout().catch(()=>{});
    setUser(null);
    setScreen("landing");
    // Drop the tab hash — it belongs to the portal being left, and the next
    // sign-in may be a role that has no such screen.
    window.history.replaceState(null,"",window.location.pathname);
  };

  // Trade the refresh cookie for an access token on boot, so a page reload
  // doesn't sign anyone out even though nothing is stored in the browser.
  useEffect(()=>{
    setSessionExpiredHandler(()=>{setUser(null);setScreen("login");});
    restoreSession()
      .then(me=>{
        if(!me)return;
        setUser(toLegacyUser(me));
        setScreen("app");
      })
      .finally(()=>setRestoring(false));
  },[]);

  if(restoring) return <Splash title="Signing you in…" detail="Restoring your session."/>;

  if(screen==="landing") return <Landing onLogin={()=>setScreen("login")} onSignup={()=>setScreen("signup")} onDemoLogin={login}/>;
  if(screen==="login")   return <Login   onLogin={login} onBack={()=>setScreen("landing")} onSignup={()=>setScreen("signup")}/>;
  if(screen==="signup")  return <Signup  onBack={()=>setScreen("landing")} onLogin={()=>setScreen("login")}/>;

  if(!user) return <Landing onLogin={()=>setScreen("login")} onSignup={()=>setScreen("signup")} onDemoLogin={login}/>;

  if(error) return (
    <Splash
      // A network failure already explains itself; only a server-side error
      // needs the extra nudge about the API being up.
      title={error.isNetwork?"Can't reach the server":"Couldn't load your data"}
      detail={error.message}
      tone={T.danger}
      action={reload}
      actionLabel="Try again"
    />
  );

  // Only take over the screen on the very first load. Later refetches keep
  // the portal mounted — otherwise every save would unmount it and throw the
  // user back to the dashboard tab.
  if(!db) return <Splash title="Loading your portal…" detail="Fetching the latest from your institute."/>;

  // If an institute outgrows what a portal loads into memory, say so rather
  // than quietly showing a subset.
  if(db.truncated) console.warn(
    `[educonnect] This institute has more records than the portal loads at once `+
    `(${db.studentTotal??"many"} students). Showing the first 5,000. `+
    `List views need server-side paging at this size.`
  );

  // `onUser` lets a portal push back an updated profile (name/phone) so the
  // sidebar and header reflect it without a re-login.
  const props={user,db,onLogout:logout,onReload:reload,setDb:reload,onUser:setUser};
  if(user.role==="superadmin") return <SuperAdmin  {...props}/>;
  if(user.role==="admin")      return <AdminPortal {...props}/>;
  if(user.role==="teacher")    return <TeacherPortal {...props}/>;
  if(user.role==="parent")     return <ParentPortal {...props}/>;

  return <Splash title="Unknown role" detail={`No portal exists for "${user.role}".`} tone={T.danger} action={logout} actionLabel="Sign out"/>;
}






