import { Fragment, useState, useEffect, useMemo, useReducer } from "react";
import api from "./api/endpoints.js";
import { t, tc, tn, useLang, getLang, setLang } from "./i18n.js";
import { tokens, restoreSession, setSessionExpiredHandler } from "./api/client.js";
import { useDb, fetchAll } from "./hooks/useDb.js";
import { timeAgo, toLegacyMessage, toLegacyUser } from "./adapters/legacy.js";
import { downloadCsv, downloadJson, stamped } from "./utils/download.js";
import { readImportSheet, IMPORT_COLUMNS, importTemplateRows } from "./utils/csv.js";
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

    /* And the box around the table has to be willing to shrink, or the
       scroll region never gets to scroll.

       A grid or flex child sizes itself with min-width:auto, which is its
       content's width. A card holding a seven-column table therefore refused
       to go below ~815px on a 375px screen, and max-width:100% above resolved
       against that 815px rather than the phone. The table looked fine, because
       the damage lands on whatever sits beside it: the Fees list's own
       'Show 50 more' button sat at x=377-614, entirely off the right of the
       screen and unreachable, on a page that reported no overflow because the
       card was quietly scrolling instead of the body. */
    [style*="display:grid"]>*,[style*="display: grid"]>*{min-width:0!important;}

    /* Marking a register on a phone.

       Present, Absent, Late and Leave plus a name and an avatar want about
       450px of a 375px row, so Leave sat off the right edge — reachable, but
       only by scrolling that one row sideways, on the screen a teacher opens
       more than any other. The choices drop to their own full-width line and
       take a quarter each, which makes them larger targets than they were on
       the desktop row rather than smaller. */
    /* The class and date above that register are 170px and 150px wide with
       a gap, which is more than a 375px card has to give: the date field ran
       12px past the screen and took its calendar button with it, so the one
       control for marking yesterday's register could not be tapped. Both go
       full width and stack. */
    .ec-pickers{width:100%!important;flex-wrap:wrap!important;}
    .ec-pickers>*{flex:1 1 100%!important;min-width:0!important;}

    .ec-attrow{flex-wrap:wrap!important;}
    .ec-attmarks{width:100%!important;gap:6px!important;}
    .ec-attmarks>*{flex:1!important;text-align:center!important;padding-left:2px!important;padding-right:2px!important;}
  }

  /* 1024px laptops still overflowed with a fixed side column, so the
     asymmetric two-pane layouts collapse here rather than at 900px. */
  @media (max-width:1100px){
    /* 4-up KPI rows become 2-up before collapsing entirely. */
    [style*="repeat(4,1fr)"],[style*="repeat(4, 1fr)"]{grid-template-columns:repeat(2,1fr)!important;}
    [style*="repeat(6,1fr)"],[style*="repeat(6, 1fr)"]{grid-template-columns:repeat(3,1fr)!important;}

    /* Content + fixed side rail (dashboards, fees, messages) stacks.

       Enumerated rather than picked, because an attribute selector cannot
       match a number range and a hand-listed set silently misses whatever
       width nobody thought of. It missed two: the student detail panel is
       "1fr 370px" and three layouts use 290px, so on a laptop the panel was
       laid out past the right edge of a page that does not scroll sideways —
       clicking a student highlighted the row and showed nothing at all.

       If you add a rail outside 240-420px, add it here. To check:
         grep -oE "[0-9]{3}px 1fr|1fr [0-9]{3}px" src/App.jsx | sort -u
    */
    [style*="240px 1fr"],[style*="1fr 240px"],[style*="250px 1fr"],[style*="1fr 250px"],[style*="260px 1fr"],[style*="1fr 260px"],
    [style*="270px 1fr"],[style*="1fr 270px"],[style*="280px 1fr"],[style*="1fr 280px"],[style*="290px 1fr"],[style*="1fr 290px"],
    [style*="300px 1fr"],[style*="1fr 300px"],[style*="310px 1fr"],[style*="1fr 310px"],[style*="320px 1fr"],[style*="1fr 320px"],
    [style*="330px 1fr"],[style*="1fr 330px"],[style*="340px 1fr"],[style*="1fr 340px"],[style*="350px 1fr"],[style*="1fr 350px"],
    [style*="360px 1fr"],[style*="1fr 360px"],[style*="370px 1fr"],[style*="1fr 370px"],[style*="380px 1fr"],[style*="1fr 380px"],
    [style*="390px 1fr"],[style*="1fr 390px"],[style*="400px 1fr"],[style*="1fr 400px"],[style*="410px 1fr"],[style*="1fr 410px"],
    [style*="420px 1fr"],[style*="1fr 420px"],
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

    /* Except rows of small cards. A KPI tile is a word and a number, and
       stacking four of them costs four screens of scrolling to read four
       figures. They pair up instead. Declared after the blanket rule above,
       which is what lets it win.

       minmax(0,1fr) rather than 1fr: a bare 1fr is minmax(auto,1fr), so a card
       whose longest word is wider than half the row refuses to shrink and the
       pair overflows a container that clips rather than scrolls. */
    .ec-pair{grid-template-columns:repeat(2,minmax(0,1fr))!important;}

    /* The landing page sets 64px of side padding, which is a third of a
       phone's width spent on empty margin — the content was living in 247px
       of a 375px screen, so everything wrapped hard and the page ran to seven
       screens. The vertical rhythm is halved with it: 88px between sections
       is a desktop measure, not a phone one. */
    [style*="88px 64px"],[style*="80px 64px"]{padding:44px 20px!important;}
    [style*="96px 64px 88px"]{padding:44px 20px 40px!important;}
    [style*="36px 64px"]{padding:26px 20px!important;}
    [style*="14px 64px"]{padding:12px 18px!important;}

    /* A paired KPI tile is about 100px wide once the icon rail has taken its
       share of a 375px screen, and desktop padding plus a 28px serif does not
       fit that: the plan name spilled straight out of its card. The tile
       tightens, and the decorative glyph steps out of the way rather than
       competing for room it does not earn. */
    .ec-kpi{padding:14px 12px!important;}
    .ec-kpi-v{font-size:21px!important;}
    .ec-kpi-i{display:none!important;}

    /* main had no padding of its own until this rule gave it some, while the
       page div kept its desktop 34px — so a phone was paying 48px a side for
       margin. One of them holds the padding now, and it leaves room at the
       foot for the bottom bar to sit over nothing. */
    main{padding:0!important;}
    .ec-page{padding:16px 14px 86px!important;}

    /* The sheet lays its own items out; the blanket rule above would stack
       five of them into a column tall enough to need scrolling. */
    .ec-more{grid-template-columns:repeat(3,minmax(0,1fr))!important;}

    /* The signup plan card puts features and price side by side. On a phone
       the price block holds 131px of a 214px row and the feature pills are
       squeezed into what is left, one word per line. It stacks instead. */
    .ec-planrow{flex-direction:column!important;align-items:flex-start!important;gap:10px!important;}
    .ec-planrow>div:last-child{text-align:left!important;}

    /* A screen heading and its buttons share one row. On a phone a 26px serif
       title and two buttons do not both fit, and the buttons were landing on
       top of the word they sit beside. They drop underneath instead. */
    .ec-sechead{flex-direction:column!important;align-items:flex-start!important;gap:12px!important;}
    .ec-sechead>*:last-child{width:100%!important;}
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
  /* Printing a result card: everything except the card itself gets out of
     the way, so File > Print produces the card alone on the page. */
  /* These controls are drawn as spans and divs; once they are tab stops they
     need somewhere visible for focus to land. */
  [role="button"]:focus-visible,button:focus-visible,a:focus-visible,
  input:focus-visible,select:focus-visible,textarea:focus-visible{
    outline:2px solid #2D6A4F;outline-offset:2px;border-radius:6px;
  }
  @media print{
    body *{visibility:hidden!important;}
    .ec-print-card,.ec-print-card *{visibility:visible!important;}
    .ec-print-card{position:absolute!important;left:0;top:0;width:100%;border:none!important;
      border-radius:0!important;padding:0!important;box-shadow:none!important;}
    .ec-no-print{display:none!important;}
  }
  @media (max-width:520px){
    .ec-topnav{padding:12px 14px!important;gap:10px!important;justify-content:center;}
    .ec-topnav > div:first-child{margin-right:0!important;width:100%;}
  }
`;

// ═══════════════════════════════════════════════════════════════════
// GLOBAL STATE / DATABASE
// ═══════════════════════════════════════════════════════════════════
/**
 * Pricing shown on the landing page and the signup plan picker.
 *
 * Every line here is something the product actually does today. It previously
 * sold SMS alerts, API access, multi-branch, white-label and online payments —
 * none of which exist — and taking money for them would be a straightforward
 * misrepresentation. When one of those is genuinely built, add it back.
 */
const PLANS = [
  {id:"starter", name:"Starter",  price:29999,  maxStudents:200,  color:T.blue,
   features:["Up to 200 students","Attendance tracking","Fee management","Parent & Teacher portals","Reports & CSV exports","Email support"]},
  {id:"growth",  name:"Growth",   price:49999, maxStudents:800,  color:T.forest, popular:true,
   features:["Up to 800 students","Everything in Starter","Performance insights","Advanced fee management","Bulk student import","Priority support"]},
  {id:"elite",   name:"Elite",    price:79999, maxStudents:9999, color:T.purple,
   features:["Unlimited students","Everything in Growth","Full insight suite","Institute logo & colours","Dedicated account manager"]},
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
/**
 * "1 student", "3 students" — a count and its noun, agreeing.
 *
 * Scattered `{n} students` was correct for every number except one, and one is
 * common: a teacher with a single class, a class with a single child, a school
 * that has issued its first invoice. "1 students" on a dashboard reads as
 * unfinished software, and it was showing in a dozen places.
 *
 * Pass `plural` where English does not simply add an s.
 */
const count = (n, singular, plural = `${singular}s`) =>
  `${n} ${n === 1 ? singular : plural}`;
/**
 * Today as "YYYY-MM-DD" in the browser's own timezone.
 *
 * `toISOString().slice(0,10)` is the obvious version and it is wrong here: it
 * reports the UTC date, and Pakistan runs UTC+5, so between midnight and 5am
 * it names yesterday. It was already defaulting the attendance form to the
 * wrong day, and as a `max` it would have refused the teacher the very day
 * they were standing in.
 */
const todayISO = () => {
  const d = new Date(), p = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
};
const gc  = g => g==="A+"||g==="A"?T.success:g==="A−"||g==="B+"?T.warning:T.danger;
const sc  = n => ({Mathematics:T.purple,"Computer Sc.":T.forest,Urdu:T.green,English:T.blue,Physics:T.gold,Chemistry:T.clay,Biology:T.teal,"Pak. Studies":T.pink}[n]||T.muted);
const catC= c => ({Academic:T.blue,Finance:T.warning,Event:T.purple,General:T.muted}[c]||T.muted);

const Av=({name,size=36,bg=T.forest,color="#fff",fs=13,style={}})=>(
  <div style={{width:size,height:size,borderRadius:"50%",background:bg,color,fontSize:fs,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,letterSpacing:.3,...style}}>{ini(name)}</div>
);
const Bdg=({label,color,bg,style={}})=>(
  <span style={{display:"inline-flex",alignItems:"center",padding:"2px 10px",borderRadius:99,fontSize:11,fontWeight:600,color,background:bg,whiteSpace:"nowrap",...style}}>{label}</span>
);
/**
 * The foot of a windowed list.
 *
 * Four screens hold their whole table in memory and draw a slice of it, so
 * this is the one place that says which slice, and the one place that can
 * widen it. `total` is the filtered total, not the roll: after a search it
 * counts what matched.
 */
/**
 * A message and everything said back.
 *
 * Replies were stored, delivered and never shown. A parent wrote to a teacher,
 * the teacher answered, and neither of them could see the answer: every portal
 * rendered `selMsg.body` and stopped there, so a conversation looked like a
 * single message that nobody had responded to. The adapter had been mapping
 * `replies` for its own amusement — nothing read them, and the list endpoint
 * does not even send them, only a count.
 *
 * Sides follow authorship rather than role, so the same component works in all
 * three portals: your own words on the right, theirs on the left.
 */
const MessageThread=({root,meId})=>{
  if(!root)return null;
  const turns=[root,...(root.replies??[])];
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {turns.map((m,i)=>{
        const mine=Boolean(meId&&m.fromId===meId);
        return(
          <div key={m.id??i} style={{display:"flex",flexDirection:"column",alignItems:mine?"flex-end":"flex-start"}}>
            <div style={{fontSize:11,color:T.muted,marginBottom:4,padding:"0 4px"}}>
              {mine?"You":m.from}{m.fromRole?` · ${m.fromRole}`:""} · {m.time}
            </div>
            <div style={{background:mine?`${T.forest}0E`:T.paper,borderRadius:14,padding:"14px 18px",maxWidth:"min(560px, 88%)",
              fontSize:14,color:T.ink,lineHeight:1.85,border:`1px solid ${mine?`${T.forest}22`:T.border}`,whiteSpace:"pre-wrap"}}>
              {m.body}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ShowMore=({shown,total,page,onMore,onAll})=>{
  if(total<=shown)return null;
  return(
    <div style={{display:"flex",gap:12,alignItems:"center",justifyContent:"center",flexWrap:"wrap",padding:"16px 6px 2px",borderTop:`1px solid ${T.border}`}}>
      <span style={{fontSize:12,color:T.muted}}>Showing {shown.toLocaleString()} of {total.toLocaleString()}</span>
      <Btn out color={T.forest} onClick={onMore}>Show {Math.min(page,total-shown)} more</Btn>
      {total-shown>page&&<Btn out color={T.muted} onClick={onAll}>Show all</Btn>}
    </div>
  );
};
const Crd=({children,style={},onClick,className})=>(
  <div className={className} onClick={onClick} style={{background:T.card,borderRadius:18,border:`1px solid ${T.border}`,boxShadow:"0 2px 12px rgba(15,23,42,.06)",...style,cursor:onClick?"pointer":undefined}}>{children}</div>
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
      {/*
        `??`, not `||`.

        Every filter in the product offers its own escape hatch as the first
        option — {v:"",l:"All grades"} — and an empty string is falsy, so
        `o.v||o` handed the <option> the whole object and it rendered
        value="[object Object]". Picking "All grades" then set the filter to
        that string rather than clearing it, and the roster filtered by a
        grade nobody is in: an admin narrowed to Grade 5, saw 200 of 2,000,
        went back to All grades and was told the school had none. The select
        still read "All grades", because the value it was given matched no
        option and it fell back to displaying the first.

        A plain string option still works: `o.v` is undefined for those, and
        `??` falls through exactly as `||` did.
      */}
      {options.map(o=><option key={`${o.v??o}`} value={o.v??o}>{o.l??o}</option>)}
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
  <Crd className="ec-kpi" style={{padding:"20px 22px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:6}}>{label}</div>
        <div className="ec-kpi-v" style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:800,color,lineHeight:1}}>{value}</div>
        {sub&&<div style={{fontSize:11,color:T.muted,marginTop:5}}>{sub}</div>}
      </div>
      <div className="ec-kpi-i" style={{fontSize:26,color,opacity:.3,lineHeight:1}}>{icon}</div>
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
/**
 * Makes a non-button element behave like one for a keyboard.
 *
 * The app draws most of its controls as styled spans and divs, which is fine
 * to look at and unreachable by Tab — the sidebar, the logout row and every
 * modal's close cross included, so the whole product could only be operated
 * with a mouse. Spreading this onto such an element gives it the role, a stop
 * in the tab order, a name for a screen reader, and Enter/Space.
 *
 * New controls should just be a <Btn>. This is for the ones already drawn.
 */
const pressable=(onPress,label,{disabled=false}={})=>({
  role:"button",
  tabIndex:disabled?-1:0,
  "aria-label":label,
  "aria-disabled":disabled||undefined,
  onClick:disabled?undefined:onPress,
  onKeyDown:disabled?undefined:(e)=>{
    if(e.key==="Enter"||e.key===" "){e.preventDefault();onPress(e);}
  },
});

/**
 * The row actions, pinned to the right edge of a people table.
 *
 * These tables carry more columns than a laptop window fits, and below 768px
 * they become their own horizontal scroll region (A§9). That left Edit and
 * Delete off the right edge, behind a scrollbar thin enough to miss — so the
 * buttons did not look out of view, they looked absent, and "delete does
 * nothing" was a fair conclusion to draw. Pinning the last column keeps them
 * where the eye looks for them at every width.
 *
 * The opaque background is not decoration: without it the scrolled columns
 * would show straight through the pinned cell.
 */
/**
 * A people table scrolls itself, at every width — not only below 768px.
 *
 * A§9 made tables their own scroll region on phones. Between that breakpoint
 * and roughly 1100px the table was still wider than the page but was *not* a
 * scroll region, so the last column was simply clipped with no scrollbar to
 * reach it: on an ordinary laptop the delete button did not exist. Owning the
 * overflow at all widths is what makes the pinned column below reachable.
 */
const scrollTable = { display: "block", overflowX: "auto", maxWidth: "100%", whiteSpace: "nowrap" };
const scrollRows = { width: "max-content", minWidth: "100%" };

const stickyCol = { position: "sticky", right: 0, background: T.card, zIndex: 1 };
const stickyHead = { ...stickyCol, zIndex: 2 };

const Modal=({title,onClose,children,width=500})=>(
  <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn .2s"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:T.card,borderRadius:22,width,maxWidth:"94vw",maxHeight:"88vh",overflowY:"auto",boxShadow:"0 32px 80px rgba(0,0,0,.28)",animation:"scaleIn .2s"}}>
      <div style={{padding:"24px 28px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:T.ink}}>{title}</div>
        <span {...pressable(onClose,"Close dialog")} style={{cursor:"pointer",color:T.muted,fontSize:24,lineHeight:1,fontWeight:300}}>×</span>
      </div>
      <div style={{padding:"18px 28px 28px"}}>{children}</div>
    </div>
  </div>
);
const SecHead=({pre,title,action})=>(
  <div className="ec-sechead" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:24,animation:"fadeUp .35s ease"}}>
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

/**
 * Picking several things from a list, when a dropdown can only pick one.
 *
 * Two of the product’s commonest facts are lists and were modelled as single
 * values by the forms alone: a guardian has more than one child in the school,
 * and a teacher teaches more than one subject. Both are lists in the database
 * and lists in the API; only the forms insisted otherwise.
 *
 * Deliberately a checkbox list rather than a multi-select: a school office
 * clerk should not have to know that ctrl-click exists, and the selection
 * stays readable while it is being made.
 */
const PickList=({label,options,value=[],onChange,empty="Nothing to choose from yet.",max=null,note=null})=>{
  const chosen=new Set(value);
  /**
   * Updated from the previous selection rather than from the `value` prop.
   *
   * Reading the prop looked equivalent and was not: two ticks inside one
   * React batch both compute from the same pre-batch prop, so the second
   * overwrites the first and one of the two picks silently disappears. That
   * showed up ticking two subjects for a teacher — three were selected on
   * screen and two were saved.
   *
   * `onChange` therefore has to be a state setter, which is what every caller
   * passes.
   */
  const toggle=(id)=>{
    onChange(prev=>{
      const next=new Set(prev??[]);
      if(next.has(id))next.delete(id);
      else{
        if(max&&next.size>=max)return [...next];
        next.add(id);
      }
      return [...next];
    });
  };
  return(
    <div style={{marginBottom:14}}>
      {label&&<div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:".6px"}}>{label}</div>}
      {options.length===0
        ?<div style={{fontSize:12,color:T.muted,padding:"10px 14px",border:`1.5px dashed ${T.border}`,borderRadius:10}}>{empty}</div>
        :<div style={{border:`1.5px solid ${T.border}`,borderRadius:10,maxHeight:170,overflowY:"auto",background:T.paper}}>
          {options.map(o=>{
            const on=chosen.has(o.v);
            return(
              <div key={o.v} {...pressable(()=>toggle(o.v),`${on?"Unselect":"Select"} ${o.l}`)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"9px 13px",cursor:"pointer",
                  borderBottom:`1px solid ${T.border}`,background:on?`${T.forest}0D`:"transparent"}}>
                <div style={{width:16,height:16,borderRadius:5,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                  border:`1.5px solid ${on?T.forest:T.border}`,background:on?T.forest:"transparent",color:"#fff",fontSize:11,lineHeight:1}}>
                  {on?"✓":""}
                </div>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontSize:12.5,color:T.ink,fontWeight:on?700:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.l}</div>
                  {o.sub&&<div style={{fontSize:11,color:T.muted,marginTop:1}}>{o.sub}</div>}
                </div>
              </div>
            );
          })}
        </div>}
      {(note||chosen.size>0)&&(
        <div style={{fontSize:11,color:T.muted,marginTop:5}}>
          {chosen.size>0?`${chosen.size} selected`:""}{chosen.size>0&&note?" · ":""}{note}
        </div>
      )}
    </div>
  );
};

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
        {!lockCollapsed&&<div {...pressable(()=>setCollapsed(c=>!c),collapsed?"Expand the sidebar":"Collapse the sidebar")} style={{cursor:"pointer",color:T.muted,fontSize:20,flexShrink:0,lineHeight:1,marginLeft:"auto",userSelect:"none"}}>{collapsed?"›":"‹"}</div>}
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
          <div key={n.id} {...pressable(()=>setTab(n.id),n.label)} aria-current={tab===n.id?"page":undefined} title={collapsed?n.label:undefined}
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
        <div {...pressable(onLogout,"Log out")} style={{display:"flex",alignItems:"center",gap:10,padding:collapsed?"12px 16px":"10px 12px",borderRadius:11,cursor:"pointer",color:T.danger,transition:"all .15s",whiteSpace:"nowrap"}}>
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
/**
 * The examination terms of the year the school is running.
 *
 * Terms are named by the school now, so a picker cannot hold a fixed list —
 * every screen that files a mark under a term has to ask what this school calls
 * them. Fetched once per mount; failure leaves the list empty, which renders as
 * "No term" and still records a perfectly valid mark.
 */
const useSessionTerms=()=>{
  const[terms,setTerms]=useState([]);
  useEffect(()=>{
    let cancelled=false;
    api.institutes.session()
      .then(s=>s?.current?.id?api.institutes.terms(s.current.id):null)
      .then(r=>{if(!cancelled&&r)setTerms(r.terms??[]);})
      .catch(()=>{/* a picker with no terms still records marks */});
    return()=>{cancelled=true;};
  },[]);
  return terms;
};

/**
 * The subjects the school actually teaches.
 *
 * The "Add Teacher" form used to offer eight hard-coded names — Mathematics,
 * Physics, Chemistry, Biology, English, Urdu, Computer Sc., Pak. Studies — so a
 * school teaching Islamiat, Quran, Sindhi or Accounting could not say who taught
 * them. Same mistake the term enum made: a list the platform decided on behalf
 * of every school in the country.
 *
 * `nonce` lets a form refetch after it creates one, so a subject added here
 * appears in the list straight away.
 */
const useSubjects=(nonce=0)=>{
  const[subjects,setSubjects]=useState([]);
  useEffect(()=>{
    let cancelled=false;
    api.subjects.list({limit:200})
      .then(r=>{if(!cancelled)setSubjects(Array.isArray(r)?r:(r?.data??[]));})
      .catch(()=>{/* an empty list still lets a name be typed in */});
    return()=>{cancelled=true;};
  },[nonce]);
  return subjects;
};

/** "Mathematics · Grade 8" — a subject is per grade, so the grade is part of its name. */
const subjectLabel=(s)=>s.grade?`${s.name} · ${s.grade}`:s.name;

/** "Grade 8 A · Roll 2024-001" — enough to tell two children of one family apart. */
const childLabel=(s)=>[[s.grade,s.section].filter(Boolean).join(" "),s.roll?`Roll ${s.roll}`:null]
  .filter(Boolean).join(" · ")||null;

/**
 * "Ahmed Sahib (3 children)" — so an admin attaching a sibling can see they
 * are attaching to a family the school already knows, not making a duplicate.
 */
const guardianLabel=(p)=>{
  const n=p.children?.length??p.studentIds?.length??0;
  return n?`${p.name} (${n} ${n===1?"child":"children"})`:p.name;
};


/**
 * The examination terms of the year the school is running, and their shares.
 *
 * The API for this arrived with ExamTerm; the screen did not, so in practice a
 * school could not rename a term or set a weight at all — the same gap the
 * grading policy had. A weighting nobody can reach is a weighting that does not
 * exist.
 *
 * Module scope, so a half-typed table survives a parent re-render.
 */
const ExamTermsCard=({onSaved})=>{
  const[session,setSession]=useState(null);
  const[terms,setTerms]=useState([]);
  const[weighted,setWeighted]=useState(false);
  const[draft,setDraft]=useState({});
  const[adding,setAdding]=useState("");
  const[busy,setBusy]=useState("");
  const[err,setErr]=useState("");
  const[note,setNote]=useState("");
  const[nonce,setNonce]=useState(0);

  useEffect(()=>{
    let cancelled=false;
    api.institutes.session()
      .then(s=>{
        if(cancelled||!s?.current?.id)return null;
        setSession(s.current);
        return api.institutes.terms(s.current.id);
      })
      .then(r=>{
        if(cancelled||!r)return;
        setTerms(r.terms??[]);
        setWeighted(Boolean(r.weighted));
        setDraft(Object.fromEntries((r.terms??[]).map(t=>[t.id,{
          name:t.name,
          weightage:t.weightage==null?"":String(t.weightage),
        }])));
      })
      .catch(e=>{if(!cancelled)setErr(e.message||"Could not read the terms.");});
    return()=>{cancelled=true;};
  },[nonce]);

  const set=(id,k,v)=>setDraft(d=>({...d,[id]:{...d[id],[k]:v}}));
  const reload=()=>setNonce(n=>n+1);

  /**
   * The shares as typed, so the card can say where they stand before anything
   * is saved. Weighting only counts when every term carries one and they add
   * up to a hundred — the same rule the server applies.
   */
  const shares=terms.map(t=>draft[t.id]?.weightage??"");
  const numbers=shares.map(v=>v===""?null:Number(v));
  const allSet=numbers.length>0&&numbers.every(n=>Number.isFinite(n));
  const total=numbers.reduce((sum,n)=>sum+(Number.isFinite(n)?n:0),0);
  const willWeight=allSet&&total===100;

  /**
   * Every row at once, because the shares only mean anything together.
   *
   * A row at a time looked tidier and was a trap: saving the first row
   * reloaded the table and threw away the share typed into the second, so a
   * school entering 40 and 60 saved 40 and lost 60 without being told.
   */
  const saveAll=async()=>{
    setBusy("save");setErr("");setNote("");
    try{
      const changed=terms.filter(t=>{
        const d=draft[t.id];
        const w=d.weightage===""?null:Number(d.weightage);
        return d.name.trim()!==t.name||w!==t.weightage;
      });
      if(!changed.length){setNote("Nothing to change.");return;}
      for(const t of changed){
        const d=draft[t.id];
        await api.institutes.updateTerm(session.id,t.id,{
          name:d.name.trim(),
          weightage:d.weightage===""?null:Number(d.weightage),
        });
      }
      setNote(`${count(changed.length,"term")} saved.`);
      reload();
      onSaved?.();
    }catch(e){
      setErr(e.errors?.[0]?.message||e.message||"Could not save those terms.");
      // Whatever did land is on the server; show the truth rather than the draft.
      reload();
    }finally{setBusy("");}
  };

  const addTerm=async()=>{
    const name=adding.trim();
    if(!name)return;
    setBusy("add");setErr("");setNote("");
    try{
      // Added at the end of the year, then moved with the arrows if it belongs
      // somewhere else.
      const sequence=(terms.reduce((m,t)=>Math.max(m,t.sequence),0))+1;
      await api.institutes.addTerm(session.id,{name,sequence});
      setAdding("");
      setNote(`"${name}" added.`);
      reload();
    }catch(e){
      setErr(e.errors?.[0]?.message||e.message||"Could not add that term.");
    }finally{setBusy("");}
  };

  /**
   * Moves a term one place up or down the year.
   *
   * Sends the whole order rather than the one term: two terms cannot share a
   * position, so a single-term move has nowhere to land. The old advice was
   * to delete a term and add it back, which released every mark recorded
   * under it — a bad price for a cosmetic change.
   */
  const move=async(index,delta)=>{
    const to=index+delta;
    if(to<0||to>=terms.length)return;
    const order=terms.map(t=>t.id);
    [order[index],order[to]]=[order[to],order[index]];
    setBusy("order");setErr("");setNote("");
    try{
      const r=await api.institutes.reorderTerms(session.id,order);
      setNote(r?.__message??"Order saved.");
      reload();
      onSaved?.();
    }catch(e){
      setErr(e.message||"Could not reorder the terms.");
      reload();
    }finally{setBusy("");}
  };

  const removeTerm=async(t)=>{
    if(!window.confirm(
      `Remove "${t.name}" from ${session?.name}?\n\n`+
      "Marks recorded under it are kept — they simply stop belonging to a term, "+
      "and stop counting toward a weighted result."
    ))return;
    setBusy(t.id);setErr("");setNote("");
    try{
      const r=await api.institutes.removeTerm(session.id,t.id);
      setNote(r?.__message??`"${t.name}" removed.`);
      reload();
      onSaved?.();
    }catch(e){
      setErr(e.message||"Could not remove that term.");
    }finally{setBusy("");}
  };

  const cell={padding:"6px 8px",borderRadius:8,border:`1.5px solid ${T.border}`,fontSize:12.5,
    color:T.ink,background:T.paper,outline:"none",width:"100%"};

  if(!session&&!err)return(
    <Crd style={{padding:"26px"}}>
      <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:8}}>Exam Terms</div>
      <div style={{fontSize:12.5,color:T.muted}}>Reading this year’s terms…</div>
    </Crd>
  );

  return(
    <Crd style={{padding:"26px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10,flexWrap:"wrap",marginBottom:6}}>
        <div style={{fontSize:14,fontWeight:700,color:T.ink}}>Exam Terms</div>
        <div style={{fontSize:11,color:T.muted,fontWeight:600}}>{session?.name}</div>
      </div>
      <div style={{fontSize:12,color:T.muted,lineHeight:1.6,marginBottom:16}}>
        What this school calls its terms, and what share each carries in the annual result.
        These belong to <b>{session?.name}</b> alone — changing them leaves earlier years
        reported exactly as they were.
      </div>

      <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:"24px 1fr 92px 40px 34px",gap:8,padding:"8px 10px",background:T.paper,
          fontSize:10.5,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".6px"}}>
          <div>#</div><div>Term</div><div>Share %</div><div/><div/>
        </div>
        {terms.map((t,i)=>(
          <div key={t.id} style={{display:"grid",gridTemplateColumns:"24px 1fr 92px 40px 34px",gap:8,padding:"7px 10px",
            alignItems:"center",borderTop:`1px solid ${T.border}`}}>
            <div style={{fontSize:12,color:T.muted,fontWeight:700}}>{t.sequence}</div>
            <input value={draft[t.id]?.name??""} onChange={e=>set(t.id,"name",e.target.value)} style={cell} placeholder="Half Yearly"/>
            <input value={draft[t.id]?.weightage??""} onChange={e=>set(t.id,"weightage",e.target.value)} inputMode="numeric" style={{...cell,textAlign:"center"}} placeholder="—"/>
            {/* Unsaved names and shares survive a move: the order is a
                separate write, and the draft is rebuilt from the reload. */}
            <div style={{display:"flex",flexDirection:"column",gap:1,alignItems:"center"}}>
              {[["▲",-1,i>0],["▼",1,i<terms.length-1]].map(([glyph,delta,can])=>(
                <span key={glyph}
                  {...(can&&!busy?pressable(()=>move(i,delta),`Move ${t.name} ${delta<0?"earlier":"later"}`):{})}
                  style={{fontSize:9,lineHeight:1.1,userSelect:"none",
                    color:can&&!busy?T.forest:T.border,cursor:can&&!busy?"pointer":"default"}}>{glyph}</span>
              ))}
            </div>
            <span {...pressable(()=>removeTerm(t),`Remove ${t.name}`,{disabled:Boolean(busy)})}
              style={{cursor:busy?"default":"pointer",color:T.danger,fontSize:16,textAlign:"center",lineHeight:1,userSelect:"none"}}>×</span>
          </div>
        ))}
        {terms.length===0&&(
          <div style={{padding:"14px",fontSize:12,color:T.muted,borderTop:`1px solid ${T.border}`}}>No terms in this year yet.</div>
        )}
      </div>

      <div style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:14}}>
        <div style={{flex:1}}>
          <input value={adding} onChange={e=>setAdding(e.target.value)} style={cell} placeholder="Add a term — e.g. Pre-Board"/>
        </div>
        <Btn out color={T.forest} onClick={addTerm} disabled={!adding.trim()||Boolean(busy)} style={{padding:"7px 14px",fontSize:12}}>
          {busy==="add"?"…":"+ Add"}
        </Btn>
      </div>

      {/* Where the shares stand. The rule is the server’s: every term carries
          one, and they add up to a hundred — anything else pools the marks. */}
      <div style={{padding:"10px 13px",borderRadius:10,marginBottom:12,lineHeight:1.6,
        background:willWeight?`${T.success}10`:T.paper,
        border:`1px solid ${willWeight?T.success+"35":T.border}`,fontSize:12}}>
        {!allSet
          ?<span style={{color:T.muted}}>
             Shares are optional. Leave them blank and the annual result pools the year’s marks,
             which is what it does today.
           </span>
          :total===100
            ?<span style={{color:T.success,fontWeight:600}}>
               Weighted: {terms.map(t=>`${draft[t.id]?.name} ${draft[t.id]?.weightage}%`).join(" · ")}.
               {" "}The annual result combines the terms in these shares.
             </span>
            :<span style={{color:T.warning,fontWeight:600}}>
               Shares add up to {total}%, not 100% — until they do, the annual result pools the marks.
             </span>}
        {weighted!==willWeight&&(
          <div style={{color:T.muted,marginTop:4,fontWeight:400}}>Not saved yet.</div>
        )}
      </div>

      <Btn onClick={saveAll} disabled={Boolean(busy)||terms.length===0} full style={{padding:"10px",marginBottom:12}}>
        {busy==="save"?"Saving…":"Save Terms"}
      </Btn>

      {err&&(
        <div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",
          fontSize:12.5,marginBottom:10,border:`1px solid ${T.danger}30`,lineHeight:1.5}}>{err}</div>
      )}
      {note&&<div style={{fontSize:12,color:T.success,fontWeight:600,lineHeight:1.5}}>{note}</div>}
    </Crd>
  );
};
/**
 * The school's own grading scale and pass mark.
 *
 * Both were decided once, for every school on the platform. No two Pakistani
 * schools agree: A+ sits at 90 in some and 80 in others, plenty stop at A/B/C,
 * and the pass mark is 33% across most boards but 40% in a good many private
 * schools. The API to set them has existed for a while; there was no screen,
 * so in practice no school could.
 *
 * Module scope on purpose. Defined inside the portal it would be a new
 * component on every parent render, and React would remount it — wiping a
 * half-typed band table the moment anything else on the page changed.
 */
const GradingPolicyCard=({onSaved})=>{
  const[policy,setPolicy]=useState(null);
  const[bands,setBands]=useState([]);
  const[pass,setPass]=useState("");
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState("");
  const[note,setNote]=useState("");
  const[nonce,setNonce]=useState(0);
  const[tryScore,setTryScore]=useState("72");

  const load=(p)=>{
    setPolicy(p);
    setBands(p.bands.map(b=>({min:String(b.min),letter:b.letter,point:String(b.point??0)})));
    setPass(String(p.passingPercentage));
  };

  useEffect(()=>{
    let cancelled=false;
    api.institutes.grading()
      .then(p=>{if(!cancelled)load(p);})
      .catch(e=>{if(!cancelled)setErr(e.message||"Could not read the grading policy.");});
    return()=>{cancelled=true;};
  },[nonce]);

  const setBand=(i,k,v)=>setBands(rows=>rows.map((r,j)=>j===i?{...r,[k]:v}:r));
  const addBand=()=>setBands(rows=>[...rows,{min:"",letter:"",point:"0"}]);
  const dropBand=(i)=>setBands(rows=>rows.filter((_,j)=>j!==i));

  const parsed=bands.map(b=>({min:Number(b.min),letter:b.letter.trim(),point:Number(b.point)}));
  const sorted=[...parsed].sort((a,b)=>b.min-a.min);

  /**
   * The same rules the API enforces, said before a round-trip — and the one it
   * cannot enforce.
   *
   * A scale whose failing grade reaches above the pass mark prints a
   * contradiction on the card: "Grade F" and "Result: Pass" on one sheet. That
   * is the school's business rather than an error, so it is a warning here and
   * not a refusal.
   */
  const passNum=Number(pass);
  const problems=[];
  if(!bands.length)problems.push("A grading scale needs at least one band.");
  if(parsed.some(b=>!b.letter))problems.push("Every band needs a letter.");
  if(parsed.some(b=>!Number.isFinite(b.min)||b.min<0||b.min>100))
    problems.push("Every band starts at a percentage between 0 and 100.");
  if(parsed.some(b=>!Number.isFinite(b.point)||b.point<0||b.point>5))
    problems.push("Grade points run from 0 to 5.");
  if(new Set(parsed.map(b=>b.min)).size!==parsed.length)
    problems.push("Two bands start at the same percentage — a mark would have two grades.");
  if(bands.length&&!parsed.some(b=>b.min===0))
    problems.push("The lowest band has to start at 0, or a low mark has no grade at all.");
  if(!Number.isFinite(passNum)||passNum<0||passNum>100)
    problems.push("The pass mark is a percentage between 0 and 100.");

  const bandAt=(score)=>sorted.find(b=>score>=b.min)??sorted[sorted.length-1];
  const lowestPassing=Number.isFinite(passNum)?bandAt(passNum):null;
  const contradiction=!problems.length&&lowestPassing&&lowestPassing.min<passNum
    ?`A child on ${passNum}% would be graded "${lowestPassing.letter}" and told they passed. `+
     `Add a band starting at ${passNum} if that reads wrong.`
    :null;

  const save=async()=>{
    setBusy(true);setErr("");setNote("");
    try{
      const r=await api.institutes.updateGrading({bands:sorted,passingPercentage:passNum});
      load({...r,isDefault:false,defaults:policy?.defaults});
      setNote(r.__message??"Grading policy saved.");
      onSaved?.(r.__message);
    }catch(e){
      setErr(e.errors?.[0]?.message||e.message||"Could not save that scale.");
    }finally{setBusy(false);}
  };

  const reset=async()=>{
    if(!policy?.defaults)return;
    if(!window.confirm(
      "Put the grading scale back to the platform default?\n\n"+
      "Nothing already recorded changes — result cards are graded from whichever scale is in force when they are read."
    ))return;
    setBusy(true);setErr("");setNote("");
    try{
      const r=await api.institutes.updateGrading({
        bands:policy.defaults.bands,
        passingPercentage:policy.defaults.passingPercentage,
      });
      load({...r,isDefault:false,defaults:policy.defaults});
      setNote("Back on the platform default scale.");
      onSaved?.("Grading policy reset to the platform default.");
    }catch(e){
      setErr(e.message||"Could not reset the scale.");
    }finally{setBusy(false);}
  };

  const cell={padding:"6px 8px",borderRadius:8,border:`1.5px solid ${T.border}`,fontSize:12.5,
    color:T.ink,background:T.paper,outline:"none",width:"100%"};

  if(!policy&&!err)return(
    <Crd style={{padding:"26px"}}>
      <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:8}}>Grading Policy</div>
      <div style={{fontSize:12.5,color:T.muted}}>Reading the school’s scale…</div>
    </Crd>
  );

  const preview=Number(tryScore);
  const previewBand=Number.isFinite(preview)&&sorted.length?bandAt(preview):null;

  return(
    <Crd style={{padding:"26px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10,flexWrap:"wrap",marginBottom:6}}>
        <div style={{fontSize:14,fontWeight:700,color:T.ink}}>Grading Policy</div>
        {policy?.isDefault&&(
          <span style={{fontSize:11,color:T.muted,fontWeight:600}}>on the platform default</span>
        )}
      </div>
      <div style={{fontSize:12,color:T.muted,lineHeight:1.6,marginBottom:16}}>
        Where each grade starts, and the mark a child has to reach to pass. Result cards,
        the gradebook and every screen that shows a letter use this.
      </div>

      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <span style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".6px"}}>Pass mark</span>
        <input value={pass} onChange={e=>setPass(e.target.value)} inputMode="numeric"
          style={{...cell,width:72,textAlign:"center",fontWeight:700}}/>
        <span style={{fontSize:12,color:T.muted}}>% — 33 on most boards, 40 in many private schools.</span>
      </div>

      <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 34px",gap:8,padding:"8px 10px",background:T.paper,
          fontSize:10.5,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".6px"}}>
          <div>From %</div><div>Grade</div><div>Points</div><div/>
        </div>
        {bands.map((b,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 34px",gap:8,padding:"7px 10px",
            alignItems:"center",borderTop:`1px solid ${T.border}`}}>
            <input value={b.min} onChange={e=>setBand(i,"min",e.target.value)} inputMode="numeric" style={cell} placeholder="80"/>
            <input value={b.letter} onChange={e=>setBand(i,"letter",e.target.value)} style={cell} placeholder="A+"/>
            <input value={b.point} onChange={e=>setBand(i,"point",e.target.value)} inputMode="decimal" style={cell} placeholder="4"/>
            <span {...pressable(()=>dropBand(i),`Remove the ${b.letter||"unnamed"} band`)}
              style={{cursor:"pointer",color:T.danger,fontSize:16,textAlign:"center",lineHeight:1,userSelect:"none"}}>×</span>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:14}}>
        <Btn out color={T.forest} onClick={addBand} style={{padding:"7px 14px",fontSize:12}}>+ Add band</Btn>
        <span style={{fontSize:12,color:T.muted}}>Order does not matter — they are sorted on save.</span>
      </div>

      {/* What the scale actually does to a mark, before it reaches a card. */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 13px",borderRadius:10,
        background:T.paper,border:`1px solid ${T.border}`,marginBottom:14,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:T.muted}}>A child on</span>
        <input value={tryScore} onChange={e=>setTryScore(e.target.value)} inputMode="numeric"
          style={{...cell,width:64,textAlign:"center",fontWeight:700}}/>
        <span style={{fontSize:12,color:T.muted}}>% gets</span>
        <span style={{fontSize:13,fontWeight:800,color:T.ink}}>{previewBand?previewBand.letter:"—"}</span>
        {Number.isFinite(preview)&&Number.isFinite(passNum)&&(
          <span style={{fontSize:12,fontWeight:700,color:preview>=passNum?T.success:T.danger}}>
            {preview>=passNum?"Pass":"Fail"}
          </span>
        )}
      </div>

      {problems.map(m=>(
        <div key={m} style={{background:`${T.danger}0D`,color:T.danger,borderRadius:9,padding:"8px 12px",
          fontSize:12,marginBottom:8,border:`1px solid ${T.danger}25`}}>{m}</div>
      ))}
      {contradiction&&(
        <div style={{background:`${T.warning}14`,color:T.warning,borderRadius:9,padding:"9px 13px",
          fontSize:12,marginBottom:8,border:`1px solid ${T.warning}35`,lineHeight:1.5}}>{contradiction}</div>
      )}
      {err&&(
        <div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",
          fontSize:12.5,marginBottom:10,border:`1px solid ${T.danger}30`}}>{err}</div>
      )}
      {note&&<div style={{fontSize:12,color:T.success,fontWeight:600,marginBottom:10,lineHeight:1.5}}>{note}</div>}

      <div style={{display:"flex",gap:10}}>
        <Btn out color={T.muted} onClick={reset} disabled={busy||!policy?.defaults}
          style={{flex:1,padding:"10px",fontSize:12.5}}>Platform default</Btn>
        <Btn onClick={save} disabled={busy||problems.length>0} style={{flex:2,padding:"10px"}}>
          {busy?"Saving…":"Save Grading Policy"}
        </Btn>
      </div>
    </Crd>
  );
};

/** The children of one guardian, named — "Zain, Alia and Omar". */
const childrenSentence=(names=[])=>
  names.length<2?(names[0]??""):`${names.slice(0,-1).join(", ")} and ${names[names.length-1]}`;

/**
 * Which child a guardian is looking at.
 *
 * The parent portal opened `db.students.find(s => s.id === parent.studentId)`
 * and never offered another — so a mother of three saw one child for ever,
 * with no sign the app knew about the others. Every child was already
 * fetched in full by the loader; nothing was missing but a way to say which.
 *
 * Hidden for a family with one child, where a picker of one is just noise.
 */
const ChildSwitcher=({children:kids,value,onChange})=>{
  if(!kids||kids.length<2)return null;
  return(
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:18}}>
      <span style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".6px"}}>{t("Viewing")}</span>
      {kids.map(k=>{
        const on=k.id===value;
        return(
          <div key={k.id} {...pressable(()=>onChange(k.id),`Show ${k.name}`)}
            style={{display:"flex",alignItems:"center",gap:8,padding:"7px 13px",borderRadius:99,cursor:"pointer",
              border:`1.5px solid ${on?T.forest:T.border}`,background:on?T.forest:T.card,transition:"all .15s"}}>
            <Av name={k.name} size={22} bg={on?"#ffffff33":`${T.forest}18`} color={on?"#fff":T.forest} fs={9}/>
            <div style={{lineHeight:1.25}}>
              <div style={{fontSize:12.5,fontWeight:on?700:600,color:on?"#fff":T.ink,whiteSpace:"nowrap"}}>{k.name}</div>
              {childLabel(k)&&<div style={{fontSize:10.5,color:on?"#ffffffcc":T.muted,whiteSpace:"nowrap"}}>{childLabel(k)}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

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

/**
 * The phone's navigation.
 *
 * A parent reads this on a phone between school runs, and a 64px rail down
 * the left spends a fifth of a 375px screen saying what a bottom bar says for
 * nothing — at the end of the screen a thumb actually reaches. Four screens
 * sit in the bar; the rest, and the way out, live behind More, because a bar
 * with nine targets in it is a bar nobody can hit.
 */
/**
 * `moreLabel` and `logoutLabel` arrive as props because this bar is shared by
 * all four portals, and only the parent portal is translated. Calling t() here
 * would put Urdu in front of an admin who happens to use the same phone.
 */
const BottomNav=({nav,tab,setTab,user,inst,onLogout,moreLabel="More",logoutLabel="Log out"})=>{
  const[more,setMore]=useState(false);
  const primary=nav.slice(0,4);
  const rest=nav.slice(4);
  const restHoldsTab=rest.some(n=>n.id===tab);

  const Item=({n,active,onPick})=>(
    <div {...pressable(onPick,n.label)}
      style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        gap:3,padding:"7px 2px 6px",cursor:"pointer",color:active?T.forest:T.muted,position:"relative"}}>
      <span style={{fontSize:17,lineHeight:1}}>{n.icon}</span>
      <span style={{fontSize:9.5,fontWeight:active?700:500,maxWidth:"100%",whiteSpace:"nowrap",
        overflow:"hidden",textOverflow:"ellipsis"}}>{n.label}</span>
      {n.badge>0&&(
        <span style={{position:"absolute",top:3,left:"calc(50% + 6px)",background:T.clay,color:"#fff",
          borderRadius:99,fontSize:9,fontWeight:700,padding:"0 5px",lineHeight:"14px"}}>{n.badge}</span>
      )}
    </div>
  );

  return(
    <>
      {more&&<div {...pressable(()=>setMore(false),"Close the menu")}
        style={{position:"fixed",inset:0,background:"rgba(15,23,42,.45)",zIndex:899}}/>}

      {more&&(
        <div style={{position:"fixed",left:0,right:0,bottom:58,zIndex:901,background:T.card,
          borderRadius:"20px 20px 0 0",padding:"16px 14px 20px",maxHeight:"62vh",overflowY:"auto",
          boxShadow:"0 -10px 30px rgba(15,23,42,.18)"}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",
            letterSpacing:"1px",marginBottom:12,padding:"0 4px"}}>{inst?.name||"EduConnect"}</div>
          <div className="ec-more" style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:6}}>
            {rest.map(n=>(
              <Item key={n.id} n={n} active={tab===n.id} onPick={()=>{setMore(false);setTab(n.id);}}/>
            ))}
          </div>
          <div {...pressable(()=>{setMore(false);onLogout?.();},logoutLabel)}
            style={{marginTop:14,padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,
              textAlign:"center",fontSize:13,fontWeight:600,color:T.danger,cursor:"pointer"}}>
            {logoutLabel}
          </div>
        </div>
      )}

      <nav style={{position:"fixed",left:0,right:0,bottom:0,zIndex:900,background:T.card,
        borderTop:`1px solid ${T.border}`,display:"flex",alignItems:"stretch",
        boxShadow:"0 -2px 14px rgba(15,23,42,.06)"}}>
        {primary.map(n=>(
          <Item key={n.id} n={n} active={tab===n.id&&!more} onPick={()=>{setMore(false);setTab(n.id);}}/>
        ))}
        {/* Always drawn, even with nothing extra to hold: this is where Log out
            lives, and a portal with four screens would otherwise strand a phone
            with no way out. */}
        <Item n={{id:"__more",label:moreLabel,icon:"⋯"}} active={more||(restHoldsTab&&!more)}
          onPick={()=>setMore(m=>!m)}/>
      </nav>
    </>
  );
};

const Shell=({nav,tab,setTab,user,inst,collapsed,setCollapsed,onLogout,children,moreLabel,logoutLabel})=>{
  const narrow=useMediaQuery("(max-width: 900px)");
  // Below 900px the sidebar is always icons-only, so content keeps its room.
  const isCollapsed=collapsed||narrow;
  /**
   * On a phone it steps aside entirely for a bottom bar. Even collapsed the
   * rail is 64px of a 375px screen, and it puts navigation at the top-left —
   * the far corner from the thumb holding the phone.
   */
  const phone=useMediaQuery("(max-width: 640px)");

  return(
    <div style={{display:"flex",minHeight:"100vh",background:T.bg,maxWidth:"100vw",overflowX:"hidden"}}>
      <style>{css}</style>
      {!phone&&(
        <Sidebar nav={nav} tab={tab} setTab={setTab} user={user} inst={inst}
          collapsed={isCollapsed} setCollapsed={narrow?()=>{}:setCollapsed} onLogout={onLogout} lockCollapsed={narrow}/>
      )}
      <main style={{flex:1,overflowY:"auto",minWidth:0,maxWidth:"100%",animation:"fadeUp .38s ease"}}>
        {/* On a demo deployment every session is a demo session, so this says so
            once, quietly, everywhere. Someone clicking through four portals
            should never have to wonder whether the marks in front of them
            belong to a real child. */}
        {DEMO_LOGINS_ENABLED&&(
          <div style={{background:`${T.gold}18`,borderBottom:`1px solid ${T.gold}40`,color:T.ink,
            padding:"9px 34px",fontSize:12.5,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontWeight:700,color:T.gold}}>Demo</span>
            <span style={{color:T.muted}}>Sample data, shared with everyone trying EduConnect. Nothing here belongs to a real school.</span>
          </div>
        )}
        <div className="ec-page" style={{padding:"28px 34px"}}>{children}</div>
      </main>
      {phone&&(
        <BottomNav nav={nav} tab={tab} setTab={setTab} user={user} inst={inst} onLogout={onLogout}
          moreLabel={moreLabel} logoutLabel={logoutLabel}/>
      )}
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
/**
 * Whether to advertise the seeded demo logins.
 *
 * The credentials below are real, they are public, and `sa@educonnect.io` is
 * a super admin over every institute — so a production bundle must not ship
 * them. `import.meta.env.DEV` is true only under `vite dev`; a `vite build`
 * makes this false and the panels below vanish from the output entirely.
 *
 * `VITE_ENABLE_DEMO=true` opts a *built* bundle back in, for a deliberately
 * public demo deployment. It has to be set at build time and never should be
 * on a deployment holding real school data.
 */
const DEMO_LOGINS_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === "true";

/**
 * The four views, described by what they show rather than who they log in as.
 *
 * The credentials stay here because they are what signs the visitor in; they
 * are simply not put on screen. A list of emails and passwords is a developer
 * shortcut, and it reads like one.
 */
const DEMO_ACCOUNTS=[
  {role:"School Admin",  email:"admin@bhs.edu",    pass:"admin123",  desc:"Run a school day to day — enrol students, set fees, mark registers, publish results"},
  {role:"Teacher",       email:"hassan@bhs.edu",   pass:"teach123",  desc:"Take attendance, enter marks and watch a class average move as you do"},
  {role:"Parent",        email:"sara@gmail.com",   pass:"parent123", desc:"See a child's result card, attendance and fee challans, and message the school"},
  {role:"Platform Owner",email:"sa@educonnect.io", pass:"super123",  desc:"The view for running EduConnect itself — every school, its plan and its billing"},
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
      /**
       * The seed hint is genuinely the answer when a developer hits this, and
       * useless to anyone else — a visitor cannot run npm. So it is shown only
       * where it can be acted on.
       */
      setDemoErr(
        e.status===401
          ? import.meta.env.DEV
            ? "The demo accounts aren't in this database yet. Run `npm run db:seed` in the backend, then try again."
            : "This demo isn't available right now. Please try again shortly."
          : "We couldn't open the demo. Please try again."
      );
      setDemoBusy("");
    }
  };
  const feats=[
    {ic:"◈",t:"Role-Based Portals",d:"Separate, tailored dashboards for Super Admin, Institute Admin, Teachers, and Parents — every role sees exactly what they need.",c:T.purple},
    {ic:"✦",t:"Performance Insights",d:"Project where each student is heading, surface those falling behind early, and turn it into specific, explainable recommendations.",c:T.gold},
    {ic:"◷",t:"Attendance Tracking",d:"Daily registers with pattern analysis, late-arrival detection, and email notifications to parents.",c:T.blue},
    {ic:"◑",t:"Fee Management",d:"Invoicing, automated reminders, payment history, fee structure management, and defaulter reports.",c:T.success},
    {ic:"◎",t:"Communication Hub",d:"Direct messaging between teachers, parents, and administration, with read status and notifications.",c:T.teal},
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
          <span style={{color:T.mint,fontSize:12}}>✦</span>
          {/* What it is, not who is supposedly using it. */}
          <span style={{fontSize:12,color:"rgba(255,255,255,.75)",fontWeight:600}}>Built for Pakistani schools — terms, challans and result cards</span>
        </div>
        <h1 style={{fontFamily:"Georgia,serif",fontSize:60,fontWeight:900,color:"#fff",lineHeight:1.08,maxWidth:760,margin:"0 auto 22px",animation:"fadeUp .6s ease"}}>
          One Platform.<br/><em style={{color:T.mint,fontStyle:"italic"}}>Every School. Every Role.</em>
        </h1>
        <p style={{fontSize:18,color:"rgba(255,255,255,.6)",maxWidth:580,margin:"0 auto 40px",lineHeight:1.8}}>Performance analytics, parent communication, attendance tracking, fee management — all in one beautifully designed platform.</p>
        <div style={{display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap",marginBottom:64}}>
          <Btn onClick={onSignup} color={T.mint} text={T.forest} style={{padding:"15px 36px",fontSize:15,fontWeight:700,borderRadius:12,boxShadow:`0 8px 32px ${T.mint}44`}}>Start {TRIAL_DAYS}-Day Free Trial →</Btn>
          {DEMO_LOGINS_ENABLED&&<Btn onClick={()=>setDemoOpen(true)} out color="rgba(255,255,255,.5)" style={{padding:"15px 36px",fontSize:15,color:"rgba(255,255,255,.8)",borderRadius:12}}>See a Live Demo</Btn>}
        </div>
        {/* Each fact carries a line of explanation now, so they are wider than
            the bare numbers were. A narrower gap and a shared basis keeps four
            of them on one row on a laptop and wraps them two-by-two rather than
            three-and-one on anything smaller. */}
        <div style={{display:"flex",gap:"22px 26px",justifyContent:"center",flexWrap:"wrap"}}>
          {HERO_FACTS.map(([v,l,note])=>(
            <div key={l} style={{textAlign:"center",flex:"0 1 132px"}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:36,fontWeight:800,color:"#fff",whiteSpace:"nowrap"}}>{v}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.45)",marginTop:4,fontWeight:600,letterSpacing:".5px",textTransform:"uppercase"}}>{l}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:3,maxWidth:150}}>{note}</div>
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
        {/* No school count here either — there is nothing to join yet. */}
        <p style={{fontSize:16,color:"rgba(255,255,255,.55)",marginBottom:36}}>
          Register your school and run a full session on it — free for {TRIAL_DAYS} days.
        </p>
        <Btn onClick={onSignup} color={T.mint} text={T.forest} style={{padding:"16px 40px",fontSize:16,fontWeight:700,borderRadius:12}}>Register Your School Now →</Btn>
      </div>
      {/* Footer */}
      <div style={{background:T.ink,padding:"36px 64px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,borderRadius:8,background:T.forest,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#fff",fontSize:12}}>✦</span></div>
          <span style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:"Georgia,serif"}}>EduConnect</span>
        </div>
        <span style={{fontSize:12,color:"rgba(255,255,255,.3)"}}>© {new Date().getFullYear()} EduConnect. Built in Pakistan for Pakistani schools.</span>
        {/* Only what exists. "Privacy · Terms · Support" used to sit here as
            links to pages that were never written, and before that a line
            describing the project rather than the product. These two go
            somewhere: they are the sections above. */}
        <div style={{display:"flex",gap:20}}>
          {[["Features","ec-features"],["Pricing","ec-pricing"]].map(([label,id])=>(
            <span key={id} onClick={()=>document.getElementById(id)?.scrollIntoView({behavior:"smooth"})}
              style={{fontSize:12,color:"rgba(255,255,255,.45)",cursor:"pointer"}}>{label}</span>
          ))}
        </div>
      </div>
      {/* A product demo, not a list of logins.
          The credentials are still what signs you in, but showing them turned
          this into a developer shortcut wearing a modal. A visitor picks the
          role whose view they want; what they get told is what they will see. */}
      {DEMO_LOGINS_ENABLED&&demoOpen&&<Modal title="See EduConnect in action" onClose={()=>{setDemoOpen(false);setDemoErr("");}} width={480}>
        <p style={{fontSize:13,color:T.muted,marginBottom:18,lineHeight:1.7}}>
          Choose a role to open its portal. Each one sees the same school from a
          different side, with the permissions that role really has.
        </p>
        {DEMO_ACCOUNTS.map(({role,email,pass,desc})=>(
          <div key={role} onClick={()=>{if(!demoBusy)tryDemo(email,pass);}}
            style={{padding:"14px",background:T.paper,borderRadius:12,marginBottom:10,border:`1px solid ${T.border}`,cursor:demoBusy?"default":"pointer"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:T.forest,marginBottom:3}}>{role}</div>
                <div style={{fontSize:11.5,color:T.muted,lineHeight:1.5}}>{desc}</div>
              </div>
              <Btn onClick={(ev)=>{ev.stopPropagation();tryDemo(email,pass);}} style={{padding:"9px 15px",fontSize:12,flexShrink:0}} disabled={Boolean(demoBusy)}>
                {demoBusy===email?"Opening…":"Open"}
              </Btn>
            </div>
          </div>
        ))}
        <p style={{fontSize:11.5,color:T.muted,marginTop:14,marginBottom:2,lineHeight:1.6}}>
          This is sample data shared by everyone trying the demo, so it changes as
          people use it. Nothing here belongs to a real school.
        </p>
        {demoErr&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:12.5,marginTop:4,marginBottom:10,border:`1px solid ${T.danger}30`,lineHeight:1.6}}>{demoErr}</div>}
        <Btn onClick={onLogin} out color={T.muted} full style={{marginTop:6}}>Or sign in manually →</Btn>
      </Modal>}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════
const Login=({onLogin,onBack,onSignup,onForgot})=>{
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
        <Btn onClick={submit} full disabled={loading} style={{padding:"12px",fontSize:14,borderRadius:11,marginBottom:14}}>{loading?"Signing in…":"Sign In →"}</Btn>
        <div style={{textAlign:"center",marginBottom:14}}>
          <span onClick={onForgot} style={{fontSize:13,color:T.green,cursor:"pointer",fontWeight:600}}>Forgot your password?</span>
        </div>
        <div style={{textAlign:"center",fontSize:13,color:T.muted,marginBottom:20}}>No account? <span onClick={onSignup} style={{color:T.green,cursor:"pointer",fontWeight:700}}>Register your school</span></div>
        {/* A developer convenience, and only that.
            Gated on DEV rather than DEMO_LOGINS_ENABLED so it stays off a
            public demo deployment too: a sign-in screen listing addresses is
            the opposite of the impression a demo is meant to make, and demo
            visitors have the role picker on the homepage instead. */}
        {import.meta.env.DEV&&<div style={{background:T.paper,borderRadius:14,padding:"16px",border:`1px solid ${T.border}`}}>
          <div style={{fontSize:10,fontWeight:700,color:T.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:".5px"}}>Developer sign-in</div>
          {DEMO_ACCOUNTS.map(({email:e,pass:p,role})=>(
            <div key={e} onClick={()=>{setEmail(e);setPass(p);}} style={{fontSize:12,color:T.forest,cursor:"pointer",marginBottom:5,fontWeight:600,padding:"5px 8px",borderRadius:7,transition:"background .1s"}}
              onMouseEnter={ev=>ev.currentTarget.style.background=`${T.forest}12`}
              onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>→ {role}: {e}</div>
          ))}
        </div>}
        <div style={{textAlign:"center",marginTop:18}}><span onClick={onBack} style={{fontSize:12,color:T.muted,cursor:"pointer"}}>← Back to homepage</span></div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// PASSWORD RESET
// ═══════════════════════════════════════════════════════════════════
/** The card both reset screens sit in — same furniture as Login. */
const AuthCard=({title,subtitle,children})=>(
  <div style={{minHeight:"100vh",background:G(T.forest,"#0C2A1C","160deg"),display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",padding:20}}>
    <style>{css}</style>
    <div style={{width:440,maxWidth:"100%",background:T.card,borderRadius:24,padding:"40px",boxShadow:"0 32px 80px rgba(0,0,0,.3)",animation:"scaleIn .3s ease"}}>
      <div style={{textAlign:"center",marginBottom:26}}>
        <div style={{width:52,height:52,borderRadius:15,background:T.forest,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,color:"#fff",margin:"0 auto 16px",boxShadow:`0 8px 24px ${T.forest}55`}}>✦</div>
        <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:800,color:T.ink}}>{title}</div>
        {subtitle&&<div style={{fontSize:13,color:T.muted,marginTop:6,lineHeight:1.6}}>{subtitle}</div>}
      </div>
      {children}
    </div>
  </div>
);

/**
 * Request a reset link.
 *
 * The confirmation is deliberately identical whether or not the address has an
 * account. The API answers 200 either way precisely so this screen can't be
 * used to find out who is registered, and it would be pointless for the server
 * to withhold that if the UI then leaked it.
 */
const ForgotPassword=({onBack})=>{
  const[email,setEmail]=useState("");
  const[sent,setSent]=useState(false);
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState("");

  const vEmail=email?emailError(email):"";

  const submit=async()=>{
    setBusy(true);setErr("");
    try{
      await api.auth.forgotPassword(email.trim());
      setSent(true);
    }catch(e){
      // Validation and transport problems are safe to show; they say nothing
      // about whether the account exists.
      setErr(e.errors?.[0]?.message||e.message||"Couldn't send the reset link. Please try again.");
    }finally{
      setBusy(false);
    }
  };

  if(sent) return(
    <AuthCard title="Check your email"
      subtitle={<>If an account exists for <b style={{color:T.ink}}>{email.trim()}</b>, a reset link is on its way. It expires shortly, so use it soon.</>}>
      <div style={{background:`${T.success}10`,border:`1px solid ${T.success}30`,borderRadius:12,padding:"14px 16px",fontSize:12.5,color:T.muted,lineHeight:1.7,marginBottom:18}}>
        Nothing arrived? Check your spam folder, then try again — and confirm you typed the address you registered with.
      </div>
      <Btn onClick={onBack} full style={{padding:"12px",fontSize:14,borderRadius:11}}>Back to sign in</Btn>
    </AuthCard>
  );

  return(
    <AuthCard title="Reset your password" subtitle="Enter your email and we'll send you a link to set a new one.">
      <Inp label="Email Address" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" type="email"/>
      {vEmail&&<div style={{fontSize:11.5,color:T.danger,marginTop:-8,marginBottom:12}}>{vEmail}</div>}
      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:14,border:`1px solid ${T.danger}30`}}>{err}</div>}
      <Btn onClick={submit} full disabled={busy||!email.trim()||Boolean(vEmail)} style={{padding:"12px",fontSize:14,borderRadius:11,marginBottom:14}}>
        {busy?"Sending…":"Send reset link"}
      </Btn>
      <div style={{textAlign:"center"}}><span onClick={onBack} style={{fontSize:13,color:T.muted,cursor:"pointer"}}>← Back to sign in</span></div>
    </AuthCard>
  );
};

/**
 * Redeem a reset link.
 *
 * The token arrives in the URL and is lifted into state once, then wiped from
 * the address bar by the caller — a reset link is a bearer credential and has
 * no business sitting in browser history, a referrer header, or over someone's
 * shoulder. Reloading afterwards means opening the emailed link again, which
 * is the right trade.
 */
const ResetPassword=({token,onDone,onRequestNew})=>{
  const[f,setF]=useState({password:"",confirm:""});
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState("");
  const[done,setDone]=useState(false);

  const vPass=f.password?passwordError(f.password):"";
  const mismatch=f.confirm&&f.password!==f.confirm?"The two passwords don't match.":"";
  const missingToken=!token||token.length<20;

  const submit=async()=>{
    setBusy(true);setErr("");
    try{
      await api.auth.resetPassword(token,f.password);
      setF({password:"",confirm:""});
      setDone(true);
    }catch(e){
      setErr(e.errors?.[0]?.message||e.message||"Couldn't reset your password.");
    }finally{
      setBusy(false);
    }
  };

  if(done) return(
    <AuthCard title="Password updated"
      subtitle="You can sign in with your new password now. For safety, anyone still signed in to this account elsewhere has been signed out.">
      <Btn onClick={onDone} full style={{padding:"12px",fontSize:14,borderRadius:11}}>Sign in →</Btn>
    </AuthCard>
  );

  if(missingToken) return(
    <AuthCard title="That link looks incomplete"
      subtitle="The reset link is missing its token. Copy the whole link from the email, or request a new one.">
      <Btn onClick={onRequestNew} full style={{padding:"12px",fontSize:14,borderRadius:11}}>Request a new link</Btn>
    </AuthCard>
  );

  return(
    <AuthCard title="Choose a new password" subtitle="Pick something you haven't used here before.">
      <Inp label="New Password" type="password" value={f.password} onChange={e=>s("password",e.target.value)} placeholder="Min 8 characters"/>
      <Inp label="Confirm New Password" type="password" value={f.confirm} onChange={e=>s("confirm",e.target.value)} placeholder="••••••••"/>
      {[vPass,mismatch].filter(Boolean).map(m=>(
        <div key={m} style={{background:`${T.danger}0D`,color:T.danger,borderRadius:9,padding:"8px 12px",fontSize:12,marginBottom:10,border:`1px solid ${T.danger}25`}}>{m}</div>
      ))}
      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
      <Btn onClick={submit} full disabled={busy||!f.password||!f.confirm||Boolean(vPass||mismatch)} style={{padding:"12px",fontSize:14,borderRadius:11,marginBottom:14}}>
        {busy?"Updating…":"Set new password"}
      </Btn>
      <div style={{textAlign:"center"}}><span onClick={onRequestNew} style={{fontSize:13,color:T.muted,cursor:"pointer"}}>Link expired? Request a new one</span></div>
    </AuthCard>
  );
};

// ═══════════════════════════════════════════════════════════════════
// SIGNUP (INSTITUTE REGISTRATION)
// ═══════════════════════════════════════════════════════════════════
/** Month names for the session-start picker, in the order a year runs. */
/**
 * The figures in the hero, and the point of them.
 *
 * These were "500+ Schools", "2.4M+ Students", "99.9% Uptime" and "4.9★
 * Rating". Not one of them was true, or could have been: nobody has signed
 * up, nothing has been rated, and there is no uptime record because there is
 * no production deployment. A star rating nobody gave and a school count
 * nobody joined are the same misrepresentation the plan features were, and
 * they sit above a "Start free trial" button.
 *
 * What replaces them is checkable against the product in the next click:
 * four portals exist, the admin nav has these modules in it, the trial length
 * is what the server actually grants, and the price is read from the same
 * list the pricing table renders, so the two can never drift apart.
 */
/**
 * The trial length, in one place.
 *
 * It was written out four times across the landing page and the signup
 * wizard, so a change to the platform setting would have left some of them
 * saying one thing and some another. This matches the server default; a
 * platform admin who changes `trialDays` has to change it here too, which is
 * one edit rather than four.
 */
const TRIAL_DAYS=14;
const HERO_FACTS=[
  ["4","Portals","Platform, admin, teacher, parent"],
  ["11","Modules","Attendance to fee challans"],
  [`${TRIAL_DAYS}`,"Day trial","No card required"],
  // The currency sits in the label, so the figure stays about as wide as the
  // others and the row does not break onto two lines on a laptop.
  [Math.min(...PLANS.map(p=>p.price)).toLocaleString("en-PK"),"PKR monthly, from","Billed per school"],
];

const MONTHS_LONG=["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

const Signup=({onBack,onLogin})=>{
  const[step,setStep]=useState(1);
  const[plan,setPlan]=useState("");
  const[done,setDone]=useState(false);
  /**
   * The academic defaults, asked once instead of assumed forever.
   *
   * April, 33% and three terms were platform decisions the school was never
   * consulted on. April is right for most of Pakistan and wrong for Karachi
   * and the Cambridge track, and a school that noticed later had to go and
   * edit its session dates by hand. The values below are the same defaults, so
   * a school that clicks straight through is exactly where it used to be.
   */
  const[f,setF]=useState({name:"",city:"",phone:"",email:"",students:"",adminName:"",adminEmail:"",adminPass:"",adminPhone:"",
    startMonth:"4",pass:"33",termNames:["First Term","Mid Term","Final Term"]});
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

  const cleanTerms=f.termNames.map(t=>t.trim()).filter(Boolean);
  // Two terms called the same thing is not a year — the API says so too, but
  // there is no reason to make the school find out by submitting.
  const dupTerm=cleanTerms.find((t,i)=>cleanTerms.findIndex(x=>x.toLowerCase()===t.toLowerCase())!==i);
  const passNum=Number(f.pass);
  const passBad=f.pass!==""&&(!Number.isFinite(passNum)||passNum<0||passNum>100);
  const step4Ok=cleanTerms.length>0&&!dupTerm&&!passBad;

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
        sessionStartMonth:Number(f.startMonth),
        ...(f.pass!==""&&{passingPercentage:passNum}),
        terms:cleanTerms,
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
          {[1,2,3,4].map(n=><div key={n} style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:34,height:34,borderRadius:"50%",background:step>=n?T.mint:"rgba(255,255,255,.15)",color:step>=n?T.forest:"rgba(255,255,255,.4)",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s"}}>{step>n?"✓":n}</div>
            {n<4&&<div style={{width:34,height:2,background:step>n?T.mint:"rgba(255,255,255,.15)",transition:"background .3s",borderRadius:99}}/>}
          </div>)}
        </div>}

        <Crd style={{borderRadius:24,padding:"38px",boxShadow:"0 32px 80px rgba(0,0,0,.28)",animation:"scaleIn .3s"}}>
          {done?(
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:56,marginBottom:16}}>🎉</div>
              <div style={{fontFamily:"Georgia,serif",fontSize:26,fontWeight:800,color:T.ink,marginBottom:12}}>Registration Successful!</div>
              <p style={{fontSize:14,color:T.muted,lineHeight:1.8,marginBottom:24}}>
                <b>{f.name}</b> has been registered on EduConnect on the <b>{selPlan?.name}</b> plan.<br/>
                {/* Signup sends no email — it never has. Telling a school its
                    credentials were mailed sent them to wait for a message that
                    was never going to arrive, and past the one screen that had
                    the password on it. */}
                Write these down before you leave this page — they are not emailed.
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
              <p style={{fontSize:13,color:T.muted,marginBottom:22}}>{TRIAL_DAYS}-day free trial. No credit card required.</p>
              <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:22}}>
                {PLANS.map(pl=>(
                  <div key={pl.id} onClick={()=>setPlan(pl.id)}
                    style={{padding:"18px 20px",borderRadius:14,border:`2px solid ${plan===pl.id?pl.color:T.border}`,background:plan===pl.id?`${pl.color}09`:T.paper,cursor:"pointer",transition:"all .15s",position:"relative"}}>
                    {pl.popular&&<div style={{position:"absolute",top:12,right:12,background:`${pl.color}18`,color:pl.color,borderRadius:99,padding:"2px 10px",fontSize:11,fontWeight:700}}>Popular</div>}
                    <div className="ec-planrow" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
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
                <div style={{fontSize:12,color:T.muted}}>{TRIAL_DAYS}-day free trial starts immediately. Invoice sent at end of trial period.</div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <Btn onClick={()=>setStep(1)} out color={T.muted} style={{flex:1,padding:"11px",borderRadius:11}}>← Back</Btn>
                <Btn onClick={()=>plan&&setStep(3)} style={{flex:2,padding:"11px",borderRadius:11}} disabled={!plan}>Next: Admin Setup →</Btn>
              </div>
            </>
          ):step===3?(
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
                <Btn onClick={()=>step3Ok&&setStep(4)} style={{flex:2,padding:"11px",borderRadius:11}} disabled={!step3Ok}>Next: Academic Year →</Btn>
              </div>
            </>
          ):(
            <>
              <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:800,color:T.ink,marginBottom:4}}>Academic Year</div>
              <p style={{fontSize:13,color:T.muted,marginBottom:22}}>
                How your school actually runs the year. All of this is editable later under Settings.
              </p>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:4}}>
                {/* April across most of Pakistan; August in Karachi and on the
                    Cambridge track. Assuming one of those for every school is
                    how a session ends up needing to be corrected by hand. */}
                <Sel label="Session starts in"
                  options={MONTHS_LONG.map((m,i)=>({v:String(i+1),l:m}))}
                  value={f.startMonth} onChange={e=>set("startMonth",e.target.value)}/>
                <Inp label="Pass mark %" value={f.pass} onChange={e=>set("pass",e.target.value)} placeholder="33"/>
              </div>
              <div style={{fontSize:11.5,color:T.muted,marginBottom:16,lineHeight:1.6}}>
                33% on most boards, 40% in many private schools. Grade bands are set under Settings.
              </div>

              <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>
                Exam terms
              </div>
              <div style={{display:"grid",gap:8,marginBottom:8}}>
                {f.termNames.map((t,i)=>(
                  <div key={i} style={{display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{width:20,fontSize:12,color:T.muted,fontWeight:700}}>{i+1}</div>
                    <div style={{flex:1}}>
                      <Inp value={t} placeholder="Half Yearly"
                        onChange={e=>set("termNames",f.termNames.map((x,n)=>n===i?e.target.value:x))}/>
                    </div>
                    {f.termNames.length>1&&(
                      <span {...pressable(()=>set("termNames",f.termNames.filter((_,n)=>n!==i)),`Remove term ${i+1}`)}
                        style={{cursor:"pointer",color:T.danger,fontSize:17,lineHeight:1,userSelect:"none",padding:"0 4px"}}>×</span>
                    )}
                  </div>
                ))}
              </div>
              {f.termNames.length<6&&(
                <Btn out color={T.forest} onClick={()=>set("termNames",[...f.termNames,""])}
                  style={{padding:"7px 14px",fontSize:12,marginBottom:14}}>+ Add a term</Btn>
              )}
              <div style={{fontSize:11.5,color:T.muted,marginBottom:16,lineHeight:1.6}}>
                Two terms (Half Yearly, Annual) is common in Karachi; three is common elsewhere.
                What each term is worth in the annual result is set under Settings.
              </div>

              {[dupTerm?`Two terms are both called "${dupTerm}"`:"",
                passBad?"The pass mark is a percentage between 0 and 100":"",
                cleanTerms.length?"":"A year needs at least one term"].filter(Boolean).map(m=>(
                <div key={m} style={{background:`${T.danger}0D`,color:T.danger,borderRadius:9,padding:"8px 12px",fontSize:12,marginBottom:8,border:`1px solid ${T.danger}25`}}>{m}</div>
              ))}
              {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
              <div style={{display:"flex",gap:10}}>
                <Btn onClick={()=>setStep(3)} out color={T.muted} style={{flex:1,padding:"11px",borderRadius:11}}>← Back</Btn>
                <Btn onClick={register} style={{flex:2,padding:"11px",borderRadius:11}} disabled={!step4Ok||submitting}>{submitting?"Registering…":"Complete Registration ✓"}</Btn>
              </div>
            </>
          )}
        </Crd>
        <div style={{textAlign:"center",marginTop:18}}><span onClick={onLogin} style={{fontSize:13,color:"rgba(255,255,255,.45)",cursor:"pointer"}}>Already registered? Sign In →</span></div>
      </div>
    </div>
  );
};

/**
 * Compose a new message.
 *
 * Module scope, deliberately. Defined inside a portal body it would be a new
 * component type on every render of that portal, so React would unmount and
 * remount it — wiping a half-written message the moment anything else in the
 * portal changed. Up here its identity is stable.
 *
 * The recipient list is never assembled on the client. `GET /messages/contacts`
 * returns exactly who this user may write to — a teacher gets the parents of
 * their own students plus the institute's admins, a parent gets their
 * children's teachers plus admins — so the dropdown cannot offer someone the
 * server would refuse, and editing it in the browser gains nothing.
 */
const MessageComposer=({onClose,onSent,studentId=null,title="New Message"})=>{
  const[contacts,setContacts]=useState(null);
  const[f,setF]=useState({to:"",subject:"",body:""});
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  const[sending,setSending]=useState(false);
  const[err,setErr]=useState("");

  useEffect(()=>{
    let cancelled=false;
    api.messages.contacts()
      .then(r=>{if(!cancelled)setContacts(r);})
      .catch(x=>{if(!cancelled)setErr(x.message||"Couldn't load your contacts.");});
    return()=>{cancelled=true;};
  },[]);

  const send=async()=>{
    setSending(true);setErr("");
    try{
      const recipient=(contacts??[]).find(c=>c.id===f.to);
      await api.messages.send({
        recipientId:f.to,
        subject:f.subject.trim(),
        body:f.body.trim(),
        ...(studentId&&{studentId}),
      });
      onSent?.(recipient?.name??"them");
    }catch(x){
      setErr(x.errors?.[0]?.message||x.message||"Could not send the message.");
    }finally{
      setSending(false);
    }
  };

  return(
    <Crd style={{padding:"24px",marginBottom:18,border:`1.5px solid ${T.forest}44`,animation:"fadeUp .3s"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:700,color:T.ink}}>{title}</div>
        <span {...pressable(onClose,"Close dialog")} style={{cursor:"pointer",color:T.muted,fontSize:22}}>×</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Sel label="To"
          options={[{v:"",l:contacts?(contacts.length?"Choose a recipient…":"No contacts available"):"Loading…"},
            ...(contacts??[]).map(c=>({v:c.id,l:`${c.name}${c.role?` — ${c.role.toLowerCase()}`:""}`}))]}
          value={f.to} onChange={e=>s("to",e.target.value)}/>
        <Inp label="Subject" value={f.subject} onChange={e=>s("subject",e.target.value)} placeholder="Subject of message"/>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:".6px"}}>Message</div>
        <textarea rows={4} value={f.body} onChange={e=>s("body",e.target.value)} placeholder="Write your message here…" style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,resize:"none",outline:"none",fontFamily:"inherit"}}/>
      </div>
      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
      <div style={{display:"flex",gap:10}}>
        <Btn onClick={onClose} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
        <Btn onClick={send} style={{flex:2,padding:"11px"}} disabled={!f.to||!f.subject.trim()||!f.body.trim()||sending}>{sending?"Sending…":"Send Message"}</Btn>
      </div>
    </Crd>
  );
};

/**
 * Post or edit a notice.
 *
 * Module scope, for the same reason as MessageComposer: defined inside a
 * portal body this would be a fresh component type on every render of that
 * portal, so React would remount it and wipe a half-written notice.
 *
 * Admin and teacher share one form because they share one endpoint. What
 * differs is what the server allows on either side of it — a teacher may edit
 * only the notices they posted, and may not delete at all, so no delete lives
 * here. Each portal decides which cards get an Edit affordance.
 *
 * Audience is chosen when publishing and left alone when editing: the PATCH
 * omits it, so the notice keeps whatever audience it already had.
 */
/*
 * Two of these used to be the same choice. "All (Students, Parents,
 * Teachers)" and "Everyone" both sent [], so the dropdown offered the same
 * action twice under different names — and the longer one named an audience
 * that does not exist: students have no accounts here, only their guardians
 * do. A notice reaches the school office, its teachers and its parents.
 */
const NOTICE_AUDIENCES={
  "Everyone":[],
  "Parents only":["PARENT"],
  "Teachers only":["TEACHER"],
};
const NOTICE_CATEGORIES=["Academic","Finance","Event","General","Urgent"];

const NoticeComposer=({notice=null,onClose,onSaved})=>{
  const editing=Boolean(notice);
  const[f,setF]=useState({title:notice?.title??"",body:notice?.body??"",cat:notice?.cat??"General",notify:"Everyone"});
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState("");
  const ready=Boolean(f.title.trim()&&f.body.trim());

  const save=async()=>{
    if(!ready)return;
    setSaving(true);setErr("");
    const title=f.title.trim();
    try{
      const payload={title,body:f.body.trim(),category:f.cat.toUpperCase()};
      if(editing)await api.notices.update(notice.id,payload);
      else await api.notices.create({...payload,audience:NOTICE_AUDIENCES[f.notify]??[]});
      onSaved?.(title,editing);
    }catch(x){
      setErr(x.errors?.[0]?.message||x.message||`Could not ${editing?"update":"publish"} the notice.`);
    }finally{
      setSaving(false);
    }
  };

  return(
    <Modal title={editing?"Edit Notice":"Post New Notice"} onClose={onClose}>
      <Inp label="Title" value={f.title} onChange={e=>s("title",e.target.value)} placeholder="e.g. Annual Exam Schedule"/>
      <Sel label="Category" options={NOTICE_CATEGORIES} value={f.cat} onChange={e=>s("cat",e.target.value)}/>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:".6px"}}>Message</div>
        <textarea rows={4} value={f.body} onChange={e=>s("body",e.target.value)} placeholder="Notice content…" style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,resize:"none",outline:"none",fontFamily:"inherit"}}/>
      </div>
      {!editing&&<Sel label="Notify" options={Object.keys(NOTICE_AUDIENCES)} value={f.notify} onChange={e=>s("notify",e.target.value)}/>}
      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
      <div style={{display:"flex",gap:10,marginTop:8}}>
        <Btn onClick={onClose} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
        <Btn onClick={save} style={{flex:2,padding:"11px"}} disabled={!ready||saving}>{saving?(editing?"Saving…":"Publishing…"):(editing?"Save Changes":"Publish Notice")}</Btn>
      </div>
    </Modal>
  );
};

/**
 * Bulk student import from a CSV file.
 *
 * Module scope, for the same reason as MessageComposer and NoticeComposer:
 * declared inside a portal body this would be a new component type on every
 * render, and React would remount it — throwing away a parsed file the moment
 * anything else in the portal changed.
 *
 * The checks below are a preview, not a gate. Every one of them is also
 * enforced by POST /students/import, and the server's per-row report is what
 * gets shown after a submit. Their job is to let someone fix an obvious typo
 * without a round trip — not to decide what is importable. Two things only the
 * server can know are called out in the UI: roll numbers that clash with
 * students already on file, and whether the plan has seats left.
 */
const StudentImportModal=({onClose,onImported,seatsLeft=null,branches=[]})=>{
  const[fileName,setFileName]=useState("");
  const[sheet,setSheet]=useState(null);
  const[readErr,setReadErr]=useState("");
  const[partial,setPartial]=useState(false);
  const[createParents,setCreateParents]=useState(true);
  const[branchId,setBranchId]=useState("");
  const[busy,setBusy]=useState(false);
  const[serverErr,setServerErr]=useState("");
  const[rowErrors,setRowErrors]=useState(null);
  const[result,setResult]=useState(null);

  const reset=()=>{setSheet(null);setFileName("");setReadErr("");setServerErr("");setRowErrors(null);setResult(null);};

  const take=async e=>{
    const f=e.target.files?.[0];
    e.target.value="";                       // so re-picking the same file still fires
    if(!f)return;
    reset();
    setFileName(f.name);
    try{
      const text=await f.text();
      const parsed=readImportSheet(text);
      if(!parsed.records.length){setReadErr("That file has a header row but no student rows.");return;}
      setSheet(parsed);
    }catch(x){
      setReadErr(x.message||"That file could not be read.");
    }
  };

  /** Mirrors the controller's per-row pass, minus what only the server knows. */
  const preflight=useMemo(()=>{
    if(!sheet)return[];
    const seen=new Map();
    return sheet.records.map(r=>{
      const problems=[];
      if(!r.name)problems.push("name is required");
      if(!r.grade)problems.push("grade is required");
      if(!r.rollNo)problems.push("rollNo is required");
      if(r.rollNo){
        if(seen.has(r.rollNo))problems.push(`roll number "${r.rollNo}" is duplicated in this file (also on line ${seen.get(r.rollNo)})`);
        else seen.set(r.rollNo,r.__line);
      }
      if(r.dob&&Number.isNaN(new Date(r.dob).getTime()))problems.push("dob is not a valid date (use YYYY-MM-DD)");
      const ge=emailError(r.guardianEmail,{required:false,label:"guardianEmail"});
      if(ge)problems.push(ge);
      const ph=phoneError(r.phone,{required:false,label:"phone"});
      if(ph)problems.push(ph);
      const gp=phoneError(r.guardianPhone,{required:false,label:"guardianPhone"});
      if(gp)problems.push(gp);
      return{line:r.__line,name:r.name||"(blank)",problems};
    }).filter(x=>x.problems.length);
  },[sheet]);

  const total=sheet?.records.length??0;
  const badLines=new Set(preflight.map(p=>p.line));
  const goodCount=total-badLines.size;
  const headerProblem=sheet?.missing.length
    ? `The file is missing ${sheet.missing.length===1?"a required column":"required columns"}: ${sheet.missing.join(", ")}.`
    : "";
  const overSeats=seatsLeft!==null&&total>seatsLeft;
  const canSend=Boolean(sheet)&&!headerProblem&&!busy&&(partial?goodCount>0:preflight.length===0);

  const send=async()=>{
    setBusy(true);setServerErr("");setRowErrors(null);
    try{
      const rows=sheet.records.map(({__line,...rest})=>rest);
      const res=await api.students.import({rows,partial,createParents,...(branchId&&{branchId})});
      setResult(res);
      onImported?.(res);
    }catch(x){
      // A 422 from the import carries one entry per bad row; a schema failure
      // carries {path,message} instead, which is not this shape.
      if(Array.isArray(x.errors)&&x.errors[0]?.problems)setRowErrors(x.errors);
      setServerErr(x.message||"The import failed.");
    }finally{
      setBusy(false);
    }
  };

  const ErrorList=({items,title})=>(
    <div style={{marginTop:12}}>
      <div style={{fontSize:12,fontWeight:700,color:T.danger,marginBottom:6}}>{title}</div>
      <div style={{maxHeight:180,overflowY:"auto",border:`1px solid ${T.danger}30`,borderRadius:10,background:`${T.danger}08`}}>
        {items.map(e=>(
          <div key={e.line} style={{padding:"8px 12px",borderBottom:`1px solid ${T.danger}18`,fontSize:12,lineHeight:1.6}}>
            <span style={{fontWeight:700,color:T.ink}}>Line {e.line}</span>
            <span style={{color:T.muted}}> — {e.name}</span>
            <div style={{color:T.danger,marginTop:2}}>{e.problems.join(" · ")}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return(
    <Modal title="Import Students from CSV" onClose={onClose} width={860}>
      {/* ---- done ---- */}
      {result?(
        <div>
          <div style={{background:`${T.success}12`,border:`1px solid ${T.success}30`,borderRadius:12,padding:"16px 18px",marginBottom:16}}>
            <div style={{fontSize:15,fontWeight:700,color:T.success,marginBottom:8}}>
              Imported {result.imported} student{result.imported===1?"":"s"}
            </div>
            <div className="ec-pair" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
              {[["Imported",result.imported],["Guardians created",result.parentsCreated],
                ["Skipped",result.skipped],["Seats left",result.seatsRemaining]].map(([l,v])=>(
                <div key={l}>
                  <div style={{fontSize:11,color:T.muted,textTransform:"uppercase",letterSpacing:".6px"}}>{l}</div>
                  <div style={{fontSize:18,fontWeight:800,color:T.ink}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          {result.errors?.length>0&&(
            <ErrorList items={result.errors} title={`${count(result.errors.length,"row")} ${result.errors.length===1?"was":"were"} skipped`}/>
          )}
          {result.students?.length>0&&(
            <div style={{marginTop:14,maxHeight:200,overflowY:"auto",border:`1px solid ${T.border}`,borderRadius:10}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:T.paper}}>
                  {["Code","Name","Roll No"].map(h=>(
                    <th key={h} style={{padding:"8px 12px",textAlign:"left",fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {result.students.map(s=>(
                    <tr key={s.id}>
                      <td style={{padding:"7px 12px",borderBottom:`1px solid ${T.border}`,fontWeight:600,color:T.forest}}>{s.code}</td>
                      <td style={{padding:"7px 12px",borderBottom:`1px solid ${T.border}`,color:T.ink}}>{s.name}</td>
                      <td style={{padding:"7px 12px",borderBottom:`1px solid ${T.border}`,color:T.muted}}>{s.rollNo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{display:"flex",gap:10,marginTop:16}}>
            <Btn onClick={reset} out color={T.muted} style={{flex:1,padding:"11px"}}>Import another file</Btn>
            <Btn onClick={onClose} style={{flex:2,padding:"11px"}}>Done</Btn>
          </div>
        </div>
      ):(
        <div>
          {/* ---- pick a file ---- */}
          <div style={{border:`1.5px dashed ${T.border}`,borderRadius:14,padding:"20px",marginBottom:16,background:T.paper}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <div style={{flex:"1 1 320px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:4}}>
                  {fileName||"Choose a CSV file"}
                </div>
                <div style={{fontSize:12,color:T.muted,lineHeight:1.6}}>
                  Required columns: <strong>name</strong>, <strong>grade</strong>, <strong>rollNo</strong>.
                  Optional: section, dob, gender, bloodGroup, phone, address, guardianName,
                  guardianEmail, guardianPhone, guardianRelation. Up to 2000 rows.
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn out color={T.muted} style={{padding:"9px 14px"}}
                  onClick={()=>downloadCsv("student-import-template.csv",importTemplateRows(),IMPORT_COLUMNS.map(c=>[c,c]))}>
                  Template
                </Btn>
                <label style={{display:"inline-block"}}>
                  <input type="file" accept=".csv,text/csv" onChange={take} style={{display:"none"}}/>
                  <span style={{display:"inline-block",background:T.forest,color:"#fff",fontSize:13,fontWeight:700,
                    padding:"10px 16px",borderRadius:11,cursor:"pointer"}}>Choose file</span>
                </label>
              </div>
            </div>
          </div>

          {readErr&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{readErr}</div>}

          {sheet&&(
            <>
              {/* ---- what we read ---- */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:14}}>
                {[["Rows in file",total],["Ready to import",goodCount],["With problems",preflight.length]].map(([l,v])=>(
                  <div key={l} style={{background:T.paper,borderRadius:10,padding:"10px 14px"}}>
                    <div style={{fontSize:11,color:T.muted,textTransform:"uppercase",letterSpacing:".6px"}}>{l}</div>
                    <div style={{fontSize:18,fontWeight:800,color:l==="With problems"&&v>0?T.danger:T.ink}}>{v}</div>
                  </div>
                ))}
              </div>

              {headerProblem&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{headerProblem}</div>}
              {sheet.unknown.length>0&&<div style={{background:`${T.warning}12`,color:T.warning,borderRadius:10,padding:"10px 14px",fontSize:12,marginBottom:12,border:`1px solid ${T.warning}30`}}>Ignored column{sheet.unknown.length===1?"":"s"}: {sheet.unknown.join(", ")} — these are not imported.</div>}
              {overSeats&&<div style={{background:`${T.warning}12`,color:T.warning,borderRadius:10,padding:"10px 14px",fontSize:12,marginBottom:12,border:`1px solid ${T.warning}30`}}>This file has {count(total,"row")} but the plan has {seatsLeft} seat{seatsLeft===1?"":"s"} left. The server will refuse the import.</div>}

              {/* ---- preview ---- */}
              <div style={{fontSize:12,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>
                Preview — first {Math.min(8,total)} of {total}
              </div>
              <div style={{overflowX:"auto",border:`1px solid ${T.border}`,borderRadius:10,marginBottom:6}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:640}}>
                  <thead><tr style={{background:T.paper}}>
                    <th style={{padding:"8px 10px",textAlign:"left",fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`}}>Line</th>
                    {["name","grade","section","rollNo","guardianEmail"].map(h=>(
                      <th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {sheet.records.slice(0,8).map(r=>{
                      const bad=badLines.has(r.__line);
                      return(
                        <tr key={r.__line} style={{background:bad?`${T.danger}0A`:"transparent"}}>
                          <td style={{padding:"7px 10px",borderBottom:`1px solid ${T.border}`,color:bad?T.danger:T.muted,fontWeight:700}}>{r.__line}</td>
                          {["name","grade","section","rollNo","guardianEmail"].map(k=>(
                            <td key={k} style={{padding:"7px 10px",borderBottom:`1px solid ${T.border}`,color:T.ink,whiteSpace:"nowrap"}}>{r[k]||<span style={{color:T.muted}}>—</span>}</td>
                          ))}
                        </tr>
                      );})}
                  </tbody>
                </table>
              </div>
              <div style={{fontSize:11,color:T.muted,marginBottom:12,lineHeight:1.6}}>
                Roll numbers are also checked against students already on file — the server reports
                those, so a row that looks fine here can still come back as a duplicate.
              </div>

              {preflight.length>0&&<ErrorList items={preflight} title={`${count(preflight.length,"row")} will be rejected`}/>}
              {rowErrors&&<ErrorList items={rowErrors} title="The server rejected these rows"/>}
              {serverErr&&!rowErrors&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginTop:12,border:`1px solid ${T.danger}30`}}>{serverErr}</div>}
              {serverErr&&rowErrors&&<div style={{fontSize:12,color:T.danger,marginTop:8}}>{serverErr}</div>}

              {/* ---- options ---- */}
              {/* Per file, not per row: a school exports one campus's roster at a
                  time, and a spelled-out campus column would have to agree with
                  itself on two thousand lines to mean anything. */}
              {branches.length>0&&(
                <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}`,maxWidth:320}}>
                  <Sel label="Campus for this file" value={branchId} onChange={e=>setBranchId(e.target.value)}
                    options={[{v:"",l:"— not placed —"},...branches.map(b=>({v:b.id,l:b.name}))]}/>
                </div>
              )}
              <div style={{display:"flex",gap:20,flexWrap:"wrap",marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
                <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.ink,cursor:"pointer"}}>
                  <input type="checkbox" checked={partial} onChange={e=>setPartial(e.target.checked)}/>
                  Import the valid rows and skip the rest
                </label>
                <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.ink,cursor:"pointer"}}>
                  <input type="checkbox" checked={createParents} onChange={e=>setCreateParents(e.target.checked)}/>
                  Create guardian accounts
                </label>
              </div>
              {!partial&&preflight.length>0&&(
                <div style={{fontSize:12,color:T.muted,marginTop:8,lineHeight:1.6}}>
                  Nothing will be imported while any row has a problem. Fix the file, or tick
                  “Import the valid rows and skip the rest” to bring in the {goodCount} good row{goodCount===1?"":"s"}.
                </div>
              )}
            </>
          )}

          <div style={{display:"flex",gap:10,marginTop:18}}>
            <Btn onClick={onClose} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
            <Btn onClick={send} style={{flex:2,padding:"11px"}} disabled={!canSend}>
              {busy?"Importing…":sheet?`Import ${partial?goodCount:total} student${(partial?goodCount:total)===1?"":"s"}`:"Import"}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
};

/**
 * The recycle bin.
 *
 * Deleting a student, teacher or parent has always been a soft delete — the
 * row keeps its relations and only gains a `deletedAt` — and the API has
 * always had `/deleted` and `/:id/restore` for all three. None of it was
 * reachable from the app, so the server would answer a delete with
 * "Restorable from the recycle bin" and there was no recycle bin. An admin who
 * removed the wrong child needed a developer.
 *
 * Module scope, like the other shared modals: inside a portal body this would
 * remount on every `onReload()` and lose whichever tab you were looking at.
 *
 * Permanent deletion lives here now, at the user's request. It is deliberately
 * the harder of the two doors: the row asks in place before it acts, and the
 * API refuses anything not already in the bin, so the roster cannot reach it.
 */
const BIN_KINDS=[
  {key:"students",label:"Students",api:()=>api.students,columns:[["Name","name"],["Roll No","rollNo"],["Class","__class"]]},
  {key:"teachers",label:"Teachers",api:()=>api.teachers,columns:[["Name","name"],["Email","email"],["Subject","subject"]]},
  {key:"parents", label:"Parents", api:()=>api.parents, columns:[["Name","name"],["Email","email"],["Relation","relation"]]},
];

const RecycleBinModal=({initialKind="students",onClose,onRestored,onPurged})=>{
  const[kind,setKind]=useState(initialKind);
  const[rows,setRows]=useState(null);
  const[err,setErr]=useState("");
  const[busy,setBusy]=useState("");
  const[note,setNote]=useState("");
  const[confirming,setConfirming]=useState("");

  const spec=BIN_KINDS.find(k=>k.key===kind)??BIN_KINDS[0];

  const load=async(which)=>{
    const target=BIN_KINDS.find(k=>k.key===which)??spec;
    setRows(null);setErr("");
    try{
      setRows(await target.api().deleted({limit:200}));
    }catch(e){
      setErr(e.message||"Could not read the recycle bin.");
      setRows([]);
    }
  };

  useEffect(()=>{load(kind);},[kind]);

  const restore=async row=>{
    setBusy(row.id);setErr("");setNote("");
    try{
      await spec.api().restore(row.id);
      setNote(`${row.name} restored.`);
      setRows(r=>r.filter(x=>x.id!==row.id));
      onRestored?.(row.name);
    }catch(e){
      setErr(e.message||`Could not restore ${row.name}.`);
    }finally{
      setBusy("");
    }
  };

  /**
   * The other door: this one really destroys.
   *
   * Two steps rather than a browser confirm, so the question is attached to the
   * row it is about — and the answer names what actually went with them.
   */
  const purge=async row=>{
    setBusy(row.id);setErr("");setNote("");
    try{
      const gone=await spec.api().purge(row.id);
      const detail=Object.entries(gone||{})
        .filter(([,n])=>n>0)
        .map(([k,n])=>`${n} ${k.replace(/([A-Z])/g," $1").toLowerCase().trim()}`)
        .join(", ");
      setNote(`${row.name} deleted permanently${detail?` — ${detail}.`:"."}`);
      setRows(r=>r.filter(x=>x.id!==row.id));
      setConfirming("");
      onPurged?.(row.name);
    }catch(e){
      setErr(e.message||`Could not delete ${row.name}.`);
    }finally{
      setBusy("");
    }
  };

  const when=v=>{
    if(!v)return "—";
    const d=new Date(v);
    return Number.isNaN(d.getTime())?"—":d.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
  };
  const cell=(row,key)=>key==="__class"?`${row.grade??""} ${row.section??""}`.trim()||"—":(row[key]||"—");

  return(
    <Modal title="Recycle Bin" onClose={onClose} width={720}>
      <div style={{fontSize:12,color:T.muted,lineHeight:1.7,marginBottom:14}}>
        Removing a record only hides it. Restoring one puts it back exactly as it was — marks,
        attendance and fee history included, because none of it was ever deleted. Deleting from
        here is the exception: it is permanent, and their history goes with them.
      </div>

      <div style={{display:"flex",gap:6,marginBottom:16,borderBottom:`1px solid ${T.border}`,paddingBottom:12}}>
        {BIN_KINDS.map(k=>(
          <span key={k.key} onClick={()=>{setKind(k.key);setNote("");setErr("");}}
            style={{fontSize:13,fontWeight:700,padding:"6px 14px",borderRadius:99,cursor:"pointer",
              color:kind===k.key?T.forest:T.muted,background:kind===k.key?`${T.forest}12`:"transparent"}}>
            {k.label}
          </span>
        ))}
      </div>

      {note&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.success}30`}}>{note}</div>}
      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}

      {rows===null&&<div style={{padding:"32px",textAlign:"center",color:T.muted,fontSize:13}}>Loading…</div>}

      {rows!==null&&rows.length===0&&!err&&(
        <div style={{padding:"36px",textAlign:"center",color:T.muted,fontSize:13}}>
          Nothing removed. Anything you delete from the {spec.label.toLowerCase()} list turns up here.
        </div>
      )}

      {rows!==null&&rows.length>0&&(
        <div style={{overflowX:"auto",border:`1px solid ${T.border}`,borderRadius:10,maxHeight:360,overflowY:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:520}}>
            <thead><tr style={{background:T.paper}}>
              {spec.columns.map(([h])=>(
                <th key={h} style={{padding:"9px 12px",textAlign:"left",fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
              ))}
              <th style={{padding:"9px 12px",textAlign:"left",fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>Removed</th>
              <th style={{padding:"9px 12px",borderBottom:`1px solid ${T.border}`}}/>
            </tr></thead>
            <tbody>
              {rows.map(row=>(
                <tr key={row.id}>
                  {spec.columns.map(([h,key])=>(
                    <td key={h} style={{padding:"9px 12px",borderBottom:`1px solid ${T.border}`,color:T.ink,whiteSpace:"nowrap"}}>{cell(row,key)}</td>
                  ))}
                  <td style={{padding:"9px 12px",borderBottom:`1px solid ${T.border}`,color:T.muted,whiteSpace:"nowrap"}}>{when(row.deletedAt)}</td>
                  <td style={{padding:"9px 12px",borderBottom:`1px solid ${T.border}`,textAlign:"right"}}>
                    {confirming===row.id?(
                      <div style={{display:"flex",gap:6,justifyContent:"flex-end",alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{fontSize:11,color:T.danger,fontWeight:700}}>Delete for good?</span>
                        <span {...pressable(()=>purge(row),`Confirm permanent deletion of ${row.name}`,{disabled:busy===row.id})}
                          style={{cursor:busy===row.id?"wait":"pointer"}}>
                          <Bdg label={busy===row.id?"Deleting…":"Yes, delete"} color={T.danger} bg={`${T.danger}15`}/>
                        </span>
                        <span {...pressable(()=>setConfirming(""),"Keep it")} style={{cursor:"pointer"}}>
                          <Bdg label="Keep" color={T.muted} bg={T.paper}/>
                        </span>
                      </div>
                    ):(
                      <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                        {/* Pills, but they act as buttons, so they answer to Tab
                            and Enter like one. */}
                        <span {...pressable(()=>restore(row),`Restore ${row.name}`,{disabled:busy===row.id})}
                          style={{cursor:busy===row.id?"default":"pointer",opacity:busy===row.id?.5:1}}>
                          <Bdg label={busy===row.id?"Restoring…":"Restore"} color={T.forest} bg={`${T.forest}15`}/>
                        </span>
                        <span {...pressable(()=>{setConfirming(row.id);setErr("");setNote("");},`Delete ${row.name} permanently`)}
                          style={{cursor:"pointer"}}>
                          <Bdg label="Delete" color={T.danger} bg={`${T.danger}15`}/>
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{display:"flex",marginTop:18}}>
        <Btn onClick={onClose} out color={T.muted} style={{flex:1,padding:"11px"}}>Close</Btn>
      </div>
    </Modal>
  );
};

/**
 * The institute recycle bin — super admin only.
 *
 * `DELETE /institutes/:id` has always been a soft delete: the row keeps its
 * students, teachers, marks, attendance and invoices, gains a `deletedAt`, goes
 * CANCELLED, and its users are deactivated so nobody can sign in. The server
 * answers it with "It can be restored from the recycle bin" — and until now
 * there was no recycle bin, while the confirmation dialog claimed the opposite
 * of what the endpoint does.
 *
 * Purge is the one that really destroys, and the API only allows it on a row
 * that is already in the bin. That two-step shape is mirrored here: nothing on
 * the institutes list can erase anything, and the erase lives behind the bin
 * plus a typed name.
 */
const InstituteBinModal=({onClose,onChanged})=>{
  const[rows,setRows]=useState(null);
  const[err,setErr]=useState("");
  const[note,setNote]=useState("");
  const[busy,setBusy]=useState("");
  /** Which row is mid-purge, and what the super admin has typed so far. */
  const[purging,setPurging]=useState(null);
  const[typed,setTyped]=useState("");

  const load=async()=>{
    setRows(null);setErr("");
    try{ setRows(await api.institutes.deleted()); }
    catch(e){ setErr(e.message||"Could not read the recycle bin."); setRows([]); }
  };
  useEffect(()=>{load();},[]);

  const restore=async row=>{
    setBusy(row.id);setErr("");setNote("");
    try{
      await api.institutes.restore(row.id);
      setNote(`${row.name} restored — its users can sign in again.`);
      setRows(r=>r.filter(x=>x.id!==row.id));
      onChanged?.();
    }catch(e){ setErr(e.message||`Could not restore ${row.name}.`); }
    finally{ setBusy(""); }
  };

  const purge=async row=>{
    setBusy(row.id);setErr("");setNote("");
    try{
      const res=await api.institutes.purge(row.id);
      setNote(res?.message||`${row.name} permanently erased.`);
      setRows(r=>r.filter(x=>x.id!==row.id));
      setPurging(null);setTyped("");
      onChanged?.();
    }catch(e){ setErr(e.message||`Could not erase ${row.name}.`); }
    finally{ setBusy(""); }
  };

  const when=v=>{
    if(!v)return "—";
    const d=new Date(v);
    return Number.isNaN(d.getTime())?"—":d.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
  };

  return(
    <Modal title="Institute Recycle Bin" onClose={onClose} width={760}>
      <div style={{fontSize:12,color:T.muted,lineHeight:1.7,marginBottom:16}}>
        A deleted institute keeps everything — students, staff, marks, attendance, invoices. Its
        users simply cannot sign in. Restoring puts it back and lets them in again. Erasing is the
        only action here that destroys data, and it cannot be undone.
      </div>

      {note&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.success}30`}}>{note}</div>}
      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}

      {rows===null&&<div style={{padding:"32px",textAlign:"center",color:T.muted,fontSize:13}}>Loading…</div>}

      {rows!==null&&rows.length===0&&!err&&(
        <div style={{padding:"36px",textAlign:"center",color:T.muted,fontSize:13}}>
          Nothing in the bin. Any institute you delete turns up here.
        </div>
      )}

      {rows!==null&&rows.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {rows.map(row=>(
            <Crd key={row.id} style={{padding:"18px 20px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14,flexWrap:"wrap"}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:700,color:T.ink}}>{row.name}</div>
                  <div style={{fontSize:12,color:T.muted,marginTop:4}}>
                    {row.code} · {row.city||"—"} · deleted {when(row.deletedAt)}
                  </div>
                  <div style={{fontSize:12,color:T.muted,marginTop:6}}>
                    Holds <strong style={{color:T.ink}}>{row.students}</strong> student{row.students===1?"":"s"} and{" "}
                    <strong style={{color:T.ink}}>{row.teachers}</strong> teacher{row.teachers===1?"":"s"}, all still intact.
                  </div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <Btn onClick={()=>restore(row)} disabled={busy===row.id} style={{padding:"8px 16px",fontSize:12}}>
                    {busy===row.id&&!purging?"Restoring…":"Restore"}
                  </Btn>
                  <Btn out color={T.danger} onClick={()=>{setPurging(purging?.id===row.id?null:row);setTyped("");setErr("");}}
                    style={{padding:"8px 16px",fontSize:12}}>
                    {purging?.id===row.id?"Cancel":"Erase…"}
                  </Btn>
                </div>
              </div>

              {purging?.id===row.id&&(
                <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
                  <div style={{background:`${T.danger}0D`,border:`1px solid ${T.danger}30`,borderRadius:10,padding:"12px 14px",fontSize:12,color:T.ink,lineHeight:1.7,marginBottom:12}}>
                    This permanently erases <strong>{row.name}</strong> and everything belonging to
                    it — {row.students} student{row.students===1?"":"s"}, {row.teachers} teacher
                    {row.teachers===1?"":"s"}, and every mark, attendance record and invoice.
                    <strong> There is no way back from this.</strong>
                  </div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:6}}>
                    Type <strong style={{color:T.ink}}>{row.name}</strong> to confirm:
                  </div>
                  <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                    <input value={typed} onChange={e=>setTyped(e.target.value)} placeholder={row.name}
                      aria-label={`Type the institute name ${row.name} to confirm erasing it`}
                      style={{flex:"1 1 260px",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,outline:"none",fontFamily:"inherit"}}/>
                    <Btn color={T.danger} onClick={()=>purge(row)} disabled={typed!==row.name||busy===row.id}
                      style={{padding:"10px 18px",fontSize:12}}>
                      {busy===row.id?"Erasing…":"Erase permanently"}
                    </Btn>
                  </div>
                </div>
              )}
            </Crd>
          ))}
        </div>
      )}

      <div style={{display:"flex",marginTop:18}}>
        <Btn onClick={onClose} out color={T.muted} style={{flex:1,padding:"11px"}}>Close</Btn>
      </div>
    </Modal>
  );
};

/**
 * The result card.
 *
 * `GET /students/:id/report` has always returned everything a Pakistani school
 * puts on one — school header, student and guardian details, every subject with
 * its teacher and marks, an attendance summary and the fee position — and
 * nothing in the app ever called it. The office had a complete result card on
 * the server and no way to look at it, let alone hand one to a parent.
 *
 * Module scope, like the other shared modals. Admins and teachers open it from
 * a student; a parent opens their own child's. The endpoint scopes itself, so
 * this component does not decide who may see what.
 *
 * Print is the point. `@media print` in the stylesheet hides the application
 * around it, so File > Print produces the card on its own — which is how these
 * actually reach parents.
 */
/**
 * Terms are the school's own now, so this list is no longer a constant — it
 * arrives with whatever is being displayed. The only fixed entry is the empty
 * one, which means the whole year rather than any term.
 */
const FULL_YEAR={v:"",l:"Full Year"};
const termOptions=(terms=[])=>[FULL_YEAR,...terms.map(t=>({v:t.name,l:t.name}))];
const TERM_LABEL=(v)=>(v && String(v).trim()) || "Full Year";

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th". */
const ordinal=(n)=>{
  if(n===null||n===undefined)return null;
  const teens=n%100;
  if(teens>=11&&teens<=13)return `${n}th`;
  return `${n}${["th","st","nd","rd"][n%10]??"th"}`;
};

/** Rupees, for the module-scope components that sit outside a portal. */
const RS=n=>`Rs. ${Number(n||0).toLocaleString("en-PK")}`;

/**
 * The heads a school bills under — mirrors the FeeHead enum on the server.
 *
 * A Pakistani challan is one slip carrying several charges: tuition for the
 * month, transport, the exam fee when exams fall in that month, annual charges
 * in April. Listing them is what lets a parent see why the amount moved.
 */
const FEE_HEADS=[
  {v:"TUITION",l:"Tuition Fee"},
  {v:"ADMISSION",l:"Admission Fee"},
  {v:"ANNUAL",l:"Annual Charges"},
  {v:"EXAMINATION",l:"Examination Fee"},
  {v:"TRANSPORT",l:"Transport"},
  {v:"HOSTEL",l:"Hostel"},
  {v:"LIBRARY",l:"Library"},
  {v:"SPORTS",l:"Sports"},
  {v:"LAB",l:"Laboratory"},
  {v:"MISCELLANEOUS",l:"Miscellaneous"},
];
const HEAD_LABEL=v=>FEE_HEADS.find(h=>h.v===v)?.l??v;

/**
 * A challan's breakdown, read-only.
 *
 * Renders nothing when there are no lines: invoices raised before heads existed
 * have none, and a school billing one flat amount never will — neither is a
 * missing-data state to apologise for.
 */
const FeeBreakdown=({items=[],total,compact=false})=>{
  if(!items.length)return null;
  const sum=items.reduce((t,i)=>t+Number(i.amount||0),0);
  return(
    <div style={{background:T.paper,borderRadius:10,padding:compact?"10px 12px":"12px 16px",border:`1px solid ${T.border}`}}>
      {items.map((i,n)=>(
        <div key={n} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"4px 0",fontSize:compact?12:13}}>
          <span style={{color:T.muted}}>
            {HEAD_LABEL(i.head)}{i.label?<span style={{color:T.muted,opacity:.75}}> — {i.label}</span>:null}
          </span>
          <span style={{color:T.ink,fontWeight:600,whiteSpace:"nowrap"}}>{RS(i.amount)}</span>
        </div>
      ))}
      <div style={{display:"flex",justifyContent:"space-between",gap:12,paddingTop:8,marginTop:4,borderTop:`1px solid ${T.border}`,fontSize:compact?12:13,fontWeight:800,color:T.ink}}>
        <span>Total</span><span style={{whiteSpace:"nowrap"}}>{RS(total??sum)}</span>
      </div>
    </div>
  );
};

/**
 * One row of the parent's payment history, which opens to show what the month
 * was actually billed for.
 *
 * It keeps its own open state so the portal around it needs no new hook, and so
 * two challans can be compared side by side — which is the whole reason a
 * parent opens this screen when an amount changes.
 */
const ParentFeeRow=({fee,onSlip})=>{
  const[open,setOpen]=useState(false);
  const heads=fee.items??[];
  const c=fee.status==="paid"?T.success:fee.status==="overdue"?T.danger:T.warning;
  return(
    <Fragment>
      <tr style={{borderBottom:open?"none":`1px solid ${T.border}`}}>
        <td style={{padding:"12px",fontSize:13,fontWeight:600,color:T.ink}}>{fee.month}</td>
        <td style={{padding:"12px",fontSize:13}}>
          {heads.length?(
            <span {...pressable(()=>setOpen(o=>!o),`${open?"Hide":"Show"} what ${fee.month} was billed for`)}
              style={{cursor:"pointer",color:T.green,fontWeight:600,display:"inline-flex",alignItems:"center",gap:5}}>
              {RS(fee.amt)}<span style={{fontSize:10,opacity:.8}}>{open?"▲":"▼"}</span>
            </span>
          ):RS(fee.amt)}
          {/* Part payment is normal, so a guardian who paid something last week
              needs the row to say what is left rather than the original total. */}
          {fee.paid>0&&fee.status!=="paid"&&(
            <div style={{fontSize:11,color:T.warning,fontWeight:600,marginTop:2}}>
              {RS(fee.balance)} due · {RS(fee.paid)} received
            </div>
          )}
        </td>
        <td style={{padding:"12px",fontSize:13,color:T.muted}}>{fee.dueDate||"—"}</td>
        <td style={{padding:"12px",fontSize:13,color:T.muted}}>{fee.date||"—"}</td>
        <td style={{padding:"12px"}}><Bdg label={fee.status==="paid"?"✓ Paid":fee.status==="overdue"?"⚠ Overdue":"⏳ Pending"} color={c} bg={`${c}15`}/></td>
        <td style={{padding:"12px"}}>
          {fee.id&&(
            <Btn out color={T.blue} onClick={()=>onSlip?.(fee.id)} style={{padding:"5px 12px",fontSize:11}}>
              {fee.status==="paid"?"Receipt":"Challan"}
            </Btn>
          )}
        </td>
      </tr>
      {open&&(
        <tr style={{borderBottom:`1px solid ${T.border}`}}>
          <td colSpan={6} style={{padding:"0 12px 14px"}}>
            <FeeBreakdown items={heads} compact/>
            {(fee.discount>0||fee.lateFee>0)&&(
              <div style={{fontSize:12,color:T.muted,marginTop:8}}>
                {fee.discount>0&&<>Discount −{RS(fee.discount)}&nbsp;&nbsp;</>}
                {fee.lateFee>0&&<>Late fee +{RS(fee.lateFee)}&nbsp;&nbsp;</>}
                Payable <b style={{color:T.ink}}>{RS(fee.amt)}</b>
              </div>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
};

/**
 * The line builder.
 *
 * The total is never typed: it is the sum of the lines, shown live, and it is
 * what the server stores. Two fields that could disagree about what a family
 * owes is exactly the bug this replaces.
 */
const FeeHeadEditor=({items,onChange,disabled=false})=>{
  const set=(n,patch)=>onChange(items.map((i,k)=>k===n?{...i,...patch}:i));
  const add=()=>onChange([...items,{head:"TUITION",label:"",amount:""}]);
  const drop=n=>onChange(items.filter((_,k)=>k!==n));
  const total=items.reduce((t,i)=>t+(Number(i.amount)||0),0);

  return(
    <div>
      {items.map((i,n)=>(
        <div key={n} style={{display:"grid",gridTemplateColumns:"1.4fr 1.2fr .9fr auto",gap:8,alignItems:"end",marginBottom:8}}>
          <Sel options={FEE_HEADS} value={i.head} onChange={e=>set(n,{head:e.target.value})} style={{marginBottom:0}}/>
          <Inp placeholder="Note (optional)" value={i.label} onChange={e=>set(n,{label:e.target.value})} maxLength={60} style={{marginBottom:0}}/>
          <Inp type="number" min="0" placeholder="0" value={i.amount} onChange={e=>set(n,{amount:e.target.value})} style={{marginBottom:0}}/>
          <button onClick={()=>drop(n)} disabled={disabled} aria-label={`Remove ${HEAD_LABEL(i.head)} line`}
            style={{background:"transparent",border:`1.5px solid ${T.border}`,borderRadius:10,color:T.danger,fontSize:16,lineHeight:1,padding:"9px 12px",cursor:disabled?"default":"pointer"}}>×</button>
        </div>
      ))}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginTop:items.length?12:0}}>
        <Btn out color={T.forest} onClick={add} disabled={disabled||items.length>=20} style={{padding:"7px 14px",fontSize:12}}>+ Add head</Btn>
        {items.length>0&&(
          <div style={{fontSize:13,color:T.muted}}>
            Total <b style={{color:T.ink,fontSize:15}}>{RS(total)}</b>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * The paper half of the fee module.
 *
 * A Pakistani school runs on two printed slips: the challan a family carries to
 * the counter or the bank, and the receipt the office hands back. Neither
 * existed — the product could bill a family and take their money without ever
 * producing a document either side could hold. The heads, discounts and part
 * payments already modelled were only ever visible on a screen in the office.
 *
 * One component, because it is one document at two points in its life: while
 * anything is owed it prints as a challan, and once the challan is clear the
 * same slip is the receipt. Deciding by the invoice's own state rather than
 * offering two buttons keeps the office from issuing a receipt for money that
 * has not arrived.
 */
const FeeSlipModal=({invoiceId,onClose})=>{
  const[inv,setInv]=useState(null);
  const[err,setErr]=useState("");

  useEffect(()=>{
    let dead=false;
    api.fees.get(invoiceId)
      .then(d=>{if(!dead)setInv(d);})
      .catch(e=>{if(!dead)setErr(e.message||"Could not load this challan.");});
    return()=>{dead=true;};
  },[invoiceId]);

  const day=(iso)=>iso?new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"—";

  const net=inv?(inv.net??inv.amount):0;
  const paid=inv?.paidAmount??0;
  const balance=inv?(inv.balance??Math.max(0,net-paid)):0;
  const cleared=inv?balance<=0&&inv.status!=="WAIVED":false;
  const heads=inv?.items??[];

  const Line=({label,value,strong=false,color})=>(
    <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"5px 0",
      fontSize:strong?14:13,fontWeight:strong?800:400,color:color??(strong?T.ink:T.muted)}}>
      <span>{label}</span><span style={{color:color??T.ink,whiteSpace:"nowrap"}}>{value}</span>
    </div>
  );

  return(
    <Modal title={cleared?"Fee Receipt":"Fee Challan"} onClose={onClose} width={560}>
      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"12px 16px",fontSize:13,border:`1px solid ${T.danger}30`}}>{err}</div>}
      {!inv&&!err&&<div style={{fontSize:13,color:T.muted,padding:"20px 0"}}>Loading…</div>}

      {inv&&(
        <>
          <div className="ec-print-card" style={{border:`1px solid ${T.border}`,borderRadius:14,padding:"24px"}}>
            <div style={{textAlign:"center",borderBottom:`2px solid ${T.ink}`,paddingBottom:12,marginBottom:16}}>
              <div style={{fontSize:26,lineHeight:1}}>{inv.institute?.logo??"🏫"}</div>
              <div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:T.ink,marginTop:4}}>
                {inv.institute?.name??"School"}
              </div>
              {inv.institute?.city&&<div style={{fontSize:12,color:T.muted}}>{inv.institute.city}</div>}
              <div style={{fontSize:11,fontWeight:700,color:T.muted,letterSpacing:"1.4px",textTransform:"uppercase",marginTop:8}}>
                {cleared?"Fee Receipt":"Fee Challan"} · {inv.title??inv.period}
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 16px",fontSize:12.5,marginBottom:16}}>
              <div><span style={{color:T.muted}}>Student</span> <b style={{color:T.ink}}>{inv.student?.name}</b></div>
              <div><span style={{color:T.muted}}>Roll No</span> <b style={{color:T.ink}}>{inv.student?.rollNo??"—"}</b></div>
              <div><span style={{color:T.muted}}>Class</span> <b style={{color:T.ink}}>{inv.student?.grade} {inv.student?.section}</b></div>
              <div><span style={{color:T.muted}}>{cleared?"Received on":"Due date"}</span> <b style={{color:T.ink}}>{day(cleared?inv.paidAt:inv.dueDate)}</b></div>
            </div>

            <div style={{borderTop:`1px dashed ${T.border}`,paddingTop:10}}>
              {/* Heads when the challan has them; otherwise the single amount it
                  was raised for. An invoice from before fee heads shows one line
                  rather than an empty table. */}
              {heads.length
                ? heads.map((i,n)=><Line key={n} label={`${HEAD_LABEL(i.head)}${i.label?` — ${i.label}`:""}`} value={RS(i.amount)}/>)
                : <Line label={inv.title??"Fee"} value={RS(inv.amount)}/>}

              {inv.discount>0&&<Line label="Discount" value={`− ${RS(inv.discount)}`} color={T.success}/>}
              {inv.lateFee>0&&<Line label="Late fee" value={`+ ${RS(inv.lateFee)}`} color={T.danger}/>}

              <div style={{borderTop:`1px solid ${T.border}`,marginTop:6,paddingTop:6}}>
                <Line label="Total payable" value={RS(net)} strong/>
              </div>

              {paid>0&&<Line label={cleared?"Amount received":"Received so far"} value={`− ${RS(paid)}`} color={T.success}/>}
              {!cleared&&(
                <div style={{borderTop:`2px solid ${T.ink}`,marginTop:6,paddingTop:8}}>
                  <Line label="Balance due" value={RS(balance)} strong color={T.danger}/>
                </div>
              )}
              {cleared&&(
                <div style={{borderTop:`2px solid ${T.ink}`,marginTop:6,paddingTop:8}}>
                  <Line label="Paid in full" value={RS(paid)} strong color={T.success}/>
                </div>
              )}
            </div>

            {cleared&&(
              <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,color:T.muted,marginTop:14}}>
                <span>Method <strong style={{color:T.ink}}>{inv.method??"—"}</strong></span>
                {inv.reference&&<span>Ref <strong style={{color:T.ink}}>{inv.reference}</strong></span>}
              </div>
            )}

            {!cleared&&inv.status==="OVERDUE"&&(
              <div style={{marginTop:14,fontSize:12,fontWeight:700,color:T.danger}}>
                This challan is past its due date.
              </div>
            )}

            <div style={{marginTop:22,paddingTop:14,borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",fontSize:11,color:T.muted}}>
              <span>Printed {day(new Date().toISOString())}</span>
              <span>{cleared?"Received by ____________________":"Accounts Office ____________________"}</span>
            </div>
          </div>

          <div style={{display:"flex",gap:10,marginTop:16}} className="ec-no-print">
            <Btn onClick={onClose} out color={T.muted} style={{flex:1,padding:"11px"}}>Close</Btn>
            <Btn onClick={()=>window.print()} style={{flex:2,padding:"11px"}}>Print / Save as PDF</Btn>
          </div>
        </>
      )}
    </Modal>
  );
};

/**
 * Recording money over the counter.
 *
 * "Mark Paid" used to send no amount at all, which settled the challan in full
 * — the only payment the product could represent. A family paying part of a
 * challan is the ordinary case in a Pakistani school office, so this asks what
 * was actually handed over, defaults to the whole balance, and will not let the
 * clerk type more than is due.
 */
const RecordPaymentModal=({invoice,onClose,onDone})=>{
  const due=invoice.net??invoice.amount;
  const already=invoice.paidAmount??0;
  const balance=invoice.balance??Math.max(0,due-already);

  const[amount,setAmount]=useState(String(balance));
  const[method,setMethod]=useState("Cash");
  const[reference,setReference]=useState("");
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState("");

  const value=Number(amount);
  const bad=amount===""||!Number.isFinite(value)||value<=0||value>balance;
  const left=bad?null:balance-value;

  const submit=async()=>{
    setBusy(true);setErr("");
    try{
      const r=await api.fees.pay(invoice.id,{
        paidAmount:value,method,
        ...(reference.trim()&&{reference:reference.trim()}),
      });
      onDone(r?.__message??`${RS(value)} recorded.`);
    }catch(e){
      setErr(e.errors?.[0]?.message||e.message||"Could not record that payment.");
      setBusy(false);
    }
  };

  return(
    <Modal title={`Record Payment — ${invoice.student?.name??"Student"}`} onClose={onClose} width={520}>
      <div style={{background:T.paper,borderRadius:12,padding:"14px 16px",border:`1px solid ${T.border}`,marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"3px 0"}}>
          <span style={{color:T.muted}}>{invoice.title??invoice.period}</span>
          <span style={{color:T.ink,fontWeight:600}}>{RS(due)}</span>
        </div>
        {already>0&&(
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"3px 0"}}>
            <span style={{color:T.muted}}>Already received</span>
            <span style={{color:T.success,fontWeight:600}}>−{RS(already)}</span>
          </div>
        )}
        <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:800,color:T.ink,paddingTop:8,marginTop:4,borderTop:`1px solid ${T.border}`}}>
          <span>Still due</span><span>{RS(balance)}</span>
        </div>
      </div>

      <Inp label="Amount received (PKR)" type="number" min="1" max={String(balance)}
        value={amount} onChange={e=>setAmount(e.target.value)}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Sel label="Method" options={["Cash","Bank Transfer","Cheque","JazzCash","EasyPaisa","Card"]}
          value={method} onChange={e=>setMethod(e.target.value)}/>
        <Inp label="Reference (optional)" value={reference} onChange={e=>setReference(e.target.value)}
          placeholder="Slip / cheque no." maxLength={60}/>
      </div>

      {!bad&&(
        <div style={{fontSize:12.5,color:left>0?T.warning:T.success,fontWeight:600,marginTop:-4,marginBottom:8}}>
          {left>0?`${RS(left)} will still be due after this.`:"This clears the challan."}
        </div>
      )}
      {amount!==""&&value>balance&&(
        <div style={{fontSize:12.5,color:T.danger,fontWeight:600,marginTop:-4,marginBottom:8}}>
          That is more than the {RS(balance)} still due.
        </div>
      )}
      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:12.5,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}

      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:14}}>
        <Btn out color={T.muted} onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn onClick={submit} disabled={busy||bad}>{busy?"Recording…":`Record ${bad?"payment":RS(value)}`}</Btn>
      </div>
    </Modal>
  );
};

/**
 * The monthly billing run.
 *
 * This used to fire straight from the button with nothing but a period, so the
 * only amount a school could bill was its standing monthly fee. The breakdown
 * is optional: leaving it empty bills a flat amount exactly as before.
 */
const GenerateInvoicesModal=({period,label,defaultFee,onClose,onDone})=>{
  const[items,setItems]=useState([]);
  const[amount,setAmount]=useState("");
  const[grade,setGrade]=useState("");
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState("");

  const total=items.reduce((t,i)=>t+(Number(i.amount)||0),0);
  const blank=items.some(i=>i.amount===""||Number.isNaN(Number(i.amount)));

  const submit=async()=>{
    setBusy(true);setErr("");
    try{
      const r=await api.fees.generate({
        period,
        ...(items.length
          ? {items:items.map(i=>({head:i.head,label:i.label?.trim()||undefined,amount:Number(i.amount)}))}
          : amount!==""?{amount:Number(amount)}:{}),
        ...(grade&&{grade}),
      });
      onDone(`${count(r.created,"invoice")} generated for ${r.label}${r.skipped?`, ${r.skipped} already existed`:""}.`);
    }catch(e){
      setErr(e.errors?.[0]?.message||e.message||"Could not generate invoices.");
      setBusy(false);
    }
  };

  return(
    <Modal title={`Generate ${label??period} Invoices`} onClose={onClose} width={640}>
      <div style={{fontSize:13,color:T.muted,marginBottom:18,lineHeight:1.6}}>
        One challan per active student for {label??period}. Students already billed for this
        month are left alone, breakdown and all.
      </div>

      <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:8,textTransform:"uppercase",letterSpacing:".6px"}}>
        This month&rsquo;s breakdown
      </div>
      <FeeHeadEditor items={items} onChange={setItems} disabled={busy}/>

      {!items.length&&(
        <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
          <Inp label="Or bill one flat amount (PKR)" type="number" min="0"
            placeholder={defaultFee?String(defaultFee):"0"} value={amount}
            onChange={e=>setAmount(e.target.value)} style={{marginBottom:6}}/>
          <div style={{fontSize:12,color:T.muted}}>
            Leave blank to use the standard monthly fee{defaultFee?` of ${RS(defaultFee)}`:""}.
          </div>
        </div>
      )}

      <div style={{marginTop:16}}>
        <Inp label="Only this class (optional)" placeholder="e.g. Grade 8" value={grade}
          onChange={e=>setGrade(e.target.value)} style={{marginBottom:0}}/>
      </div>

      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:12,marginTop:16,border:`1px solid ${T.danger}30`}}>{err}</div>}

      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:22}}>
        <Btn out color={T.muted} onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn onClick={submit} disabled={busy||blank}>
          {busy?"Generating…":items.length?`Bill ${RS(total)} each`:"Generate"}
        </Btn>
      </div>
    </Modal>
  );
};


const ReportCardModal=({studentId,onClose})=>{
  const[data,setData]=useState(null);
  const[err,setErr]=useState("");
  /** Which term the card covers. Empty means the whole year. */
  const[term,setTerm]=useState("");
  /**
   * Which academic year the card covers. Empty means the one the school is
   * running; a past year is reached by name. The list comes from the card
   * itself, so it can only ever offer years the school actually has.
   */
  const[session,setSession]=useState("");
  const[sessions,setSessions]=useState([]);

  useEffect(()=>{
    let cancelled=false;
    setData(null);setErr("");
    api.students.report(studentId,{term:term||undefined,session:session||undefined})
      .then(r=>{if(!cancelled)setData(r);})
      .catch(e=>{if(!cancelled)setErr(e.message||"Could not build the result card.");});
    return()=>{cancelled=true;};
  },[studentId,term,session]);

  const money=(n)=>`Rs. ${Number(n||0).toLocaleString("en-PK")}`;
  const day=(iso)=>{
    if(!iso)return "—";
    const d=new Date(iso);
    return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
  };

  // The server already computes the headline rate, counting a late arrival as
  // attendance. Recomputing it here would be a second opinion nobody asked for.
  const att=data?.attendance??{};
  const attTotal=att.total??0;
  const attPct=att.rate??null;

  /**
   * The terms this card can lay out side by side.
   *
   * Only on a whole-year card — a term card is one column by definition — and
   * only once something in the year has actually been marked, so an empty
   * table does not sprout three blank columns in September.
   */
  const termCols=(!data?.term&&(data?.subjects??[]).some(x=>x.terms?.some(t=>t.score!=null)))
    ?(data.subjects.find(x=>x.terms?.length)?.terms??[])
    :[];
  const weighting=data?.weighting??null;

  const fees=data?.fees??[];
  const outstanding=fees.filter(f=>f.status!=="PAID"&&f.status!=="WAIVED")
    .reduce((sum,f)=>sum+Number(f.amount||0)+Number(f.lateFee||0)-Number(f.discount||0)-Number(f.paidAmount||0),0);

  return(
    <Modal title="Result Card" onClose={onClose} width={780}>
      {/* A card is about one academic year and one term within it. The years
          offered are the ones this student actually has — the server sends its
          own list, so the picker can never ask for a card that does not exist. */}
      <div className="ec-no-print" style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        {(data?.sessions?.length??0)>1&&(
          <>
            <span style={{fontSize:12,color:T.muted,fontWeight:600}}>Session</span>
            <div style={{minWidth:150}}>
              <Sel
                options={(data?.sessions??[]).map(s=>({
                  v:s.name,
                  l:s.isCurrent?`${s.name} — current`:s.name,
                }))}
                value={session||data?.session?.name||""}
                onChange={e=>setSession(e.target.value)}/>
            </div>
          </>
        )}
        <span style={{fontSize:12,color:T.muted,fontWeight:600}}>Reporting period</span>
        <div style={{minWidth:170}}>
          <Sel options={termOptions(data?.terms)} value={term} onChange={e=>setTerm(e.target.value)}/>
        </div>
      </div>
      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
      {!data&&!err&&<div style={{padding:"40px",textAlign:"center",color:T.muted,fontSize:13}}>Building the result card…</div>}

      {data&&(
        <>
          <div className="ec-print-card" style={{border:`1px solid ${T.border}`,borderRadius:12,padding:"22px",background:T.card}}>
            {/* school header */}
            <div style={{textAlign:"center",borderBottom:`2px solid ${T.forest}`,paddingBottom:12,marginBottom:16}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:T.forest}}>{data.institute?.name}</div>
              <div style={{fontSize:12,color:T.muted,marginTop:2}}>{data.institute?.city}</div>
              <div style={{fontSize:13,fontWeight:700,color:T.ink,marginTop:8,letterSpacing:".5px"}}>STUDENT RESULT CARD</div>
              {/* The year belongs on the printed card, not just the picker —
                  a past card with no year on it is indistinguishable from this
                  year's once it leaves the screen. */}
              <div style={{fontSize:12,color:T.muted,marginTop:3,fontWeight:600}}>
                {data.session?.name?`${data.session.name} · `:""}{TERM_LABEL(data.term)}
              </div>
              {data.average===null&&(
                <div style={{fontSize:12,color:T.warning,marginTop:6,fontWeight:600}}>
                  {data.term
                    ?"No marks recorded for this term yet"
                    :"No marks recorded for this session yet"}
                </div>
              )}
            </div>

            {/* who it is about */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 20px",marginBottom:18}}>
              {[
                ["Name",data.student?.name],
                ["Registration No.",data.student?.code],
                ["Class",`${data.student?.grade??""} ${data.student?.section??""}`.trim()||"—"],
                ["Roll No.",data.student?.rollNo],
                ["Date of Birth",day(data.student?.dob)],
                ["Blood Group",data.student?.bloodGroup||"—"],
                ["Guardian",data.parent?.name||"—"],
                ["Guardian Contact",data.parent?.phone||"—"],
              ].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px dashed ${T.border}`}}>
                  <span style={{color:T.muted}}>{l}</span>
                  <span style={{color:T.ink,fontWeight:600,textAlign:"right",marginLeft:10,wordBreak:"break-word"}}>{v||"—"}</span>
                </div>
              ))}
            </div>

            {/* marks */}
            <div style={{fontSize:12,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>Subjects</div>
            <div style={{overflowX:"auto",border:`1px solid ${T.border}`,borderRadius:8,marginBottom:16}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:520}}>
                <thead><tr style={{background:T.paper}}>
                  {/* Marks lead, because a Pakistani card is written in marks
                      and read that way — the percentage summarises them. */}
                  {[
                    "Subject","Teacher",
                    /* One column per term of the year — "First 78 · Mid 82 ·
                       Final 85" is how an annual card is written here. The
                       share is in the heading so the arithmetic below it can
                       be checked. */
                    ...termCols.map(t=>weighting?`${t.name} (${t.weightage}%)`:t.name),
                    "Marks",weighting?"Weighted %":"%","Grade","Result",
                  ].map(h=>(
                    <th key={h} style={{padding:"8px 10px",textAlign:h==="Subject"||h==="Teacher"?"left":"center",fontWeight:700,color:T.muted,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(data.subjects??[]).map((s,i)=>(
                    <tr key={s.name+i}>
                      <td style={{padding:"7px 10px",borderBottom:`1px solid ${T.border}`,color:T.ink,fontWeight:600}}>{s.name}</td>
                      <td style={{padding:"7px 10px",borderBottom:`1px solid ${T.border}`,color:T.muted}}>{s.teacher||"—"}</td>
                      {termCols.map(col=>{
                        const t=(s.terms??[]).find(x=>x.name===col.name);
                        return(
                          <td key={col.name} style={{padding:"7px 10px",borderBottom:`1px solid ${T.border}`,textAlign:"center",whiteSpace:"nowrap",color:t?.score!=null?T.ink:T.muted,fontWeight:t?.score!=null?600:400}}>
                            {t?.marks?`${t.marks.obtained} / ${t.marks.total}`:"—"}
                          </td>
                        );
                      })}
                      <td style={{padding:"7px 10px",borderBottom:`1px solid ${T.border}`,color:T.ink,fontWeight:700,textAlign:"center",whiteSpace:"nowrap"}}>
                        {/* Nothing recorded is not a zero — say so rather than
                            printing a mark the child never sat for. */}
                        {s.marks
                          ? `${s.marks.obtained} / ${s.marks.total}`
                          : <span style={{color:T.muted,fontWeight:400}}>no marks</span>}
                      </td>
                      <td style={{padding:"7px 10px",borderBottom:`1px solid ${T.border}`,color:T.muted,textAlign:"center"}}>{s.score!=null?`${s.score}%`:"—"}</td>
                      <td style={{padding:"7px 10px",borderBottom:`1px solid ${T.border}`,fontWeight:700,textAlign:"center",color:T.forest}}>{s.grade||"—"}</td>
                      <td style={{padding:"7px 10px",borderBottom:`1px solid ${T.border}`,textAlign:"center",fontWeight:700,color:s.passed===null?T.muted:s.passed?T.success:T.danger}}>
                        {s.passed===null?"—":s.passed?"Pass":"Fail"}
                      </td>
                    </tr>
                  ))}
                  {!(data.subjects??[]).length&&(
                    <tr><td colSpan={6+termCols.length} style={{padding:"18px",textAlign:"center",color:T.muted}}>No subjects enrolled yet.</td></tr>
                  )}
                  {/* The grand total, summed from the marks themselves — a
                      subject marked out of 50 counts for half of one out of
                      100, which is what a school means by a total. */}
                  {data.marks&&(
                    <tr style={{background:T.paper}}>
                      <td colSpan={2+termCols.length} style={{padding:"9px 10px",fontWeight:800,color:T.ink}}>Total</td>
                      <td style={{padding:"9px 10px",textAlign:"center",fontWeight:800,color:T.ink,whiteSpace:"nowrap"}}>
                        {data.marks.obtained} / {data.marks.total}
                      </td>
                      {/* Under a weighting the pooled percentage is not the
                          school's answer — 159/200 is 79.5%, and a school that
                          weights its terms 40/60 means 81.2%. Printing the
                          pooled figure beside a grade worked out from the
                          weighted one would put two arithmetics on one sheet. */}
                      <td style={{padding:"9px 10px",textAlign:"center",fontWeight:800,color:T.ink}}>
                        {weighting?(data.average!=null?`${data.average}%`:"—"):`${data.marks.percentage}%`}
                      </td>
                      <td style={{padding:"9px 10px",textAlign:"center",fontWeight:800,color:T.forest}}>{data.overallGrade||"—"}</td>
                      <td style={{padding:"9px 10px",textAlign:"center",fontWeight:800,color:data.result?.passed?T.success:T.danger}}>
                        {data.result?(data.result.passed?"Pass":"Fail"):"—"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* How the weighted figure was reached. A combined number with no
                way to check it is how a school ends up unable to answer a
                parent standing at the counter. */}
            {weighting&&(
              <div style={{fontSize:11.5,color:T.muted,lineHeight:1.6,marginTop:-8,marginBottom:14}}>
                <b style={{color:T.ink}}>Weighted result.</b>{" "}
                {weighting.terms.map(t=>`${t.name} ${t.weightage}%`).join(" · ")}
                {" — "}the year is combined in those shares rather than pooled
                {" ("}{data.marks?`${data.marks.obtained} / ${data.marks.total} = ${data.marks.percentage}% unweighted`:"no marks"}{")."}
                {weighting.scaledUp&&(
                  <><br/>Only {weighting.shareCounted}% of the year has been marked
                  {" ("}{weighting.terms.filter(t=>!t.counted).map(t=>t.name).join(", ")}{" not sat yet)"},
                  {" "}so the marked terms carry the whole figure. An unsat term is not a zero.</>
                )}
                {weighting.marksOutsideTerms>0&&(
                  <><br/>{count(weighting.marksOutsideTerms,"mark")} {weighting.marksOutsideTerms===1?"belongs":"belong"} to no term and {weighting.marksOutsideTerms===1?"carries":"carry"} no weight,
                  {" "}so they are not in this figure.</>
                )}
              </div>
            )}

            {/* The judgement the card exists to deliver. A card that reported
                figures and left the reader to work out whether the child passed
                is the one thing a result card must not do. */}
            {data.result&&(
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",
                background:data.result.passed?`${T.success}10`:`${T.danger}10`,
                border:`1px solid ${data.result.passed?T.success:T.danger}35`,
                borderRadius:10,padding:"12px 16px",marginBottom:16}}>
                <div>
                  <div style={{fontSize:15,fontWeight:800,color:data.result.passed?T.success:T.danger}}>
                    {data.result.passed?"PASS":"FAIL"}
                  </div>
                  <div style={{fontSize:11.5,color:T.muted,marginTop:2}}>
                    {data.result.subjectsPassed} of {count(data.result.subjectsJudged,"subject")} cleared
                    {" · pass mark "}{data.result.passingPercentage}%
                  </div>
                </div>
                {data.session&&(
                  <div style={{fontSize:12,color:T.muted,textAlign:"right"}}>
                    {data.result.passed
                      ?"Eligible for promotion"
                      :`${count(data.result.subjectsFailed,"subject")} below the pass mark`}
                  </div>
                )}
              </div>
            )}

            {/* The figures a parent reads first — position at the front,
                because in a Pakistani result card that is the headline. */}
            <div className="ec-pair" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
              {[
                ["Position",data.rank?`${ordinal(data.rank)}${data.classSize?` of ${data.classSize}`:""}`:"—"],
                ["Overall Average",data.average!=null?`${data.average}%`:"—"],
                ["Overall Grade",data.overallGrade||"—"],
                ["Attendance",attPct!=null?`${attPct}%`:"—"],
              ].map(([l,v])=>(
                <div key={l} style={{background:T.paper,borderRadius:8,padding:"10px",textAlign:"center"}}>
                  <div style={{fontFamily:"Georgia,serif",fontSize:17,fontWeight:800,color:T.ink}}>{v}</div>
                  <div style={{fontSize:10,color:T.muted,marginTop:2,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div>
                </div>
              ))}
            </div>

            {/* attendance detail */}
            <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,color:T.muted,marginBottom:16,paddingBottom:14,borderBottom:`1px dashed ${T.border}`}}>
              <span>Present <strong style={{color:T.success}}>{att.present??0}</strong></span>
              <span>Absent <strong style={{color:T.danger}}>{att.absent??0}</strong></span>
              <span>Late <strong style={{color:T.warning}}>{att.late??0}</strong></span>
              <span>Leave <strong style={{color:T.blue}}>{att.leave??0}</strong></span>
              <span style={{marginLeft:"auto"}}>Days recorded <strong style={{color:T.ink}}>{attTotal}</strong></span>
            </div>

            {/* fees — a Pakistani result card is often withheld until dues clear */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,flexWrap:"wrap",gap:8}}>
              <span style={{color:T.muted}}>Fee status</span>
              <span style={{fontWeight:700,color:outstanding>0?T.danger:T.success}}>
                {outstanding>0?`${money(outstanding)} outstanding`:"No dues outstanding"}
              </span>
            </div>

            <div style={{marginTop:20,paddingTop:14,borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",fontSize:11,color:T.muted}}>
              <span>Issued {day(data.generatedAt)}</span>
              <span>Class Teacher / Principal ____________________</span>
            </div>
          </div>

          <div style={{display:"flex",gap:10,marginTop:16}} className="ec-no-print">
            <Btn onClick={onClose} out color={T.muted} style={{flex:1,padding:"11px"}}>Close</Btn>
            <Btn onClick={()=>window.print()} style={{flex:2,padding:"11px"}}>Print / Save as PDF</Btn>
          </div>
        </>
      )}
    </Modal>
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
  /**
   * Plan mix and revenue come from the API, not recomputed here.
   *
   * These two cards used to count every institute on a plan while the Total
   * MRR below them came from the server, which counts only ACTIVE ones. With
   * one suspended school the breakdown read Rs. 65,995 under a total of
   * Rs. 60,996, and nothing on the screen said which was right. Same source
   * now, so the parts add up to the whole by construction.
   */
  const planMix=db.platformDashboard?.planDistribution??null;
  const mixFor=id=>planMix?.find(p=>p.id===id);
  const activeInsts=planMix?planMix.reduce((a,p)=>a+p.institutes,0):insts.length;
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

  /**
   * Soft delete, and the dialog now says so.
   *
   * It used to claim this "erases every student, teacher, parent, mark,
   * attendance record and invoice" and "cannot be undone" — a description of
   * `purgeInstitute`, not of this endpoint. What actually happens is that the
   * row gains a `deletedAt`, goes CANCELLED, and its users are deactivated;
   * every record survives, and the server's own reply says it can be restored.
   * The typed-name gate went with the wording: it belongs on the erase, which
   * is irreversible, not on a reversible one. Erasing lives in the bin.
   */
  const removeInstitute=inst=>{
    if(!window.confirm(
      `Delete ${inst.name}?\n\nEveryone there is signed out and cannot sign back in, and the school disappears from this list. Nothing is erased — its ${count(inst.students,"student")}, ${count(inst.teachers,"teacher")} and all their records are kept.\n\nYou can restore it, or erase it for good, from the Recycle Bin.`
    ))return;
    run(`del-${inst.id}`,()=>api.institutes.remove(inst.id),`${inst.name} deleted — restorable from the Recycle Bin.`);
    setSelInst(null);
  };

  /** Banner shown above every tab so actions report back somewhere visible. */
  const Feedback=()=>(!err&&!note)?null:(
    <div style={{marginBottom:14,padding:"11px 16px",borderRadius:11,fontSize:13,fontWeight:600,
      background:err?`${T.danger}12`:`${T.success}12`,color:err?T.danger:T.success,
      border:`1px solid ${err?T.danger:T.success}30`,display:"flex",justifyContent:"space-between",gap:12}}>
      <span>{err||note}</span>
      <span {...pressable(()=>{setErr("");setNote("");},"Dismiss this message")} style={{cursor:"pointer",opacity:.6}}>×</span>
    </div>
  );

  const InstituteModal=()=>{
    const[f,setF]=useState({name:"",city:"",phone:"",email:"",planId:"starter",adminName:"",adminEmail:""});
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    const[saving,setSaving]=useState(false);
    // Named apart from the portal's own `err`, which this used to shadow —
    // the banner above every tab was unreachable from inside the dialog.
    const[formErr,setFormErr]=useState("");

    const create=async()=>{
      setSaving(true);setFormErr("");
      try{
        // Created by the platform owner, so it goes live immediately —
        // unlike a self-service signup, which starts PENDING.
        const res=await api.institutes.create({
          name:f.name,city:f.city,phone:f.phone,email:f.email,
          planId:f.planId,status:"ACTIVE",
          adminName:f.adminName,adminEmail:f.adminEmail,
        });
        setModal(null);
        // Carries either "details sent to <email>" or, with no mail server, the
        // temporary password itself. This button has always said it sends
        // credentials; this is the first version where something actually does,
        // and where the answer is put in front of whoever pressed it.
        setErr("");setNote(res?.__message??`${f.name} created.`);
        onReload?.();
      }catch(e){
        setFormErr(e.errors?.[0]?.message||e.message||"Could not create the institute.");
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
        <Inp label="Institute Email*" value={f.email} onChange={e=>s("email",e.target.value)} placeholder="info@school.edu" type="email"/>
        <Sel label="Plan" options={planList.map(p=>({v:p.id,l:`${p.name} — Rs. ${p.price.toLocaleString()}/mo`}))} value={f.planId} onChange={e=>s("planId",e.target.value)}/>

        {/* The school's first admin. Without these the school was created with
            nobody able to sign in — the institute email above is the school's
            own contact address, not a login. */}
        <div style={{borderTop:`1px solid ${T.border}`,margin:"6px 0 16px",paddingTop:16}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:12,textTransform:"uppercase",letterSpacing:".6px"}}>Who runs this school</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Inp label="Admin Name*" value={f.adminName} onChange={e=>s("adminName",e.target.value)} placeholder="e.g. Mrs. Ayesha Khan"/>
            <Inp label="Admin Email*" value={f.adminEmail} onChange={e=>s("adminEmail",e.target.value)} placeholder="principal@school.edu" type="email"/>
          </div>
          <div style={{fontSize:12,color:T.muted,marginTop:-4}}>
            Sign-in details are emailed here. If no mail server is configured, the
            temporary password is shown to you instead so you can pass it on.
          </div>
        </div>

        {formErr&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{formErr}</div>}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn onClick={()=>setModal(null)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={create} style={{flex:2,padding:"11px"}} disabled={!f.name||!f.city||!f.email||!f.phone||!f.adminName||!f.adminEmail||saving}>{saving?"Creating…":"Create & Send Credentials"}</Btn>
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
          {inst.name} has {count(inst.students,"student")} but {target.name} allows {target.maxStudents.toLocaleString()}. The API will reject this downgrade.
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
        setNote(`Broadcast published to ${count(r.institutes,"institute")}.`);
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

    setNote(`Exported ${count(insts.length,"institute")}, ${count(db.users.length,"user")} and ${count(db.subscriptions?.length??0,"invoice")}.`);
  };

  return(
    <Shell nav={nav} tab={tab} setTab={setTab} user={user} inst={{name:"EduConnect HQ",logo:"✦",color:T.ink}} collapsed={col} setCollapsed={setCol} onLogout={onLogout}>
      <Feedback/>
      {tab==="dashboard"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Platform Overview" title="Super Admin Dashboard"/>
          <div className="ec-pair" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
            {/* The sub-label used to say "Active schools" under a count of every
                school, suspended ones included. Both numbers, honestly named. */}
            <KPI label="Institutes" value={insts.length} color={T.blue} icon="🏫"
              sub={activeInsts===insts.length?"All active":`${activeInsts} active`}/>
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
                    <div style={{fontSize:12,color:T.muted}}>{i.city} · {count(i.students,"student")} · {count(i.teachers,"teacher")}</div>
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
                {planList.map(pl=>{const n=mixFor(pl.id)?.institutes??insts.filter(i=>i.plan===pl.id).length; return(
                  <div key={pl.id} style={{marginBottom:13}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:T.muted}}>{pl.name}</span><span style={{fontSize:12,fontWeight:700,color:pl.color}}>{n} school{n===1?"":"s"}</span></div>
                    <Bar val={activeInsts?n/activeInsts*100:0} color={pl.color}/>
                  </div>
                );})}
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Revenue by Plan</div>
                {planList.map(pl=>{const rev=mixFor(pl.id)?.monthlyRevenue??insts.filter(i=>i.plan===pl.id).length*pl.price; return(
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
                <span {...pressable(()=>setSelInst(null),"Close institute details")} style={{cursor:"pointer",color:T.muted,fontSize:22}}>×</span>
              </div>
              <div className="ec-pair" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginTop:18}}>
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
          <SecHead pre="Management" title="All Institutes" action={
            <div style={{display:"flex",gap:8,marginBottom:4}}>
              <Btn out color={T.muted} onClick={()=>setModal("instBin")}>Recycle Bin</Btn>
              <Btn onClick={()=>setModal("addInst")}>+ Onboard Institute</Btn>
            </div>
          }/>
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
            <KPI label="Outstanding" value={`Rs. ${(subSummary.PENDING?.amount??0).toLocaleString()}`} color={T.warning} icon="⏳" sub={count(subSummary.PENDING?.count??0,"unpaid invoice")}/>
          </div>
          <Crd style={{padding:"26px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,gap:12,flexWrap:"wrap"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink}}>
                Invoice History
                {selInst&&<span style={{fontSize:12,fontWeight:600,color:T.muted,marginLeft:8}}>
                  — {selInst.name} <span {...pressable(()=>setSelInst(null),"Clear the institute filter")} style={{cursor:"pointer",color:T.forest}}>(clear)</span>
                </span>}
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn onClick={()=>run("gen-subs",()=>api.subscriptions.generate(thisPeriod),
                  r=>`${count(r.created,"invoice")} generated for ${r.label}${r.skipped?` · ${r.skipped} already existed`:""}.`)}
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
                                if(!window.confirm(`Send ${u.name} a password reset link?\n\nThey are signed out everywhere immediately, and choose a new password themselves via the emailed link.`))return;
                                run(`pw-${u.id}`,()=>api.users.resetPassword(u.id),
                                  r=>r.emailed
                                    ? `Reset link sent to ${r.email}. ${u.name} is signed out everywhere; the link expires in ${r.expiresMinutes} minutes.`
                                    : `${u.name} is signed out everywhere. No mail server is configured, so the reset link is in the server log.`);
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
      {modal==="instBin"&&(
        <InstituteBinModal
          onClose={()=>setModal(null)}
          onChanged={()=>onReload?.()}
        />
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
const DAY_NAMES=["","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

/** "2026-27" for the school year the given date falls in (August start). */
const currentAcademicYear=(d=new Date())=>{
  const start=d.getMonth()>=7?d.getFullYear():d.getFullYear()-1;
  return `${start}-${String((start+1)%100).padStart(2,"0")}`;
};

/**
 * Academic classes — the school's own class/section structure.
 *
 * Module scope so it keeps its state when the portal re-renders; defined inside
 * AdminPortal it would be a new component type on every render and React would
 * remount it, wiping a half-typed form.
 */
const AdminClassesTab=({teachers,students,onChanged})=>{
  const[rows,setRows]=useState(null);
  const[years,setYears]=useState([]);
  const[err,setErr]=useState("");
  const[note,setNote]=useState("");
  const[search,setSearch]=useState("");
  const[year,setYear]=useState("");
  const[showArchived,setShowArchived]=useState(false);
  const[editing,setEditing]=useState(null);   // class object, or {} for new
  const[roster,setRoster]=useState(null);     // class whose students are open
  const[busy,setBusy]=useState("");

  const load=async()=>{
    setErr("");
    try{
      const r=await api.classes.list({
        ...(search.trim()&&{search:search.trim()}),
        ...(year&&{academicYear:year}),
        ...(showArchived&&{includeArchived:true}),
      });
      setRows(r);
      setYears(r.meta?.academicYears??[]);
    }catch(e){ setErr(e.message||"Could not load classes."); setRows([]); }
  };

  useEffect(()=>{load();},[search,year,showArchived]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash=m=>{setNote(m);setTimeout(()=>setNote(""),3000);};

  const archive=async(cls)=>{
    const next=!cls.isArchived;
    if(next&&!window.confirm(
      `Archive ${cls.name} ${cls.section}?\n\nIt disappears from the class list and can no longer be scheduled. Nothing is deleted — its timetable and students stay exactly as they are, and you can restore it at any time.`
    ))return;
    setBusy(cls.id);
    try{
      await api.classes.archive(cls.id,next);
      flash(`${cls.name} ${cls.section} ${next?"archived":"restored"}.`);
      await load(); onChanged?.();
    }catch(e){ setErr(e.message||"Could not archive that class."); }
    finally{ setBusy(""); }
  };

  return(
    <div style={{animation:"fadeUp .35s"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:12,flexWrap:"wrap"}}>
        <SecHead pre="Academic" title="Classes"/>
        <Btn onClick={()=>setEditing({})} style={{marginBottom:18}}>+ Add Class</Btn>
      </div>

      {note&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"11px 16px",fontSize:13,fontWeight:600,marginBottom:14,border:`1px solid ${T.success}30`}}>{note}</div>}
      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"11px 16px",fontSize:13,marginBottom:14,border:`1px solid ${T.danger}30`}}>{err}</div>}

      <Crd style={{padding:"16px 20px",marginBottom:16,display:"flex",gap:14,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div style={{minWidth:220,flex:1}}>
          <Inp label="Search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, section, code or room"/>
        </div>
        <div style={{minWidth:160}}>
          <Sel label="Academic Year" options={[{v:"",l:"All years"},...years.map(y=>({v:y,l:y}))]} value={year} onChange={e=>setYear(e.target.value)}/>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:T.ink,cursor:"pointer",marginBottom:14}}>
          <input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>
          Show archived
        </label>
      </Crd>

      {rows===null&&<Crd style={{padding:"28px",fontSize:13,color:T.muted}}>Loading classes…</Crd>}

      {rows?.length===0&&(
        <Crd style={{padding:"38px 28px",textAlign:"center"}}>
          <div style={{fontSize:38,marginBottom:10,color:T.border}}>▤</div>
          <div style={{fontFamily:"Georgia,serif",fontSize:17,color:T.ink,marginBottom:6}}>
            {search||year?"No classes match those filters":"No classes yet"}
          </div>
          <div style={{fontSize:13,color:T.muted,lineHeight:1.7,maxWidth:440,margin:"0 auto"}}>
            {search||year
              ?"Try clearing the search or choosing a different year."
              :"A class is how the school names a group of students — Grade 8 A, BSCS 3, LB3-101. Add one to start building its timetable."}
          </div>
        </Crd>
      )}

      {rows?.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16}}>
          {rows.map(c=>(
            <Crd key={c.id} style={{padding:"22px",opacity:c.isArchived?.65:1}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,gap:10}}>
                <div style={{minWidth:0}}>
                  <div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:800,color:T.ink}}>{c.name} {c.section}</div>
                  <div style={{fontSize:12,color:T.muted,marginTop:3}}>{c.code} · {c.academicYear}</div>
                </div>
                <Bdg label={c.isArchived?"archived":"active"} color={c.isArchived?T.muted:T.success} bg={`${c.isArchived?T.muted:T.success}15`}/>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
                {[["Students",c.studentCount],["Subjects",c.subjectCount],["Slots",c.slotCount]].map(([l,v])=>(
                  <div key={l} style={{background:T.paper,borderRadius:10,padding:"10px 6px",textAlign:"center"}}>
                    <div style={{fontSize:17,fontWeight:800,color:T.forest}}>{v}</div>
                    <div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".4px"}}>{l}</div>
                  </div>
                ))}
              </div>

              <div style={{fontSize:12,color:T.muted,marginBottom:14,lineHeight:1.7}}>
                <div>Room · {c.room||"—"}</div>
                <div>Class teacher · {c.classTeacher?.name||"Not assigned"}</div>
              </div>

              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <Btn out color={T.forest} onClick={()=>setEditing(c)} style={{flex:1,padding:"8px",fontSize:12}}>Edit</Btn>
                <Btn out color={T.blue} onClick={()=>setRoster(c)} style={{flex:1,padding:"8px",fontSize:12}}>Students</Btn>
                <Btn out color={c.isArchived?T.success:T.warning} disabled={busy===c.id} onClick={()=>archive(c)} style={{flex:1,padding:"8px",fontSize:12}}>
                  {c.isArchived?"Restore":"Archive"}
                </Btn>
              </div>
            </Crd>
          ))}
        </div>
      )}

      {editing&&(
        <ClassModal
          cls={editing.id?editing:null}
          teachers={teachers}
          years={years}
          onClose={()=>setEditing(null)}
          onSaved={m=>{setEditing(null);flash(m);load();onChanged?.();}}
        />
      )}

      {roster&&(
        <ClassRosterModal
          cls={roster}
          students={students}
          onClose={()=>setRoster(null)}
          onSaved={m=>{setRoster(null);flash(m);load();onChanged?.();}}
        />
      )}
    </div>
  );
};

/** Create or edit a class. */
const ClassModal=({cls,teachers,years,onClose,onSaved})=>{
  const[f,setF]=useState({
    name:cls?.name??"",
    section:cls?.section??"",
    code:cls?.code??"",
    academicYear:cls?.academicYear??years?.[0]??currentAcademicYear(),
    room:cls?.room??"",
    classTeacherId:cls?.classTeacherId??"",
    description:cls?.description??"",
  });
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState("");

  const save=async()=>{
    setSaving(true);setErr("");
    try{
      const payload={
        name:f.name.trim(),
        section:f.section.trim(),
        code:f.code.trim(),
        academicYear:f.academicYear.trim(),
        room:f.room.trim()||null,
        description:f.description.trim()||null,
        classTeacherId:f.classTeacherId||null,
      };
      if(cls) await api.classes.update(cls.id,payload);
      else await api.classes.create(payload);
      onSaved(`${payload.name} ${payload.section} ${cls?"updated":"created"}.`);
    }catch(e){ setErr(e.errors?.[0]?.message||e.message||"Could not save that class."); }
    finally{ setSaving(false); }
  };

  return(
    <Modal title={cls?`Edit ${cls.name} ${cls.section}`:"Add New Class"} onClose={onClose} width={560}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Inp label="Class / Grade*" value={f.name} onChange={e=>s("name",e.target.value)} placeholder="Grade 8, BSCS"/>
        <Inp label="Section*" value={f.section} onChange={e=>s("section",e.target.value)} placeholder="A, 3"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Inp label="Class Code*" value={f.code} onChange={e=>s("code",e.target.value)} placeholder="LB3-101, 8A"/>
        <Inp label="Academic Year*" value={f.academicYear} onChange={e=>s("academicYear",e.target.value)} placeholder="2026-27"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Inp label="Room" value={f.room} onChange={e=>s("room",e.target.value)} placeholder="Lab 101"/>
        <Sel label="Class Teacher"
          options={[{v:"",l:"Not assigned"},...(teachers??[]).map(t=>({v:t.id,l:t.name}))]}
          value={f.classTeacherId} onChange={e=>s("classTeacherId",e.target.value)}/>
      </div>
      <Inp label="Description" value={f.description} onChange={e=>s("description",e.target.value)} placeholder="Optional"/>

      <div style={{background:T.paper,borderRadius:10,padding:"12px 14px",fontSize:12,color:T.muted,lineHeight:1.7,marginBottom:14,border:`1px solid ${T.border}`}}>
        Students belong to a class through their grade and section, which is what the register and grade book read. Use <b>Students</b> on the class card to move them in.
      </div>

      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
      <div style={{display:"flex",gap:10}}>
        <Btn out color={T.muted} onClick={onClose} style={{flex:1,padding:"11px"}}>Cancel</Btn>
        <Btn onClick={save} disabled={!f.name.trim()||!f.section.trim()||!f.code.trim()||!f.academicYear.trim()||saving} style={{flex:2,padding:"11px"}}>
          {saving?"Saving…":cls?"Save Changes":"Create Class"}
        </Btn>
      </div>
    </Modal>
  );
};

/** Who is in this class, and moving students into it. */
const ClassRosterModal=({cls,students,onClose,onSaved})=>{
  const[detail,setDetail]=useState(null);
  const[picked,setPicked]=useState([]);
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState("");

  useEffect(()=>{
    let cancelled=false;
    api.classes.get(cls.id)
      .then(r=>{if(!cancelled)setDetail(r);})
      .catch(e=>{if(!cancelled)setErr(e.message||"Could not load that class.");});
    return()=>{cancelled=true;};
  },[cls.id]);

  const inClass=new Set((detail?.students??[]).map(s=>s.id));
  const candidates=(students??[]).filter(s=>!inClass.has(s.id));

  const assign=async()=>{
    setSaving(true);setErr("");
    try{
      const r=await api.classes.assignStudents(cls.id,picked);
      onSaved(`${count(picked.length,"student")} moved into ${cls.name} ${cls.section}.`);
    }catch(e){ setErr(e.errors?.[0]?.message||e.message||"Could not move those students."); }
    finally{ setSaving(false); }
  };

  return(
    <Modal title={`${cls.name} ${cls.section} — Students`} onClose={onClose} width={560}>
      {!detail&&!err&&<div style={{fontSize:13,color:T.muted,padding:"10px 0"}}>Loading roster…</div>}

      {detail&&(
        <>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>
            In this class ({detail.students.length})
          </div>
          <div style={{maxHeight:150,overflowY:"auto",border:`1.5px solid ${T.border}`,borderRadius:10,padding:6,marginBottom:16,background:T.paper}}>
            {!detail.students.length&&<div style={{padding:"10px",fontSize:13,color:T.muted}}>Nobody is in this class yet.</div>}
            {detail.students.map(s=>(
              <div key={s.id} style={{display:"flex",gap:10,alignItems:"center",padding:"7px 8px",fontSize:13,color:T.ink}}>
                <Av name={s.name} size={26} bg={`${T.forest}15`} color={T.forest} fs={10}/>
                {s.name}<span style={{color:T.muted,fontSize:11,marginLeft:"auto"}}>{s.rollNo}</span>
              </div>
            ))}
          </div>

          <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>
            Move students in
          </div>
          <div style={{maxHeight:170,overflowY:"auto",border:`1.5px solid ${T.border}`,borderRadius:10,padding:6,marginBottom:12,background:T.paper}}>
            {!candidates.length&&<div style={{padding:"10px",fontSize:13,color:T.muted}}>Every student is already in this class.</div>}
            {candidates.map(s=>(
              <label key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 8px",cursor:"pointer",fontSize:13,color:T.ink}}>
                <input type="checkbox" checked={picked.includes(s.id)}
                  onChange={()=>setPicked(p=>p.includes(s.id)?p.filter(x=>x!==s.id):[...p,s.id])}/>
                {s.name}
                <span style={{color:T.muted,fontSize:11,marginLeft:"auto"}}>{s.grade} {s.section}</span>
              </label>
            ))}
          </div>

          <div style={{background:`${T.warning}10`,border:`1px solid ${T.warning}30`,borderRadius:10,padding:"10px 14px",fontSize:12,color:T.ink,lineHeight:1.7,marginBottom:14}}>
            Moving a student changes their grade and section, so their register, grade book and timetable follow them to this class.
          </div>
        </>
      )}

      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
      <div style={{display:"flex",gap:10}}>
        <Btn out color={T.muted} onClick={onClose} style={{flex:1,padding:"11px"}}>Close</Btn>
        <Btn onClick={assign} disabled={!picked.length||saving} style={{flex:2,padding:"11px"}}>
          {saving?"Moving…":picked.length?`Move ${count(picked.length,"student")}`:"Move students"}
        </Btn>
      </div>
    </Modal>
  );
};

/**
 * Timetable management — a week at a glance, filterable, with conflicts
 * reported in the school's own words.
 *
 * Grouped by day rather than laid out as a fixed period grid: different classes
 * run different period lengths, and a rigid column-per-period table silently
 * misaligns the moment two classes disagree about when period 3 starts.
 */
const AdminTimetableTab=({teachers,onChanged})=>{
  const[slots,setSlots]=useState(null);
  const[classes,setClasses]=useState([]);
  // Fetched here rather than carried in `db`: only this screen needs the full
  // subject list, and loading it with every admin page view would be waste.
  const[subjects,setSubjects]=useState([]);
  const[rooms,setRooms]=useState([]);
  const[err,setErr]=useState("");
  const[note,setNote]=useState("");
  const[filters,setFilters]=useState({classId:"",teacherId:"",room:"",academicYear:"",day:""});
  const[editing,setEditing]=useState(null);
  const[busy,setBusy]=useState("");

  const setF=(k,v)=>setFilters(x=>({...x,[k]:v}));
  const flash=m=>{setNote(m);setTimeout(()=>setNote(""),3000);};

  const load=async()=>{
    setErr("");
    try{
      const [sched,cls,subs]=await Promise.all([
        api.timetable.schedule({
          ...(filters.classId&&{classId:filters.classId}),
          ...(filters.teacherId&&{teacherId:filters.teacherId}),
          ...(filters.room&&{room:filters.room}),
          ...(filters.academicYear&&{academicYear:filters.academicYear}),
          ...(filters.day&&{dayOfWeek:filters.day}),
        }),
        api.classes.list(),
        api.subjects.list(),
      ]);
      setSlots(sched);
      setRooms(sched.meta?.rooms??[]);
      setClasses(cls);
      setSubjects(subs);
    }catch(e){ setErr(e.message||"Could not load the timetable."); setSlots([]); }
  };

  useEffect(()=>{load();},[filters.classId,filters.teacherId,filters.room,filters.academicYear,filters.day]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove=async(slot)=>{
    if(!window.confirm(
      `Remove ${slot.subject.name} for ${slot.grade}-${slot.section} on ${DAY_NAMES[slot.dayOfWeek]} at ${slot.startTime??`period ${slot.period}`}?\n\nThis deletes the timetable entry. Attendance and marks already recorded are not affected.`
    ))return;
    setBusy(slot.id);
    try{
      await api.timetable.removeSlot(slot.id);
      flash("Timetable slot removed.");
      await load(); onChanged?.();
    }catch(e){ setErr(e.message||"Could not remove that slot."); }
    finally{ setBusy(""); }
  };

  // Days present in the data, each with its slots in time order.
  const days=[...new Set((slots??[]).map(s=>s.dayOfWeek))].sort((a,b)=>a-b);
  const byDay=d=>(slots??[])
    .filter(s=>s.dayOfWeek===d)
    .sort((a,b)=>(a.startTime??"").localeCompare(b.startTime??"")||a.period-b.period);

  const activeClasses=classes.filter(c=>!c.isArchived);
  const years=[...new Set(classes.map(c=>c.academicYear))];

  return(
    <div style={{animation:"fadeUp .35s"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:12,flexWrap:"wrap"}}>
        <SecHead pre="Academic" title="Timetable"/>
        {/*
          A dead button needs to say why, where the button is.
          The reason lived only in the empty state below, which a school with
          slots already on the board never sees — so an admin whose classes had
          all been archived found the one action on the screen greyed out and
          nothing anywhere explaining it.
        */}
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:18}}>
          {!activeClasses.length&&(
            <span style={{fontSize:12,color:T.muted,maxWidth:280,lineHeight:1.6,textAlign:"right"}}>
              A slot belongs to a class, and this school has none yet — add one on the Classes tab.
            </span>
          )}
          <Btn onClick={()=>setEditing({})} disabled={!activeClasses.length}>+ Add Slot</Btn>
        </div>
      </div>

      {note&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"11px 16px",fontSize:13,fontWeight:600,marginBottom:14,border:`1px solid ${T.success}30`}}>{note}</div>}
      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"11px 16px",fontSize:13,marginBottom:14,border:`1px solid ${T.danger}30`}}>{err}</div>}

      <Crd style={{padding:"16px 20px",marginBottom:16,display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div style={{minWidth:170,flex:1}}>
          <Sel label="Class" options={[{v:"",l:"All classes"},...activeClasses.map(c=>({v:c.id,l:`${c.name} ${c.section} · ${c.code}`}))]}
            value={filters.classId} onChange={e=>setF("classId",e.target.value)}/>
        </div>
        <div style={{minWidth:150,flex:1}}>
          <Sel label="Teacher" options={[{v:"",l:"All teachers"},...(teachers??[]).map(t=>({v:t.id,l:t.name}))]}
            value={filters.teacherId} onChange={e=>setF("teacherId",e.target.value)}/>
        </div>
        <div style={{minWidth:140}}>
          <Sel label="Room" options={[{v:"",l:"All rooms"},...rooms.map(r=>({v:r,l:r}))]}
            value={filters.room} onChange={e=>setF("room",e.target.value)}/>
        </div>
        <div style={{minWidth:130}}>
          <Sel label="Year" options={[{v:"",l:"All years"},...years.map(y=>({v:y,l:y}))]}
            value={filters.academicYear} onChange={e=>setF("academicYear",e.target.value)}/>
        </div>
        <div style={{minWidth:130}}>
          <Sel label="View" options={[{v:"",l:"Whole week"},...DAY_NAMES.slice(1).map((d,i)=>({v:String(i+1),l:d}))]}
            value={filters.day} onChange={e=>setF("day",e.target.value)}/>
        </div>
      </Crd>

      {slots===null&&<Crd style={{padding:"28px",fontSize:13,color:T.muted}}>Loading timetable…</Crd>}

      {slots?.length===0&&(
        <Crd style={{padding:"38px 28px",textAlign:"center"}}>
          <div style={{fontSize:38,marginBottom:10,color:T.border}}>▦</div>
          <div style={{fontFamily:"Georgia,serif",fontSize:17,color:T.ink,marginBottom:6}}>
            {!activeClasses.length?"Add a class first":"Nothing scheduled here"}
          </div>
          <div style={{fontSize:13,color:T.muted,lineHeight:1.7,maxWidth:440,margin:"0 auto"}}>
            {!activeClasses.length
              ?"A timetable slot belongs to a class. Create one on the Classes tab, then come back."
              :"No slots match these filters. Clear them, or add the first slot for this class."}
          </div>
        </Crd>
      )}

      {days.map(d=>(
        <Crd key={d} style={{padding:"20px 24px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontFamily:"Georgia,serif",fontSize:17,fontWeight:800,color:T.ink}}>{DAY_NAMES[d]}</div>
            <span style={{fontSize:11,color:T.muted}}>{count(byDay(d).length,"period")}</span>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:10}}>
            {byDay(d).map(s=>(
              <div key={s.id} style={{border:`1.5px solid ${T.border}`,borderRadius:12,padding:"12px 14px",background:T.paper,borderLeft:`4px solid ${s.subject.color||T.forest}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.ink}}>{s.subject.name}</div>
                  <span style={{fontSize:11,color:T.muted,whiteSpace:"nowrap"}}>
                    {s.startTime&&s.endTime?`${s.startTime}–${s.endTime}`:`P${s.period}`}
                  </span>
                </div>
                <div style={{fontSize:11.5,color:T.muted,lineHeight:1.7}}>
                  <div>{s.grade}-{s.section}{s.academicClass?.code?` · ${s.academicClass.code}`:""}</div>
                  <div>{s.teacher?.name||"No teacher"}{s.room?` · ${s.room}`:""}</div>
                  {s.notes&&<div style={{fontStyle:"italic"}}>{s.notes}</div>}
                </div>
                <div style={{display:"flex",gap:6,marginTop:10}}>
                  <Btn out color={T.forest} onClick={()=>setEditing(s)} style={{flex:1,padding:"6px",fontSize:11}}>Edit</Btn>
                  <Btn out color={T.danger} disabled={busy===s.id} onClick={()=>remove(s)} style={{flex:1,padding:"6px",fontSize:11}}>Remove</Btn>
                </div>
              </div>
            ))}
          </div>
        </Crd>
      ))}

      {editing&&(
        <SlotModal
          slot={editing.id?editing:null}
          classes={activeClasses}
          subjects={subjects}
          teachers={teachers}
          onClose={()=>setEditing(null)}
          onSaved={m=>{setEditing(null);flash(m);load();onChanged?.();}}
        />
      )}
    </div>
  );
};

/**
 * Add or edit a timetable slot.
 *
 * Conflicts come back from the server as a 409 and are shown verbatim — the
 * browser never decides whether a slot is schedulable, because only the server
 * can see every other class's timetable.
 */
const SlotModal=({slot,classes,subjects,teachers,onClose,onSaved})=>{
  const[f,setF]=useState({
    classId:slot?.classId??slot?.academicClass?.id??classes[0]?.id??"",
    subjectId:slot?.subject?.id??"",
    teacherId:slot?.teacher?.id??"",
    dayOfWeek:String(slot?.dayOfWeek??1),
    startTime:slot?.startTime??"08:00",
    endTime:slot?.endTime??"08:45",
    room:slot?.room??"",
    notes:slot?.notes??"",
  });
  const s=(k,v)=>setF(x=>({...x,[k]:v}));
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState("");

  const save=async()=>{
    setSaving(true);setErr("");
    try{
      const payload={
        classId:f.classId,
        subjectId:f.subjectId,
        teacherId:f.teacherId||null,
        dayOfWeek:Number(f.dayOfWeek),
        startTime:f.startTime,
        endTime:f.endTime,
        room:f.room.trim()||null,
        notes:f.notes.trim()||null,
      };
      if(slot) await api.timetable.editSlot(slot.id,payload);
      else await api.timetable.addSlot(payload);
      onSaved(`Timetable slot ${slot?"updated":"added"}.`);
    }catch(e){ setErr(e.message||"Could not save that slot."); }
    finally{ setSaving(false); }
  };

  const conflict=/Conflict:/i.test(err);

  return(
    <Modal title={slot?"Edit Timetable Slot":"Add Timetable Slot"} onClose={onClose} width={560}>
      <Sel label="Class*" options={classes.map(c=>({v:c.id,l:`${c.name} ${c.section} · ${c.code}`}))}
        value={f.classId} onChange={e=>s("classId",e.target.value)}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Sel label="Subject*" options={[{v:"",l:"Choose a subject…"},...(subjects??[]).map(x=>({v:x.id,l:x.name}))]}
          value={f.subjectId} onChange={e=>s("subjectId",e.target.value)}/>
        <Sel label="Teacher" options={[{v:"",l:"Subject's own teacher"},...(teachers??[]).map(t=>({v:t.id,l:t.name}))]}
          value={f.teacherId} onChange={e=>s("teacherId",e.target.value)}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 1fr",gap:12}}>
        <Sel label="Day*" options={DAY_NAMES.slice(1).map((d,i)=>({v:String(i+1),l:d}))}
          value={f.dayOfWeek} onChange={e=>s("dayOfWeek",e.target.value)}/>
        <Inp label="Start*" type="time" value={f.startTime} onChange={e=>s("startTime",e.target.value)}/>
        <Inp label="End*" type="time" value={f.endTime} onChange={e=>s("endTime",e.target.value)}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Inp label="Room" value={f.room} onChange={e=>s("room",e.target.value)} placeholder="Class's own room"/>
        <Inp label="Notes" value={f.notes} onChange={e=>s("notes",e.target.value)} placeholder="Optional"/>
      </div>

      {err&&(
        <div style={{background:`${conflict?T.warning:T.danger}12`,color:conflict?T.ink:T.danger,borderRadius:10,padding:"12px 14px",fontSize:13,marginBottom:12,border:`1px solid ${conflict?T.warning:T.danger}40`,lineHeight:1.7}}>
          {conflict&&<div style={{fontWeight:700,marginBottom:4,color:T.warning}}>⚠ Scheduling conflict</div>}
          {err}
        </div>
      )}

      <div style={{display:"flex",gap:10}}>
        <Btn out color={T.muted} onClick={onClose} style={{flex:1,padding:"11px"}}>Cancel</Btn>
        <Btn onClick={save} disabled={!f.classId||!f.subjectId||!f.startTime||!f.endTime||saving} style={{flex:2,padding:"11px"}}>
          {saving?"Saving…":slot?"Save Changes":"Add Slot"}
        </Btn>
      </div>
    </Modal>
  );
};

const ADMIN_TABS=["dashboard","students","teachers","parents","classes","timetable","attendance","fees","messages","notices","reports","billing","settings"];

/**
 * Campuses, for the schools that have more than one.
 *
 * It lives in Settings rather than the navigation because most schools have a
 * single building, and a fourteenth tab they never open is only noise. Every
 * campus control elsewhere in the portal hides itself when this list is empty,
 * so a school that never opens a second campus sees the product it had before.
 *
 * Closing a campus does not close the people on it: their campus goes blank and
 * they stay on the roll. That is the honest state for a child whose building
 * shut, and removing them is a different button on a different screen.
 */
const CampusesCard=({onChanged})=>{
  const[rows,setRows]=useState(null);
  const[err,setErr]=useState("");
  const[note,setNote]=useState("");
  const[busy,setBusy]=useState("");
  const[form,setForm]=useState(null);      // {} for a new one, or the campus being edited
  const[confirming,setConfirming]=useState("");

  const load=async()=>{
    setErr("");
    try{ setRows(await api.branches.list()); }
    catch(e){ setErr(e.message||"Could not read the campuses."); setRows([]); }
  };
  useEffect(()=>{load();},[]);

  const flash=m=>{setNote(m);setTimeout(()=>setNote(""),3500);};

  const save=async()=>{
    const body={
      name:(form.name||"").trim(),
      code:(form.code||"").trim(),
      city:(form.city||"").trim()||null,
      isMain:!!form.isMain,
    };
    if(body.name.length<2||body.code.length<2){setErr("A campus needs a name and a short code.");return;}
    setBusy("save");setErr("");
    try{
      if(form.id) await api.branches.update(form.id,body);
      else await api.branches.create(body);
      setForm(null);
      await load();
      onChanged?.();
      flash(form.id?`${body.name} updated.`:`${body.name} added.`);
    }catch(e){ setErr(e.message||"Could not save the campus."); }
    finally{ setBusy(""); }
  };

  const close=async b=>{
    setBusy(b.id);setErr("");
    try{
      const gone=await api.branches.remove(b.id);
      setConfirming("");
      await load();
      onChanged?.();
      const n=(gone?.students??0)+(gone?.teachers??0);
      flash(n?`${b.name} closed — ${count(n,"person","people")} now have no campus.`:`${b.name} closed.`);
    }catch(e){ setErr(e.message||"Could not close the campus."); }
    finally{ setBusy(""); }
  };

  return(
    <Crd style={{padding:"26px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <div style={{fontSize:14,fontWeight:700,color:T.ink}}>Campuses</div>
        {!form&&<Btn out color={T.forest} onClick={()=>{setForm({});setErr("");}}>+ Add Campus</Btn>}
      </div>
      <div style={{fontSize:12,color:T.muted,lineHeight:1.7,marginBottom:16}}>
        For a school that runs more than one building. Students and teachers can be
        assigned to a campus, and the roster filtered down to it. Leave this empty if
        you have one campus — nothing else changes.
      </div>

      {note&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"9px 13px",fontSize:12.5,marginBottom:12}}>{note}</div>}
      {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"9px 13px",fontSize:12.5,marginBottom:12}}>{err}</div>}

      {form&&(
        <div style={{border:`1px solid ${T.border}`,borderRadius:12,padding:"14px",marginBottom:14,background:T.paper}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 120px",gap:10}}>
            <Inp label="Campus name" value={form.name??""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Gulberg Campus" style={{marginBottom:0}}/>
            <Inp label="Code" value={form.code??""} onChange={e=>setForm(f=>({...f,code:e.target.value}))} placeholder="GLB" style={{marginBottom:0}}/>
          </div>
          <Inp label="City" value={form.city??""} onChange={e=>setForm(f=>({...f,city:e.target.value}))} placeholder="Lahore" style={{marginTop:10,marginBottom:0}}/>
          <label style={{display:"flex",gap:8,alignItems:"center",marginTop:12,fontSize:12.5,color:T.muted,cursor:"pointer"}}>
            <input type="checkbox" checked={!!form.isMain} onChange={e=>setForm(f=>({...f,isMain:e.target.checked}))}/>
            Main campus — where a student lands when nobody says which
          </label>
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <Btn onClick={save} disabled={busy==="save"}>{busy==="save"?"Saving…":(form.id?"Save":"Add campus")}</Btn>
            <Btn out color={T.muted} onClick={()=>{setForm(null);setErr("");}}>Cancel</Btn>
          </div>
        </div>
      )}

      {rows===null&&<div style={{fontSize:12.5,color:T.muted,padding:"10px 0"}}>Loading…</div>}
      {rows!==null&&rows.length===0&&!form&&(
        <div style={{fontSize:12.5,color:T.muted,padding:"14px 0",lineHeight:1.7}}>
          No campuses yet. This school is treated as a single site.
        </div>
      )}

      {(rows??[]).map(b=>(
        <div key={b.id} style={{display:"flex",gap:10,alignItems:"center",padding:"11px 0",borderTop:`1px solid ${T.border}`}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:700,color:T.ink}}>{b.name}</span>
              <Bdg label={b.code} color={T.blue} bg={`${T.blue}12`}/>
              {b.isMain&&<Bdg label="Main" color={T.forest} bg={`${T.forest}12`}/>}
            </div>
            <div style={{fontSize:11.5,color:T.muted,marginTop:3}}>
              {b.city?`${b.city} · `:""}{count(b.studentCount,"student")} · {count(b.teacherCount,"teacher")}
            </div>
          </div>
          {confirming===b.id?(
            <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
              <span style={{fontSize:11,color:T.danger,fontWeight:700}}>Close it?</span>
              <span {...pressable(()=>close(b),`Confirm closing ${b.name}`,{disabled:busy===b.id})} style={{cursor:"pointer"}}>
                <Bdg label={busy===b.id?"Closing…":"Yes"} color={T.danger} bg={`${T.danger}15`}/>
              </span>
              <span {...pressable(()=>setConfirming(""),"Keep it")} style={{cursor:"pointer"}}>
                <Bdg label="Keep" color={T.muted} bg={T.paper}/>
              </span>
            </div>
          ):(
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <span {...pressable(()=>{setForm(b);setErr("");},`Edit ${b.name}`)} style={{cursor:"pointer"}}>
                <Bdg label="Edit" color={T.forest} bg={`${T.forest}15`}/>
              </span>
              <span {...pressable(()=>setConfirming(b.id),`Close ${b.name}`)} style={{cursor:"pointer"}}>
                <Bdg label="Close" color={T.danger} bg={`${T.danger}15`}/>
              </span>
            </div>
          )}
        </div>
      ))}
    </Crd>
  );
};

const AdminPortal=({user,db,setDb,onLogout,onReload})=>{
  const[tab,setTab]=useHashTab("dashboard",ADMIN_TABS);
  const[col,setCol]=useState(false);
  const[modal,setModal]=useState(null);
  const[selStu,setSelStu]=useState(null);
  /**
   * Messaging. The backend has always let an admin write to any teacher or
   * parent in their institute, and let both write back — but the portal had no
   * screen for it, so a teacher's message to the office arrived somewhere
   * nobody could look. These are the state for the inbox that fixes that.
   */
  const[selMsg,setSelMsg]=useState(null);
  const[box,setBox]=useState("inbox");
  const[compose,setCompose]=useState(false);
  const[sentNote,setSentNote]=useState("");
  const[reply,setReply]=useState("");
  const[replyBusy,setReplyBusy]=useState(false);
  const[replyNote,setReplyNote]=useState("");
  const inst=db.institutes.find(i=>i.id===user.inst)||db.institutes[0];
  const students=db.students.filter(s=>s.instId===user.inst);
  const adminMsgs=db.messages.filter(m=>m.instId===user.inst);
  const adminBoxMsgs=adminMsgs.filter(m=>box==="sent"?m.fromId===user.id:m.toId===user.id);

  /** Opening a message marks it read, so the nav badge means something. */
  const openAdminMessage=async m=>{
    setSelMsg(m);setReplyNote("");
    // The list carries a reply count and no replies, so the thread has to be
    // asked for. Falling back to the list object keeps the message readable
    // if that call fails.
    try{ setSelMsg(toLegacyMessage(await api.messages.get(m.parentId??m.id),user.id)); }
    catch{/* the list copy is still worth reading */}
    if(!m.unread)return;
    try{ await api.messages.markRead(m.id); onReload?.(); }
    catch{/* a failed read receipt shouldn't stop them reading it */}
  };

  const sendAdminReply=async()=>{
    if(!reply.trim()||!selMsg||replyBusy)return;
    const body=reply;
    setReply("");setReplyBusy(true);setReplyNote("");
    try{
      await api.messages.reply(selMsg.id,body);
      // Put it in the thread they are reading, rather than leaving them to
      // wonder whether it went: `onReload` refreshes the list, and the list
      // has never carried replies.
      try{ setSelMsg(toLegacyMessage(await api.messages.get(selMsg.id),user.id)); }catch{/* the banner already said it sent */}
      setReplyNote(`Reply sent to ${selMsg.from}.`);
      setTimeout(()=>setReplyNote(""),2500);
      onReload?.();
    }catch(e){
      setReply(body); // don't lose what they typed
      setReplyNote(e.message||"Could not send the reply.");
    }finally{setReplyBusy(false);}
  };

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
      <span {...pressable(()=>{setPErr("");setPNote("");},"Dismiss this message")} style={{cursor:"pointer",opacity:.6}}>×</span>
    </div>
  );

  const teachers=db.teachers.filter(t=>t.instId===user.inst);
  const parents=db.parents.filter(p=>p.instId===user.inst);

  /**
   * Finding one child in a school of twelve hundred.
   *
   * The roster and the parent list had no search at all: three buttons, then
   * every row in one table with no pagination. The commonest question a school
   * office asks is about one named child, and answering it meant scrolling, or
   * the browser own Ctrl+F.
   *
   * Filtered here rather than by asking the server, because useDb has already
   * fetched the whole cohort for the reports, the register and the parent
   * lookups; sixty-odd sites read db.students. With the rows already in hand, a
   * round trip per keystroke would add latency and a second source of truth to
   * answer a question we can answer instantly. If the roster ever stops loading
   * the full set, this moves to the `search` parameter that GET /students and
   * GET /parents already accept.
   */
  const[stuQ,setStuQ]=useState("");
  const[stuGrade,setStuGrade]=useState("");
  const[stuStatus,setStuStatus]=useState("");
  const[stuBranch,setStuBranch]=useState("");
  const[tchBranch,setTchBranch]=useState("");

  const[parQ,setParQ]=useState("");

  const gradeOptions=useMemo(()=>{
    const seen=[...new Set(students.map(s=>s.grade).filter(Boolean))];
    // Numeric collation, so "Grade 10" sorts after "Grade 9" and not before it.
    seen.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    return[{v:"",l:"All grades"},...seen.map(g=>({v:g,l:g}))];
  },[students]);

  /**
   * Campuses, or nothing at all.
   *
   * A school with one building has no branches, so this list is empty and the
   * filter that reads it never renders. Nobody is asked to choose between one
   * option and itself.
   */
  const branches=db.branches??[];
  const branchOptions=[{v:"",l:"All campuses"},...branches.map(b=>({v:b.id,l:b.name}))];

  /**
   * A campus that has just been closed is not a filter any more.
   *
   * Closing one while its roster was on screen left the id sitting in this
   * state. Nothing matches a deleted branch, so the list reported zero
   * students out of two thousand — and the dropdown, unable to find that id
   * among its options, innocently read "All campuses" above the empty table.
   */
  useEffect(()=>{
    if(stuBranch&&!branches.some(b=>b.id===stuBranch))setStuBranch("");
    if(tchBranch&&!branches.some(b=>b.id===tchBranch))setTchBranch("");
  },[branches,stuBranch,tchBranch]);

  const statusOptions=[
    {v:"",l:"All statuses"},{v:"active",l:"Active"},{v:"inactive",l:"Inactive"},
    {v:"graduated",l:"Graduated"},{v:"transferred",l:"Transferred"},
  ];

  const shownStudents=useMemo(()=>{
    const q=stuQ.trim().toLowerCase();
    const has=v=>(v??"").toLowerCase().includes(q);
    return students.filter(s=>
      (!stuGrade||s.grade===stuGrade)&&
      (!stuStatus||s.status===stuStatus)&&
      (!stuBranch||s.branch?.id===stuBranch)&&
      // Name, roll and code: the three things a parent or a file actually quotes.
      (!q||has(s.name)||has(s.roll)||has(s.code))
    );
  },[students,stuQ,stuGrade,stuStatus,stuBranch]);

  /**
   * How many of those rows the table actually draws.
   *
   * The portal holds every student in memory on purpose — it is what makes
   * the search above instant and complete across the whole roll rather than
   * across one page of it. Drawing them is the part that does not scale: a
   * 2,000-child school rendered 2,000 rows, 34,000 DOM nodes and a table
   * 113,000px tall, and every keystroke past the filter paid 443ms of layout
   * on a desktop — several times that on the phone an admin actually carries.
   *
   * So the window is on the drawing, not on the data. Filtering still reads
   * all 2,000; the count below still says how many matched; only the rows
   * you have not scrolled to yet are missing, and one button brings them.
   */
  const STU_PAGE=50;
  const[stuShow,setStuShow]=useState(STU_PAGE);
  // A new search starts at the top, not 500 rows into the last one.
  useEffect(()=>{setStuShow(STU_PAGE);},[stuQ,stuGrade,stuStatus,stuBranch]);

  const shownTeachers=useMemo(()=>(
    tchBranch ? teachers.filter(t=>t.branch?.id===tchBranch) : teachers
  ),[teachers,tchBranch]);

  const shownParents=useMemo(()=>{
    const q=parQ.trim().toLowerCase();
    if(!q)return parents;
    const has=v=>(v??"").toLowerCase().includes(q);
    return parents.filter(p=>has(p.name)||has(p.email)||has(p.phone)||has(p.code));
  },[parents,parQ]);

  // Staff cards and guardian rows window the same way the roster does: a big
  // school has a few hundred of each, and a teacher card is not a cheap row.
  const TCH_PAGE=24, PAR_PAGE=50;
  const[tchShow,setTchShow]=useState(TCH_PAGE);
  const[parShow,setParShow]=useState(PAR_PAGE);
  useEffect(()=>{setTchShow(TCH_PAGE);},[tchBranch]);
  useEffect(()=>{setParShow(PAR_PAGE);},[parQ]);
  const notices=db.notices.filter(n=>n.instId===user.inst);

  const nav=[
    {id:"dashboard",label:"Dashboard",   icon:"⊞"},
    {id:"students", label:"Students",    icon:"◈",badge:students.length},
    {id:"teachers", label:"Teachers",    icon:"◉",badge:teachers.length},
    {id:"parents",  label:"Parents",     icon:"◎",badge:parents.length},
    {id:"classes",  label:"Classes",     icon:"▤"},
    {id:"timetable",label:"Timetable",   icon:"▦"},
    {id:"attendance",label:"Attendance", icon:"◷"},
    {id:"fees",     label:"Fees",        icon:"◑"},
    {id:"messages", label:"Messages",    icon:"✉",badge:adminMsgs.filter(m=>m.unread).length},
    {id:"notices",  label:"Notices",     icon:"◆"},
    {id:"reports",  label:"Reports",     icon:"▦"},
    {id:"billing",  label:"Billing",     icon:"◈"},
    {id:"settings", label:"Settings",    icon:"⚙"},
  ];

  const[editNotice,setEditNotice]=useState(null);
  /** Which recycle-bin tab is open, or null. */
  const[bin,setBin]=useState(null);
  /** Student id whose result card is open, or null. */
  const[reportCard,setReportCard]=useState(null);
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
        ["Average %","average"],["Attendance %","attendanceRate"],
      ]);
      return `Academic report — ${count(r.roster.length,"student")}, overall average ${r.summary.overallAverage}%.`;
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
      // Paged, not one oversized request: the fee query caps `limit` at 200,
      // so asking for 500 was a 422 every time — the report never once ran.
      const list=await fetchAll(api.fees.list);
      if(!list.length)throw new Error("No invoices have been issued yet.");
      downloadCsv(stamped("fee-collection-report","csv"),list.map(i=>({
        student:i.student.name, roll:i.student.rollNo, grade:`${i.student.grade} ${i.student.section}`,
        period:i.period, amount:i.net??i.amount, status:i.status,
        due:i.dueDate?.slice(0,10)??"", paidOn:i.paidAt?.slice(0,10)??"", method:i.method??"",
      })),[
        ["Student","student"],["Roll No","roll"],["Class","grade"],["Period","period"],
        ["Amount (PKR)","amount"],["Status","status"],["Due","due"],["Paid On","paidOn"],["Method","method"],
      ]);
      return `Fee report — ${count(list.length,"invoice")} across all periods.`;
    });

    /**
     * Who owes what, oldest first.
     *
     * The collection report above lists every invoice; chasing dues needs the
     * opposite shape — one line per family, what they owe in total, how many
     * months it spans and how late the oldest one is. That is the list the
     * office actually works from, and the guardian's number is on it because
     * the next step is always a phone call.
     */
    const defaulters=()=>run("defaulters",async()=>{
      const list=await fetchAll(api.fees.list);
      const unpaid=list.filter(i=>i.status!=="PAID"&&i.status!=="WAIVED");
      if(!unpaid.length)throw new Error("Nothing outstanding — every invoice is settled.");

      // The fee payload carries no guardian, so pair each student with the
      // parent record the portal already holds rather than shipping a column
      // of dashes.
      const guardianOf=new Map(
        students.map(st=>[st.id, parents.find(p=>p.id===st.parentId)??null])
      );

      const today=new Date();
      const byStudent=new Map();
      for(const i of unpaid){
        const key=i.student?.id??i.studentId;
        if(!key)continue;
        const due=Number(i.net??i.amount??0)+Number(i.lateFee??0)-Number(i.discount??0)-Number(i.paidAmount??0);
        const overdueDays=i.dueDate?Math.max(0,Math.floor((today-new Date(i.dueDate))/86400000)):0;
        const row=byStudent.get(key)??{
          student:i.student?.name??"—", roll:i.student?.rollNo??"—",
          grade:`${i.student?.grade??""} ${i.student?.section??""}`.trim(),
          guardian:guardianOf.get(key)?.name??"—", guardianPhone:guardianOf.get(key)?.phone??"—",
          outstanding:0, invoices:0, oldestPeriod:i.period, daysOverdue:0,
        };
        row.outstanding+=due;
        row.invoices+=1;
        if(i.period<row.oldestPeriod)row.oldestPeriod=i.period;
        if(overdueDays>row.daysOverdue)row.daysOverdue=overdueDays;
        byStudent.set(key,row);
      }

      const rows=[...byStudent.values()]
        .map(r=>({...r,outstanding:Math.round(r.outstanding)}))
        .sort((a,b)=>b.daysOverdue-a.daysOverdue||b.outstanding-a.outstanding);

      downloadCsv(stamped("fee-defaulters","csv"),rows,[
        ["Student","student"],["Roll No","roll"],["Class","grade"],
        ["Guardian","guardian"],["Guardian Phone","guardianPhone"],
        ["Outstanding (PKR)","outstanding"],["Unpaid Invoices","invoices"],
        ["Oldest Period","oldestPeriod"],["Days Overdue","daysOverdue"],
      ]);

      const total=rows.reduce((a,r)=>a+r.outstanding,0);
      return `${count(rows.length,"family","families")} ${rows.length===1?"owes":"owe"} Rs. ${total.toLocaleString("en-PK")} across ${count(unpaid.length,"unpaid invoice")}.`;
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
      return `${count(rows.length,"student")} flagged as needing attention.`;
    });

    const teacherPerf=()=>run("teachers",async()=>{
      const r=await api.reports.institute();
      if(!r.subjectPerformance.length)throw new Error("No subjects have been set up yet.");
      downloadCsv(stamped("teacher-performance","csv"),r.subjectPerformance,[
        ["Subject","name"],["Grade","grade"],["Teacher","teacher"],
        ["Students","students"],["Class Average %","average"],
      ]);
      return `Subject performance for ${count(r.subjectPerformance.length,"subject")}.`;
    });

    const custom=()=>run("custom",async()=>{
      const r=await api.reports.institute();
      downloadJson(stamped("institute-report","json"),r);
      return "Full institute dataset exported as JSON.";
    });

    const CARDS=[
      ["◈","Academic Report","Every student's subject average and attendance in one sheet.",T.purple,"academic",academic],
      ["◷","Attendance Report","Attendance rate per student, sorted lowest first so absentees surface.",T.blue,"attendance",attendance],
      ["◑","Fee Collection Report","Every invoice with status, due date, payment date and method.",T.success,"fees",feeReport],
      ["⚠","Fee Defaulters","Who owes what, worst first — with the guardian's number to call.",T.danger,"defaulters",defaulters],
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
    const[nonce,setNonce]=useState(0);
    const[genOpen,setGenOpen]=useState(false);
    // The invoice whose payment is being recorded.
    const[paying,setPaying]=useState(null);
    // The challan/receipt being printed.
    const[slip,setSlip]=useState(null);
    // Which challan has its breakdown open. One at a time; the table stays a table.
    const[openRow,setOpenRow]=useState(null);

    /**
     * The same render window the roster uses, for the same reason.
     *
     * A month of invoices is one per student, so a 2,000-child school draws a
     * 2,000-row table here every time it opens Fees — and unlike the roster
     * this one carries two buttons per row.
     */
    const FEE_PAGE=50;
    const[feeShow,setFeeShow]=useState(FEE_PAGE);
    useEffect(()=>{setFeeShow(FEE_PAGE);},[period,statusFilter]);
    const refresh=()=>setNonce(n=>n+1);

    useEffect(()=>{
      let cancelled=false;
      setLoading(true);setErr("");
      Promise.all([
        api.fees.stats(),
        fetchAll(api.fees.list,{period,...(statusFilter&&{status:statusFilter})}),
      ])
        .then(([s,list])=>{if(!cancelled){setStats(s);setInvoices(list);}})
        .catch(e=>{if(!cancelled)setErr(e.message);})
        .finally(()=>{if(!cancelled)setLoading(false);});
      return()=>{cancelled=true;};
    },[period,statusFilter,nonce]);

    /**
     * Every action here ends in `onReload()`, which swaps `db` and remounts
     * this tab — so a message kept in local state was wiped the instant it was
     * set. Nothing on this screen has ever confirmed itself: not a recorded
     * payment, not a billing run, not a failed one. Outcomes go to the portal's
     * own feedback line, which survives the remount; the load error below stays
     * local, because that path never reloads.
     */
    const run=async(label,fn)=>{
      setBusy(label);setPErr("");setPNote("");
      try{
        const msg=await fn();
        if(msg)setPNote(msg);
        refresh();
        onReload?.();
      }catch(e){
        setPErr(e.errors?.[0]?.message||e.message||"Action failed.");
      }finally{
        setBusy("");
      }
    };

    const paid=(msg)=>{
      setPaying(null);setPErr("");setPNote(msg);
      refresh();onReload?.();
    };

    /**
     * The billing run now goes through a dialog so the month's heads can be
     * set. It used to fire on the click with nothing but a period, which meant
     * the standing monthly fee was the only amount a school could ever bill.
     */
    const generated=(msg)=>{
      setGenOpen(false);setPErr("");setPNote(msg);
      refresh();onReload?.();
    };

    const overdue=()=>run("overdue",async()=>{
      const r=await api.fees.markOverdue();
      return `${count(r.updated,"invoice")} marked overdue.`;
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
      return `Reminder sent to ${count(r.sent,"guardian")} covering ${count(r.invoices,"invoice")}` +
        (r.skipped?.length ? ` · ${count(r.skipped.length,"student")} skipped (no guardian linked)` : "") + ".";
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
        <div className="ec-pair" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
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
              <table style={{width:"100%",borderCollapse:"collapse",...scrollTable}}>
                <thead style={scrollRows}><tr>{["Student","Grade","Amount","Due","Paid On","Status","Action"].map((h,i,arr)=><th key={h} style={{...(i===arr.length-1?stickyHead:null),textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                <tbody style={scrollRows}>{invoices.slice(0,feeShow).map(f=>{
                  const st=f.status.toLowerCase();
                  const c=st==="paid"?T.success:st==="overdue"?T.danger:T.warning;
                  const heads=f.items??[];
                  const shown=openRow===f.id;
                  return(
                    <Fragment key={f.id}>
                    <tr style={{borderBottom:shown?"none":`1px solid ${T.border}`}}>
                      <td style={{padding:"12px",fontSize:13,fontWeight:600,color:T.ink}}>{f.student.name}</td>
                      <td style={{padding:"12px",fontSize:13,color:T.muted}}>{f.student.grade} {f.student.section}</td>
                      <td style={{padding:"12px",fontSize:13}}>
                        {/* Only itemised challans expand — a flat one has nothing
                            underneath, so it stays plain text rather than a
                            control that opens an empty box. */}
                        {heads.length?(
                          <span {...pressable(()=>setOpenRow(shown?null:f.id),
                            `${shown?"Hide":"Show"} fee breakdown for ${f.student.name}`)}
                            style={{cursor:"pointer",color:T.forest,fontWeight:600,display:"inline-flex",alignItems:"center",gap:5}}>
                            {PKR(f.net??f.amount)}
                            <span style={{fontSize:10,opacity:.8}}>{shown?"▲":"▼"}</span>
                          </span>
                        ):PKR(f.net??f.amount)}
                        {f.paidAmount>0&&st!=="paid"&&(
                          <div style={{fontSize:11,color:T.warning,fontWeight:600,marginTop:2}}>
                            {PKR(f.balance??((f.net??f.amount)-f.paidAmount))} due · {PKR(f.paidAmount)} received
                          </div>
                        )}
                      </td>
                      <td style={{padding:"12px",fontSize:13,color:T.muted}}>{f.dueDate?new Date(f.dueDate).getUTCDate():"—"}</td>
                      <td style={{padding:"12px",fontSize:13,color:T.muted}}>{f.paidAt?new Date(f.paidAt).toLocaleDateString(undefined,{month:"short",day:"numeric"}):"—"}</td>
                      <td style={{padding:"12px"}}><Bdg label={st==="paid"?"✓ Paid":st==="overdue"?"⚠ Overdue":"⏳ Pending"} color={c} bg={`${c}15`}/></td>
                      <td style={{padding:"12px",whiteSpace:"nowrap",...stickyCol}}>
                        {st!=="paid"&&st!=="waived"&&
                          <Btn onClick={()=>setPaying(f)} style={{padding:"5px 12px",fontSize:11,marginRight:6}}>
                            {f.paidAmount>0?"Add Payment":"Record Payment"}
                          </Btn>}
                        <Btn out color={T.blue} onClick={()=>setSlip(f.id)} style={{padding:"5px 12px",fontSize:11}}>
                          {st==="paid"?"Receipt":"Challan"}
                        </Btn>
                      </td>
                    </tr>
                    {shown&&(
                      <tr style={{borderBottom:`1px solid ${T.border}`}}>
                        <td colSpan={7} style={{padding:"0 12px 14px"}}>
                          <FeeBreakdown items={heads} total={f.amount} compact/>
                          {(f.discount>0||f.lateFee>0)&&(
                            <div style={{fontSize:12,color:T.muted,marginTop:8}}>
                              {f.discount>0&&<>Discount −{PKR(f.discount)}&nbsp;&nbsp;</>}
                              {f.lateFee>0&&<>Late fee +{PKR(f.lateFee)}&nbsp;&nbsp;</>}
                              Payable <b style={{color:T.ink}}>{PKR(f.net??f.amount)}</b>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}</tbody>
              </table>
            )}
            <ShowMore shown={feeShow} total={invoices.length} page={FEE_PAGE}
              onMore={()=>setFeeShow(n=>n+FEE_PAGE)} onAll={()=>setFeeShow(invoices.length)}/>
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
              <Btn out color={T.forest} full onClick={()=>setGenOpen(true)} style={{marginBottom:8,padding:"9px",fontSize:12}}>Generate Invoices</Btn>
              <Btn out color={T.warning} full onClick={overdue} disabled={busy==="overdue"} style={{marginBottom:8,padding:"9px",fontSize:12}}>{busy==="overdue"?"Updating…":"Flag Overdue"}</Btn>
              <Btn out color={T.purple} full onClick={remind} disabled={busy==="remind"} style={{marginBottom:8,padding:"9px",fontSize:12}}>{busy==="remind"?"Sending…":"Send Fee Reminders"}</Btn>
              <Btn out color={T.blue} full onClick={exportCsv} style={{marginBottom:8,padding:"9px",fontSize:12}}>Download Fee Report</Btn>
            </Crd>

            {/* Loading and export failures only — action outcomes go to the
                portal line at the top, which outlives this tab's remount. */}
            {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:12,border:`1px solid ${T.danger}30`}}>{err}</div>}
          </div>
        </div>

        {slip&&<FeeSlipModal invoiceId={slip} onClose={()=>setSlip(null)}/>}

        {paying&&(
          <RecordPaymentModal
            invoice={paying}
            onClose={()=>setPaying(null)}
            onDone={paid}/>
        )}

        {genOpen&&(
          <GenerateInvoicesModal
            period={period}
            label={(stats?.monthly??[]).find(m=>m.period===period)?.label}
            defaultFee={inst.defaultMonthlyFee??0}
            onClose={()=>setGenOpen(false)}
            onDone={generated}/>
        )}
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
    const[date,setDate]=useState(todayISO());
    const ATT_PAGE=25;
    const[attShow,setAttShow]=useState(ATT_PAGE);

    /**
     * Who is actually missing school, worst first.
     *
     * A child admitted this week has no attendance to summarise, and their
     * empty record read as 0% — which put every new arrival at the top of a
     * list whose whole job is to surface absentees, above the children who
     * are genuinely not turning up. They are left out rather than shown as
     * zero, for the same reason the roster prints "—" for them.
     */
    const summaryRows=useMemo(
      ()=>students.filter(s=>s.att.days>0).sort((a,b)=>a.att.present-b.att.present),
      [students]
    );
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
      /**
       * `setSaved("")` used to stand here, left behind when the success message
       * moved to the portal banner. There is no `saved` state in this component,
       * so this threw a ReferenceError on the handler's first line: the try block
       * was never entered, no register was ever submitted, and the button sat on
       * "Saving…" for ever because `finally` never ran either. The admin register
       * did not save attendance at all.
       */
      setSaving(true);setErr("");
      try{
        const res=await api.attendance.markBulk(
          date,
          Object.entries(marks).map(([studentId,status])=>({studentId,status}))
        );
        // Reported at portal level: onReload swaps `db`, which remounts this
        // component and would discard a local success message immediately.
        setPErr("");setPNote(res.__message??`Attendance saved for ${count(res.marked,"student")} on ${date}.`);
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
              <div className="ec-pickers" style={{display:"flex",gap:12,alignItems:"flex-end"}}>
                <div style={{minWidth:180}}>
                  <Sel label="Class" options={classes.map(c=>({v:`${c.grade}|${c.section}`,l:`${c.grade} — Section ${c.section}`}))} value={cls} onChange={e=>setCls(e.target.value)}/>
                </div>
                <div style={{minWidth:150}}>
                  <Inp label="Date" type="date" max={todayISO()} value={date} onChange={e=>setDate(e.target.value)}/>
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
              {/*
                Worst attendance first, and only as many as fit.
                This drew a bar for every student on the roll — two thousand of
                them on a school that size — in whatever order the roster came
                back in, which put the children who need chasing wherever they
                happened to fall. The report of the same name sorts lowest
                first for exactly this reason.
              */}
              <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Monthly Summary</div>
              {!summaryRows.length&&<div style={{fontSize:12,color:T.muted}}>{students.length?"No attendance recorded yet.":"No students yet."}</div>}
              {summaryRows.slice(0,attShow).map(s=>(
                <div key={s.id} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:T.muted}}>{s.name}</span><span style={{fontSize:12,fontWeight:700,color:s.att.present>=90?T.success:T.warning}}>{s.att.present}%</span></div>
                  <Bar val={s.att.present} color={s.att.present>=90?T.success:T.warning}/>
                </div>
              ))}
              <ShowMore shown={Math.min(attShow,summaryRows.length)} total={summaryRows.length} page={ATT_PAGE}
                onMore={()=>setAttShow(n=>n+ATT_PAGE)} onAll={()=>setAttShow(summaryRows.length)}/>
            </Crd>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Billing.
   *
   * Reads GET /billing/status, which is derived entirely from webhook-verified
   * state on the server. Nothing on this page infers payment from the URL the
   * browser was returned to — see `billingReturn` in the App root for why that
   * distinction matters.
   */
  const BillingTab=()=>{
    const[state,setState]=useState(null);
    const[loading,setLoading]=useState(true);
    const[busy,setBusy]=useState("");
    const[e2,setE2]=useState("");
    const[nonce,setNonce]=useState(0);

    useEffect(()=>{
      let cancelled=false;
      setLoading(true);setE2("");
      api.billing.status()
        .then(r=>{if(!cancelled)setState(r);})
        .catch(x=>{if(!cancelled)setE2(x.message||"Couldn't load your billing details.");})
        .finally(()=>{if(!cancelled)setLoading(false);});
      return()=>{cancelled=true;};
    },[nonce]);

    const subscribe=async(planId)=>{
      setBusy("checkout");setE2("");
      try{
        const r=await api.billing.checkout(planId);
        // The gateway's own hosted page. Card details are entered there and
        // never touch this application.
        window.location.assign(r.url);
      }catch(x){
        setE2(x.errors?.[0]?.message||x.message||"Couldn't start checkout.");
        setBusy("");
      }
    };

    const cancel=async()=>{
      if(!window.confirm("Stop your subscription renewing?\n\nYou keep full access until the end of the period you've already paid for, and nothing is deleted."))return;
      setBusy("cancel");setE2("");
      try{
        await api.billing.cancel();
        setNonce(n=>n+1);
        setPNote("Your subscription will not renew.");
      }catch(x){
        setE2(x.message||"Couldn't cancel the subscription.");
      }finally{
        setBusy("");
      }
    };

    const daysLeft=(iso)=>{
      if(!iso)return null;
      const ms=new Date(iso).getTime()-Date.now();
      return ms<=0?0:Math.ceil(ms/86400000);
    };

    const STATUS_LOOK={
      ACTIVE:{label:"Active",color:T.success,note:"Your subscription is paid and up to date."},
      TRIALING:{label:"Trial",color:T.blue,note:"You're on a free trial."},
      PAST_DUE:{label:"Payment failed",color:T.danger,note:"We couldn't take the last payment. Access continues until the end of the period you've paid for."},
      CANCELED:{label:"Cancelled",color:T.muted,note:"This subscription won't renew."},
      UNPAID:{label:"Not subscribed",color:T.muted,note:"No online subscription is active for this institute."},
    };

    if(loading) return(
      <div style={{animation:"fadeUp .35s"}}>
        <SecHead pre="Account" title="Billing"/>
        <Crd style={{padding:"26px",fontSize:13,color:T.muted}}>Loading your billing details…</Crd>
      </div>
    );

    if(e2&&!state) return(
      <div style={{animation:"fadeUp .35s"}}>
        <SecHead pre="Account" title="Billing"/>
        <Crd style={{padding:"26px"}}>
          <div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"11px 15px",fontSize:13,border:`1px solid ${T.danger}30`}}>{e2}</div>
        </Crd>
      </div>
    );

    const look=STATUS_LOOK[state?.paymentStatus]??STATUS_LOOK.UNPAID;
    const trialDays=daysLeft(state?.trialEndsAt);
    const paidDays=daysLeft(state?.currentPeriodEnd);

    return(
      <div style={{animation:"fadeUp .35s"}}>
        <SecHead pre="Account" title="Billing"/>

        <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:18}}>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* Current plan */}
            <Crd style={{padding:"26px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>Current plan</div>
                  <div style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:800,color:T.forest}}>{state?.plan?.name??"—"}</div>
                  <div style={{fontSize:13,color:T.muted,marginTop:4}}>
                    Rs. {(state?.plan?.price??0).toLocaleString()}/month · up to {state?.studentLimit>=9999?"unlimited":(state?.studentLimit??0).toLocaleString()} students
                  </div>
                </div>
                <Bdg label={look.label} color={look.color} bg={`${look.color}18`}/>
              </div>
              <div style={{fontSize:12.5,color:T.muted,marginTop:14,lineHeight:1.7}}>{look.note}</div>
            </Crd>

            {/* Trial */}
            {state?.trialEndsAt&&(
              <Crd style={{padding:"22px",border:`1.5px solid ${trialDays<=3?T.warning:T.blue}44`}}>
                <div style={{fontSize:11,fontWeight:700,color:trialDays<=3?T.warning:T.blue,textTransform:"uppercase",letterSpacing:".6px",marginBottom:8}}>Free trial</div>
                <div style={{fontFamily:"Georgia,serif",fontSize:22,fontWeight:800,color:T.ink}}>
                  {trialDays===0?"Ended":`${trialDays} day${trialDays===1?"":"s"} left`}
                </div>
                <div style={{fontSize:12.5,color:T.muted,marginTop:6,lineHeight:1.7}}>
                  Your trial {trialDays===0?"ended":"ends"} on {new Date(state.trialEndsAt).toDateString()}.
                  {trialDays===0?" Subscribe to restore access.":" Subscribe any time before then to continue without interruption."}
                </div>
              </Crd>
            )}

            {/* Billing period */}
            <Crd style={{padding:"22px"}}>
              <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Billing period</div>
              {[
                ["Payment status",look.label],
                ["Paid through",state?.currentPeriodEnd?new Date(state.currentPeriodEnd).toDateString():"—"],
                ["Days remaining",paidDays==null?"—":`${paidDays}`],
                ["Renews",state?.cancelAtPeriodEnd?"No — cancellation scheduled":state?.currentPeriodEnd?"Yes, automatically":"—"],
              ].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
                  <span style={{fontSize:12.5,color:T.muted}}>{l}</span>
                  <span style={{fontSize:12.5,fontWeight:700,color:T.ink}}>{v}</span>
                </div>
              ))}
            </Crd>
          </div>

          {/* Actions */}
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {state?.online?(
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:6}}>Manage subscription</div>
                <div style={{fontSize:12,color:T.muted,marginBottom:14,lineHeight:1.7}}>
                  You'll be taken to our payment provider's secure page. Card details are entered there and never reach EduConnect.
                </div>
                {(db.plans??PLANS).map(p=>(
                  <Btn key={p.id} onClick={()=>subscribe(p.id)} disabled={Boolean(busy)}
                    out={p.id!==state?.plan?.id} color={p.id===state?.plan?.id?T.forest:T.blue}
                    full style={{marginBottom:8,padding:"10px",fontSize:12.5}}>
                    {busy==="checkout"?"Opening…":p.id===state?.plan?.id?`Renew ${p.name}`:`Switch to ${p.name}`}
                  </Btn>
                ))}
                {state?.currentPeriodEnd&&!state?.cancelAtPeriodEnd&&(
                  <Btn onClick={cancel} out color={T.danger} full disabled={busy==="cancel"} style={{marginTop:6,padding:"10px",fontSize:12.5}}>
                    {busy==="cancel"?"Cancelling…":"Cancel subscription"}
                  </Btn>
                )}
              </Crd>
            ):(
              /* Manual / bank transfer — PAYMENT_PROVIDER=manual */
              <Crd style={{padding:"22px",border:`1.5px solid ${T.forest}30`}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:8}}>How to pay</div>
                <div style={{fontSize:12.5,color:T.muted,lineHeight:1.8}}>
                  Online card payment isn't enabled yet. Subscriptions are settled by <b style={{color:T.ink}}>bank transfer</b>,
                  and the EduConnect team records each payment against your account.
                </div>
                <div style={{background:T.paper,borderRadius:12,padding:"14px 16px",marginTop:14,border:`1px solid ${T.border}`,fontSize:12.5,color:T.muted,lineHeight:1.9}}>
                  <div><b style={{color:T.ink}}>Amount</b> · Rs. {(state?.plan?.price??0).toLocaleString()} per month</div>
                  <div><b style={{color:T.ink}}>Reference</b> · your institute name</div>
                  <div style={{marginTop:8}}>Send your remittance advice to the EduConnect team and your account is updated once the transfer clears.</div>
                </div>
              </Crd>
            )}

            {e2&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:12.5,border:`1px solid ${T.danger}30`}}>{e2}</div>}
          </div>
        </div>
      </div>
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

  /**
   * Small ✎ / ✕ pair for table rows. Stops the click reaching the row.
   *
   * `name` labels them, because a screen reader reading two rows of ✎ and ✕
   * cannot tell whose they are — and one of them deletes.
   */
  const RowActions=({onEdit,onDelete,busy,name})=>(
    <div style={{display:"flex",gap:6}} onClick={e=>e.stopPropagation()}>
      <span {...pressable(onEdit,name?`Edit ${name}`:"Edit")} title="Edit"
        style={{width:26,height:26,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:12,color:T.blue,background:`${T.blue}12`,border:`1px solid ${T.blue}25`}}>✎</span>
      <span {...pressable(onDelete,name?`Remove ${name}`:"Remove",{disabled:Boolean(busy)})} title="Delete"
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
    if(!window.confirm(`Send ${record.name} a password reset link?\n\nThey are signed out everywhere immediately, and choose a new password themselves via the emailed link.`))return;

    setResetting(record.userId);setRowErr("");setRowNote("");
    try{
      const r=await api.users.resetPassword(record.userId);
      setRowNote(r.emailed
        ? `Reset link sent to ${r.email}. ${record.name} is signed out everywhere; the link expires in ${r.expiresMinutes} minutes.`
        : `${record.name} is signed out everywhere. No mail server is configured, so the reset link is in the server log.`);
    }catch(e){
      setRowErr(e.message||"Could not reset the password.");
    }finally{
      setResetting("");
    }
  };

  const API_FOR={Student:api.students,Teacher:api.teachers,Parent:api.parents};

  const removeRow=async(type,record)=>{
    /**
     * The old wording was wrong twice over: it called a soft delete permanent,
     * and it claimed a student's marks, attendance and fees went with them.
     * Neither is true — the row keeps every relation and only gains a
     * `deletedAt`, which is exactly why the recycle bin can put it back.
     */
    const extra=type==="Parent"
      ? "\n\nTheir children stay enrolled but lose the guardian link until you restore them."
      : type==="Teacher"
        ? "\n\nTheir subjects stay, but become unassigned until you restore them."
        : "\n\nTheir marks, attendance and fee records are kept.";
    if(!window.confirm(`Remove ${record.name}?${extra}\n\nThey disappear from the list, and you can put them back from the Recycle Bin.`))return;

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
      parentId:record.parentId??"",
      branchId:record.branch?.id??"",
    });
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    const[saving,setSaving]=useState(false);
    const[err,setErr]=useState("");

    /**
     * The two things this form could not change, and both of them move.
     *
     * A teacher takes a different subject next year, and a school that could
     * not say so had to delete the teacher and make them again — losing the
     * login, the code and everything filed under it. A family enrols a second
     * child, and the guardian who was created with one had no way to gain the
     * others. Both are ordinary school-office work; the API accepted both all
     * along.
     */
    const schoolSubjects=useSubjects();
    const[subjectIds,setSubjectIds]=useState(()=>(record.subjects??[]).map(x=>x.id).filter(Boolean));
    const[childIds,setChildIds]=useState(()=>record.studentIds??[]);

    const save=async()=>{
      setSaving(true);setErr("");
      try{
        const payload=type==="Student"
          ? {name:f.name,grade:f.grade,section:f.section,rollNo:f.roll,phone:f.phone||null,
             // null unlinks; the child stays enrolled either way.
             parentId:f.parentId||null,
             // Same for the campus: blank means this school does not sort by
             // building, or this child has not been placed in one yet.
             branchId:f.branchId||null}
          : type==="Teacher"
            ? {name:f.name,email:f.email,phone:f.phone||null,subjectIds,branchId:f.branchId||null}
            : {name:f.name,email:f.email,phone:f.phone||null,...(f.rel&&{relation:f.rel}),
               studentIds:childIds};
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
            <div style={{gridColumn:"1/-1"}}>
              <Sel label="Parent / Guardian" value={f.parentId} onChange={e=>s("parentId",e.target.value)}
                options={[{v:"",l:"— none —"},...parents.map(p=>({v:p.id,l:guardianLabel(p)}))]}/>
            </div>
            {branches.length>0&&(
              <div style={{gridColumn:"1/-1"}}>
                <Sel label="Campus" value={f.branchId} onChange={e=>s("branchId",e.target.value)}
                  options={[{v:"",l:"— not placed —"},...branches.map(b=>({v:b.id,l:b.name}))]}/>
              </div>
            )}
          </>}
          {type==="Teacher"&&branches.length>0&&<div style={{gridColumn:"1/-1"}}>
            <Sel label="Campus" value={f.branchId} onChange={e=>s("branchId",e.target.value)}
              options={[{v:"",l:"— not placed —"},...branches.map(b=>({v:b.id,l:b.name}))]}/>
          </div>}
          {type==="Teacher"&&<div style={{gridColumn:"1/-1"}}>
            <PickList label="Subjects Taught" value={subjectIds} onChange={setSubjectIds}
              options={schoolSubjects.map(x=>({v:x.id,l:subjectLabel(x)}))}
              empty="This school has no subjects yet."
              note="Unticking one leaves it unassigned, not deleted."/>
          </div>}
          {type==="Parent"&&<>
            <Sel label="Relation" options={["Mother","Father","Guardian"]} value={f.rel} onChange={e=>s("rel",e.target.value)} style={{gridColumn:"1/-1"}}/>
            <div style={{gridColumn:"1/-1"}}>
              <PickList label="Children" value={childIds} onChange={setChildIds}
                options={students.map(st=>({v:st.id,l:st.name,sub:childLabel(st)}))}
                empty="No students on the roll yet."
                note="Unticking a child leaves them enrolled, without a guardian."/>
            </div>
          </>}
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
  /**
   * The end-of-session rollover.
   *
   * Once a year, in March or April, a school promotes each class into the next
   * one, retains the students repeating the year, and graduates the top class
   * out. It is done class by class over several days, which is why moving the
   * school's session is a separate button from moving the students — a school
   * closes the session only once every class has been dealt with.
   *
   * Nothing commits without a preview. This moves a whole class at once, so the
   * screen shows exactly who goes where, from the server's own dry run, before
   * anything is written.
   */
  const SessionRolloverCard=()=>{
    const[info,setInfo]=useState(null);
    const[err,setErr]=useState("");
    const[note,setNote]=useState("");
    const[busy,setBusy]=useState("");
    const[preview,setPreview]=useState(null);
    const[nonce,setNonce]=useState(0);
    // The current session's own dates. A school that cannot say when its year
    // runs cannot be given a correct result card — April to March is only the
    // default, not the rule.
    const[dates,setDates]=useState({startsOn:"",endsOn:""});
    const[editDates,setEditDates]=useState(false);
    const iso=(d)=>d?new Date(d).toISOString().slice(0,10):"";
    const sessionDay=(d)=>d?new Date(d).toLocaleDateString(undefined,{timeZone:"UTC",day:"numeric",month:"short",year:"numeric"}):"";
    const[f,setF]=useState({
      fromGrade:"",fromSection:"",toGrade:"",toSection:"",
      toSession:"",outcome:"PROMOTED",notes:"",
    });
    const s=(k,v)=>setF(x=>({...x,[k]:v}));

    useEffect(()=>{
      let cancelled=false;
      api.institutes.session()
        .then(r=>{
          if(cancelled)return;
          setInfo(r);
          // The server works out what follows the current session — the same
          // helper that dates it — so the two can never disagree about what
          // comes after 2099-00.
          setF(x=>x.toSession?x:{...x,toSession:r.suggestedNext??""});
          setDates({startsOn:iso(r.current?.startsOn),endsOn:iso(r.current?.endsOn)});
        })
        .catch(e=>{if(!cancelled)setErr(e.message||"Could not read the session.");});
      return()=>{cancelled=true;};
    },[nonce]);

    const classes=info?.classes??[];
    const graduating=f.outcome==="GRADUATED";
    const ready=f.fromGrade&&f.fromSection&&f.toSession&&(graduating||(f.toGrade&&f.toSection));

    const run=async(dryRun)=>{
      setBusy(dryRun?"preview":"commit");setErr("");setNote("");
      try{
        const r=await api.students.promote({
          fromGrade:f.fromGrade,fromSection:f.fromSection,
          ...(graduating?{}:{toGrade:f.toGrade,toSection:f.toSection}),
          toSession:f.toSession,outcome:f.outcome,
          ...(f.notes.trim()&&{notes:f.notes.trim()}),
          dryRun,
        });
        if(dryRun){setPreview(r);}
        else{
          setPreview(null);
          setNote(`${count(r.students,"student")} moved.`);
          setNonce(n=>n+1);
          onReload?.();
        }
      }catch(e){
        setErr(e.errors?.[0]?.message||e.message||"That didn't work.");
      }finally{
        setBusy("");
      }
    };

    const closeSession=async()=>{
      if(!window.confirm(
        `Move ${inst.name} into ${f.toSession}?\n\n`+
        "Do this once every class has been promoted, retained or graduated. "+
        "It changes which session new records belong to; nothing already recorded is altered."
      ))return;
      setBusy("session");setErr("");setNote("");
      try{
        const r=await api.institutes.setSession(f.toSession);
        setNote(`The school is now running ${r.currentSession}.`);
        setNonce(n=>n+1);
        onReload?.();
      }catch(e){
        setErr(e.message||"Could not move the session.");
      }finally{
        setBusy("");
      }
    };

    const saveDates=async()=>{
      setBusy("dates");setErr("");setNote("");
      try{
        const r=await api.institutes.setSessionDates(info.current.id,dates.startsOn,dates.endsOn);
        setNote(r?.__message??`${r.name} dates updated.`);
        setEditDates(false);
        setNonce(n=>n+1);
      }catch(e){
        setErr(e.errors?.[0]?.message||e.message||"Could not change those dates.");
      }finally{
        setBusy("");
      }
    };

    return(
      <Crd style={{padding:"26px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6,gap:10,flexWrap:"wrap"}}>
          <div style={{fontSize:14,fontWeight:700,color:T.ink}}>Session Rollover</div>
          <div style={{fontSize:12,color:T.muted,textAlign:"right"}}>
            Currently running <strong style={{color:T.forest}}>{info?.currentSession??"…"}</strong>
            {info?.current&&(
              <div style={{fontSize:11,marginTop:2}}>
                {/* Rendered in UTC because these are calendar dates pinned at UTC
                    midnight, not instants. Reading them in the viewer’s own zone
                    moves the boundary: a session starting 1 April showed as
                    31 March, which is the one thing a session must not get wrong. */}
                {sessionDay(info.current.startsOn)}
                {" — "}
                {sessionDay(info.current.endsOn)}
                <span {...pressable(()=>setEditDates(v=>!v),"Change the session dates")}
                  style={{cursor:"pointer",color:T.forest,fontWeight:600,marginLeft:8}}>
                  {editDates?"cancel":"change"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Attendance, fee periods and marks all have to answer to a year, and
            they can only do that against real dates. April to March is what a
            Pakistani school gets; a Karachi or Cambridge-track school running
            August to July sets its own here. */}
        {editDates&&info?.current&&(
          <div style={{background:T.paper,borderRadius:12,padding:"14px 16px",border:`1px solid ${T.border}`,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:".6px"}}>
              When {info.current.name} runs
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Inp label="Starts on" type="date" value={dates.startsOn}
                onChange={e=>setDates(d=>({...d,startsOn:e.target.value}))} style={{marginBottom:0}}/>
              <Inp label="Ends on" type="date" value={dates.endsOn}
                onChange={e=>setDates(d=>({...d,endsOn:e.target.value}))} style={{marginBottom:0}}/>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:12}}>
              <Btn onClick={saveDates} disabled={busy==="dates"||!dates.startsOn||!dates.endsOn}
                style={{padding:"7px 16px",fontSize:12}}>
                {busy==="dates"?"Saving…":"Save dates"}
              </Btn>
            </div>
          </div>
        )}
        <div style={{fontSize:12,color:T.muted,lineHeight:1.7,marginBottom:16}}>
          Promote a class into the next one. Marks, attendance and fees stay with the student —
          only the class changes, and every move is recorded so you can see where a student came from.
        </div>

        {note&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"10px 14px",fontSize:13,fontWeight:600,marginBottom:12,border:`1px solid ${T.success}30`}}>{note}</div>}
        {err&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{err}</div>}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Sel label="Move class" value={`${f.fromGrade}||${f.fromSection}`}
            options={[{v:"||",l:classes.length?"Choose a class…":"No classes with students"},
              ...classes.map(c=>({v:`${c.grade}||${c.section}`,l:`${c.grade} ${c.section} — ${c.students} student${c.students===1?"":"s"}`}))]}
            onChange={e=>{const[g,sec]=e.target.value.split("||");setF(x=>({...x,fromGrade:g,fromSection:sec}));setPreview(null);}}/>
          <Sel label="Outcome" value={f.outcome}
            options={[{v:"PROMOTED",l:"Promote to next class"},{v:"RETAINED",l:"Retain (repeat the year)"},{v:"GRADUATED",l:"Graduate (leaving school)"}]}
            onChange={e=>{s("outcome",e.target.value);setPreview(null);}}/>
        </div>

        {!graduating&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Inp label="Into class" value={f.toGrade} onChange={e=>{s("toGrade",e.target.value);setPreview(null);}} placeholder="Grade 9"/>
            <Inp label="Into section" value={f.toSection} onChange={e=>{s("toSection",e.target.value);setPreview(null);}} placeholder="A"/>
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Inp label="New session" value={f.toSession} onChange={e=>{s("toSession",e.target.value);setPreview(null);}} placeholder="2027-28"/>
          <Inp label="Note (optional)" value={f.notes} onChange={e=>s("notes",e.target.value)} placeholder="e.g. Attendance below requirement"/>
        </div>

        {f.outcome==="RETAINED"&&(
          <div style={{background:`${T.warning}10`,border:`1px solid ${T.warning}30`,borderRadius:10,padding:"10px 14px",fontSize:12,color:T.ink,lineHeight:1.7,marginBottom:12}}>
            A retained student stays in the same class. Their existing marks stay with them —
            clear them by hand if the year is meant to start fresh.
          </div>
        )}

        {preview&&(
          <div style={{border:`1px solid ${T.border}`,borderRadius:10,marginBottom:12,overflow:"hidden"}}>
            <div style={{background:T.paper,padding:"9px 14px",fontSize:12,fontWeight:700,color:T.ink}}>
              {count(preview.students,"student")} would move · {preview.fromSession} → {preview.toSession}
            </div>
            <div style={{maxHeight:190,overflowY:"auto"}}>
              {preview.moves.map(m=>(
                <div key={m.studentId} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"7px 14px",fontSize:12,borderTop:`1px solid ${T.border}`}}>
                  <span style={{color:T.ink,fontWeight:600}}>{m.name}<span style={{color:T.muted,fontWeight:400,marginLeft:6}}>{m.rollNo}</span></span>
                  <span style={{color:T.muted}}>{m.from} → <strong style={{color:T.forest}}>{m.to??"leaving"}</strong></span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <Btn out color={T.muted} onClick={()=>run(true)} disabled={!ready||Boolean(busy)} style={{flex:1,padding:"10px"}}>
            {busy==="preview"?"Checking…":"Preview"}
          </Btn>
          <Btn onClick={()=>run(false)} disabled={!preview||Boolean(busy)} style={{flex:2,padding:"10px"}}>
            {busy==="commit"?"Moving…":preview?`Move ${count(preview.students,"student")}`:"Preview first"}
          </Btn>
        </div>

        <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
          <div style={{fontSize:12,color:T.muted,lineHeight:1.7,marginBottom:10}}>
            Once every class has been dealt with, close the session.
            {info?.lastRollover&&<> Last rollover: {info.lastRollover.fromSession} → {info.lastRollover.toSession}.</>}
          </div>
          <Btn out color={T.forest} onClick={closeSession}
            disabled={!f.toSession||f.toSession===info?.currentSession||Boolean(busy)} full style={{padding:"10px"}}>
            {busy==="session"?"Moving…":`Start ${f.toSession||"the next session"}`}
          </Btn>
        </div>
      </Crd>
    );
  };

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
  const UserModal=({type})=>{
    const[f,setF]=useState({name:"",email:"",phone:"",grade:"",section:"",roll:"",rel:"",newSubject:"",parentId:"",branchId:""});
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    /**
     * Lists, because both of these are lists.
     *
     * A teacher teaches several subjects and a guardian has several children
     * in the school. Both were single dropdowns here, which is why a father of
     * three needed three separate logins and a teacher of four subjects was
     * recorded as teaching one.
     */
    const[subjectIds,setSubjectIds]=useState([]);
    const[childIds,setChildIds]=useState([]);
    const schoolSubjects=useSubjects();
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
      let made=null;
      try{
        if(type==="Student"){
          await api.students.create({
            name:f.name,
            grade:f.grade||"Grade 1",
            section:f.section||"A",
            rollNo:f.roll||`${new Date().getFullYear()}-${Math.floor(Math.random()*900+100)}`,
            ...(f.phone&&{phone:f.phone}),
            // A sibling joins the guardian the school already has, rather
            // than the family getting a second account for the same father.
            ...(f.parentId&&{parentId:f.parentId}),
            ...(f.branchId&&{branchId:f.branchId}),
          });
        }else if(type==="Teacher"){
          const teaching=[...subjectIds];
          // A school can hire a teacher for a subject it has not recorded yet.
          const fresh=f.newSubject.trim();
          if(fresh&&!schoolSubjects.some(x=>x.name.toLowerCase()===fresh.toLowerCase())){
            const subject=await api.subjects.create({name:fresh});
            teaching.push(subject.id);
          }
          const first=schoolSubjects.find(x=>x.id===teaching[0])?.name??fresh;
          made=await api.teachers.create({
            name:f.name,email:f.email,
            ...(f.phone&&{phone:f.phone}),
            ...(first&&{designation:`${first} Teacher`}),
            createLogin:true,
            ...(teaching.length&&{subjectIds:teaching}),
            ...(f.branchId&&{branchId:f.branchId}),
          });
        }else{
          made=await api.parents.create({
            name:f.name,email:f.email,
            ...(f.phone&&{phone:f.phone}),
            ...(f.rel&&{relation:f.rel}),
            // Every child at once — one guardian and one login, however many
            // children the family has in the school.
            ...(childIds.length&&{studentIds:childIds}),
            createLogin:true,
          });
        }
        setModal(null);
        /**
         * The server generates a temporary password and, when it cannot email
         * it, returns it in the message so the admin can pass it on. That
         * message was being dropped — every teacher and parent login created
         * here had a password nobody was ever told.
         */
        setPErr("");setPNote(made?.__message??`${f.name} added.`);
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
          {/* Students have no email: there is no column for one, and the create
              call never sent it. The field was marked required and the note
              below claimed it was "stored as contact information", so anything
              typed here silently vanished. */}
          {type!=="Student"&&<Inp label="Email*" value={f.email} onChange={e=>s("email",e.target.value)} placeholder="email@example.com" type="email"/>}
          <Inp label="Phone" value={f.phone} onChange={e=>s("phone",e.target.value)} placeholder="03001234567" maxLength={11} style={type==="Student"?{gridColumn:"1/-1"}:undefined}/>
          {type==="Student"&&<>
            <Inp label="Grade*" value={f.grade} onChange={e=>s("grade",e.target.value)} placeholder="Grade 8"/>
            <Inp label="Section" value={f.section} onChange={e=>s("section",e.target.value)} placeholder="A"/>
            <Inp label="Roll No.*" value={f.roll} onChange={e=>s("roll",e.target.value)} placeholder="2024-001" style={{gridColumn:"1/-1"}}/>
            {/* Siblings share a guardian. Leaving this blank is normal — a
                guardian created later can pick the child up then. */}
            <div style={{gridColumn:"1/-1"}}>
              <Sel label="Parent / Guardian" value={f.parentId} onChange={e=>s("parentId",e.target.value)}
                options={[{v:"",l:"— none yet —"},...parents.map(p=>({v:p.id,l:guardianLabel(p)}))]}/>
            </div>
            {/* Editing a child offered a campus and admitting one did not, so a
                three-campus school had to save the new pupil and then reopen
                them to say which building they attend. */}
            {branches.length>0&&(
              <div style={{gridColumn:"1/-1"}}>
                <Sel label="Campus" value={f.branchId} onChange={e=>s("branchId",e.target.value)}
                  options={[{v:"",l:"— not placed —"},...branches.map(b=>({v:b.id,l:b.name}))]}/>
              </div>
            )}
          </>}
          {type==="Teacher"&&branches.length>0&&<div style={{gridColumn:"1/-1"}}>
            <Sel label="Campus" value={f.branchId} onChange={e=>s("branchId",e.target.value)}
              options={[{v:"",l:"— not placed —"},...branches.map(b=>({v:b.id,l:b.name}))]}/>
          </div>}
          {type==="Teacher"&&<div style={{gridColumn:"1/-1"}}>
            <PickList label="Subjects Taught" value={subjectIds} onChange={setSubjectIds}
              options={schoolSubjects.map(x=>({v:x.id,l:subjectLabel(x)}))}
              empty="This school has no subjects yet — name one below."
              note="A teacher can take more than one."/>
            <Inp label="Or add a subject the school does not teach yet" value={f.newSubject}
              onChange={e=>s("newSubject",e.target.value)} placeholder="Islamiat"/>
          </div>}
          {type==="Parent"&&<>
            <Sel label="Relation" options={["Mother","Father","Guardian"]} value={f.rel} onChange={e=>s("rel",e.target.value)} style={{gridColumn:"1/-1"}}/>
            <div style={{gridColumn:"1/-1"}}>
              {/* Several, not one. A family with three children in the school
                  is the commonest family a Pakistani school has on its roll. */}
              <PickList label="Children" value={childIds} onChange={setChildIds}
                options={students.map(st=>({v:st.id,l:st.name,sub:childLabel(st)}))}
                empty="No students on the roll yet."
                note="Tick every child of this family."/>
            </div>
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
              ? <>Students don't sign in to EduConnect. Their academic information is reached through the linked <b>parent/guardian</b> account, which is where contact details live.</>
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
          <div className="ec-pair" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
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
                  <div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:700,color:s.scored?T.forest:T.muted}}>{s.scored?`${s.average}%`:"—"}</div><div style={{fontSize:10,color:T.muted}}>{s.rank?`Rank #${s.rank}`:"Unranked"}</div></div>
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
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.ink}}>{t.name}</div><div style={{fontSize:11,color:T.muted}}>{t.subject} · {count(t.students,"student")}</div></div>
                  <Bdg label={count(t.classes.length,"class","classes")} color={T.purple} bg={`${T.purple}15`}/>
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
                <span {...pressable(()=>setSelStu(null),"Close student details")} style={{cursor:"pointer",color:T.muted,fontSize:22}}>×</span>
              </div>
              <div className="ec-pair" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                {/* Every tile is a real figure from the students endpoint. The
                    fourth used to read a literal "82/100" AI score for every
                    student alike; the list payload carries no insight data, so
                    it now shows the subject average, which it does carry. */}
                {[["Rank",selStu.rank?`#${selStu.rank}`:"—",T.purple],["Attendance",selStu.att.days?`${selStu.att.present}%`:"—",T.success],["Average",selStu.scored?`${selStu.average}%`:"—",T.gold]].map(([l,v,c])=>(
                  <div key={l} style={{padding:"12px",background:T.paper,borderRadius:12,textAlign:"center"}}>
                    <div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:c}}>{v}</div>
                    <div style={{fontSize:10,color:T.muted,marginTop:3}}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:12,fontWeight:700,color:T.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:".5px"}}>Subject Performance</div>
              {selStu.subjects.map((s,i)=>(
                <div key={i} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:T.muted}}>{s.name}</span><span style={{fontSize:12,fontWeight:700,color:s.scored?s.color:T.muted}}>{s.scored?`${s.score}%`:"no marks"}</span></div>
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
          <SecHead pre="Management" title="Students" action={
            <div style={{display:"flex",gap:8,marginBottom:4}}>
              <Btn out color={T.muted} onClick={()=>setBin("students")}>Recycle Bin</Btn>
              <Btn out color={T.muted} onClick={()=>setModal("import")}>Import CSV</Btn>
              <Btn onClick={()=>setModal("Student")}>+ Add Student</Btn>
            </div>
          }/>
          <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap",marginBottom:16}}>
            <Inp label="Search" value={stuQ} onChange={e=>setStuQ(e.target.value)} placeholder="Name, roll no or code" style={{marginBottom:0,flex:"1 1 240px"}}/>
            <Sel label="Grade" options={gradeOptions} value={stuGrade} onChange={e=>setStuGrade(e.target.value)} style={{marginBottom:0,width:160}}/>
            <Sel label="Status" options={statusOptions} value={stuStatus} onChange={e=>setStuStatus(e.target.value)} style={{marginBottom:0,width:160}}/>
            {branches.length>0&&(
              <Sel label="Campus" options={branchOptions} value={stuBranch} onChange={e=>setStuBranch(e.target.value)} style={{marginBottom:0,width:170}}/>
            )}
            {(stuQ||stuGrade||stuStatus||stuBranch)&&(
              <Btn out color={T.muted} onClick={()=>{setStuQ("");setStuGrade("");setStuStatus("");setStuBranch("");}} style={{marginBottom:2}}>Clear</Btn>
            )}
            <div style={{fontSize:12,color:T.muted,paddingBottom:12,marginLeft:"auto"}}>
              {count(shownStudents.length,"student")}{shownStudents.length!==students.length&&` of ${students.length}`}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:selStu?"1fr 370px":"1fr",gap:18}}>
            <Crd style={{padding:"26px"}}>
              <table style={{width:"100%",borderCollapse:"collapse",...scrollTable}}>
                <thead style={scrollRows}><tr>{["Student","Grade","Roll No","Average","Attendance","Fees","Status",""].map((h,i,arr)=><th key={h} style={{...(i===arr.length-1?stickyHead:null),textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                <tbody style={scrollRows}>{shownStudents.slice(0,stuShow).map(s=>(
                  <tr key={s.id} onClick={()=>setSelStu(selStu?.id===s.id?null:s)} style={{borderBottom:`1px solid ${T.border}`,cursor:"pointer",background:selStu?.id===s.id?`${T.forest}07`:"transparent",transition:"background .1s"}}>
                    <td style={{padding:"12px"}}><div style={{display:"flex",gap:10,alignItems:"center"}}><Av name={s.name} size={32} bg={`${T.forest}18`} color={T.forest} fs={11}/><span style={{fontSize:13,fontWeight:600,color:T.ink}}>{s.name}</span></div></td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{s.grade} {s.section}</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{s.roll}</td>
                    <td style={{padding:"12px",fontSize:13,fontWeight:700,color:s.scored?T.forest:T.muted}}>{s.scored?`${s.average}%`:"—"}</td>
                    <td style={{padding:"12px",fontSize:13,color:!s.att.days?T.muted:s.att.present>=90?T.success:T.warning,fontWeight:600}}>{s.att.days?`${s.att.present}%`:"—"}</td>
                    <td style={{padding:"12px"}}><Bdg label={s.dues>0?"Pending":"Paid"} color={s.dues>0?T.warning:T.success} bg={s.dues>0?`${T.warning}15`:`${T.success}15`}/></td>
                    <td style={{padding:"12px"}}><Bdg label={s.status==="active"?"Active":s.status.charAt(0).toUpperCase()+s.status.slice(1)} color={s.status==="active"?T.success:T.muted} bg={s.status==="active"?`${T.success}15`:`${T.muted}15`}/></td>
                    <td style={{padding:"12px",...stickyCol}}><RowActions name={s.name} busy={deleting===s.id} onEdit={()=>setEditing({type:"Student",record:s})} onDelete={()=>removeRow("Student",s)}/></td>
                  </tr>
                ))}</tbody>
              </table>
              <ShowMore shown={stuShow} total={shownStudents.length} page={STU_PAGE}
                onMore={()=>setStuShow(n=>n+STU_PAGE)} onAll={()=>setStuShow(shownStudents.length)}/>
              {!shownStudents.length&&(
                <div style={{padding:"26px 6px",textAlign:"center",fontSize:13,color:T.muted}}>
                  {students.length
                    ?"No students match that search."
                    :"No students yet."}
                </div>
              )}
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
                  {[["Rank",selStu.rank?`#${selStu.rank}`:"—",T.purple],["Att.",selStu.att.days?`${selStu.att.present}%`:"—",T.success],["Avg.",selStu.scored?`${selStu.average}%`:"—",T.gold]].map(([l,v,c])=>(
                    <div key={l} style={{padding:"10px",background:T.paper,borderRadius:10,textAlign:"center"}}>
                      <div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:800,color:c}}>{v}</div>
                      <div style={{fontSize:10,color:T.muted}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:8,textTransform:"uppercase",letterSpacing:".5px"}}>Subjects</div>
                {selStu.subjects.map((s,i)=>(
                  <div key={i} style={{marginBottom:9}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:T.muted}}>{s.name}</span><span style={{fontSize:12,fontWeight:700,color:s.scored?s.color:T.muted}}>{s.scored?`${s.score}%`:"no marks"}</span></div>
                    <Bar val={s.score} color={s.color} delay={i*40}/>
                  </div>
                ))}
                {/* These three were decorative. Students have no login, so the
                    old "Reset PW" had nothing to reset — the guardian's account
                    is the one that exists, and that's what it offers now. */}
                <div style={{display:"flex",gap:8,marginTop:16,flexWrap:"wrap"}}>
                  <Btn out color={T.forest} onClick={()=>setEditing({type:"Student",record:selStu})} style={{flex:1,padding:"8px",fontSize:12}}>Edit</Btn>
                  <Btn out color={T.gold} onClick={()=>setReportCard(selStu.id)} style={{flex:1,padding:"8px",fontSize:12}}>Result Card</Btn>
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
          <SecHead pre="Staff" title="Teachers" action={
            <div style={{display:"flex",gap:8,marginBottom:4}}>
              <Btn out color={T.muted} onClick={()=>setBin("teachers")}>Recycle Bin</Btn>
              <Btn onClick={()=>setModal("Teacher")}>+ Add Teacher</Btn>
            </div>
          }/>
          {branches.length>0&&(
            <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap",marginBottom:16}}>
              <Sel label="Campus" options={branchOptions} value={tchBranch} onChange={e=>setTchBranch(e.target.value)} style={{marginBottom:0,width:180}}/>
              {tchBranch&&(
                <Btn out color={T.muted} onClick={()=>setTchBranch("")} style={{marginBottom:2}}>Clear</Btn>
              )}
              <div style={{fontSize:12,color:T.muted,paddingBottom:12,marginLeft:"auto"}}>
                {count(shownTeachers.length,"teacher")}{shownTeachers.length!==teachers.length&&` of ${teachers.length}`}
              </div>
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
            {shownTeachers.slice(0,tchShow).map(t=>(
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
          <ShowMore shown={tchShow} total={shownTeachers.length} page={TCH_PAGE}
            onMore={()=>setTchShow(n=>n+TCH_PAGE)} onAll={()=>setTchShow(shownTeachers.length)}/>
        </div>
      )}
      {/* PARENTS */}
      {tab==="parents"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Community" title="Parents" action={
            <div style={{display:"flex",gap:8,marginBottom:4}}>
              <Btn out color={T.muted} onClick={()=>setBin("parents")}>Recycle Bin</Btn>
              <Btn onClick={()=>setModal("Parent")}>+ Add Parent</Btn>
            </div>
          }/>
          <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap",marginBottom:16}}>
            <Inp label="Search" value={parQ} onChange={e=>setParQ(e.target.value)} placeholder="Name, email, phone or code" style={{marginBottom:0,flex:"1 1 260px"}}/>
            {parQ&&<Btn out color={T.muted} onClick={()=>setParQ("")} style={{marginBottom:2}}>Clear</Btn>}
            <div style={{fontSize:12,color:T.muted,paddingBottom:12,marginLeft:"auto"}}>
              {count(shownParents.length,"parent")}{shownParents.length!==parents.length&&` of ${parents.length}`}
            </div>
          </div>
          <Crd style={{padding:"26px"}}>
            <table style={{width:"100%",borderCollapse:"collapse",...scrollTable}}>
              <thead style={scrollRows}><tr>{["Parent","Relation","Children","Email","Phone","Actions"].map((h,i,arr)=><th key={h} style={{...(i===arr.length-1?stickyHead:null),textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
              <tbody style={scrollRows}>{shownParents.slice(0,parShow).map(p=>{
                /**
                 * Every child, not the first one.
                 *
                 * This read `students.find(s => s.id === p.studentId)`, which
                 * is one child by construction — so a father of three looked
                 * like a father of one on the screen the office works from,
                 * and nothing on it hinted that the other two existed.
                 */
                const kids=(p.children?.length?p.children:students.filter(st=>p.studentIds?.includes(st.id)))??[];
                return(
                  <tr key={p.id} style={{borderBottom:`1px solid ${T.border}`}}>
                    <td style={{padding:"12px"}}><div style={{display:"flex",gap:10,alignItems:"center"}}><Av name={p.name} size={32} bg={`${T.blue}18`} color={T.blue} fs={11}/><span style={{fontSize:13,fontWeight:600,color:T.ink}}>{p.name}</span></div></td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{p.rel}</td>
                    <td style={{padding:"12px",fontSize:13,fontWeight:600,color:T.ink}}>
                      {kids.length===0?"—":(
                        <div>
                          {kids.map(k=>(
                            <div key={k.id} style={{whiteSpace:"nowrap"}}>
                              {k.name}
                              {childLabel(k)&&<span style={{color:T.muted,fontWeight:500,fontSize:11.5}}>{" · "}{childLabel(k)}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{p.email}</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{p.phone}</td>
                    <td style={{padding:"12px",...stickyCol}}>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <span onClick={()=>setEditing({type:"Parent",record:p})} style={{cursor:"pointer"}}><Bdg label="Edit" color={T.forest} bg={`${T.forest}15`}/></span>
                        {p.userId&&<span onClick={()=>resetPw(p)} style={{cursor:resetting===p.userId?"wait":"pointer"}}><Bdg label={resetting===p.userId?"…":"Reset PW"} color={T.warning} bg={`${T.warning}15`}/></span>}
                        <RowActions name={p.name} busy={deleting===p.id} onEdit={()=>setEditing({type:"Parent",record:p})} onDelete={()=>removeRow("Parent",p)}/>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
            <ShowMore shown={parShow} total={shownParents.length} page={PAR_PAGE}
              onMore={()=>setParShow(n=>n+PAR_PAGE)} onAll={()=>setParShow(shownParents.length)}/>
            {!shownParents.length&&(
              <div style={{padding:"26px 6px",textAlign:"center",fontSize:13,color:T.muted}}>
                {parents.length?"No parents match that search.":"No parents yet."}
              </div>
            )}
          </Crd>
        </div>
      )}
      {/* ATTENDANCE */}
      {/* CLASSES */}
      {tab==="classes"&&(
        <AdminClassesTab teachers={teachers} students={students} onChanged={onReload}/>
      )}
      {/* TIMETABLE */}
      {tab==="timetable"&&(
        <AdminTimetableTab teachers={teachers} onChanged={onReload}/>
      )}
      {tab==="attendance"&&<AdminAttendanceTab/>}
      {/* FEES */}
      {tab==="fees"&&<FeesTab/>}
      {/* MESSAGES */}
      {tab==="messages"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:12,flexWrap:"wrap"}}>
            <SecHead pre="Communication" title="Messages"/>
            {!compose&&<Btn onClick={()=>setCompose(true)} style={{marginBottom:18}}>+ New Message</Btn>}
          </div>
          {sentNote&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"11px 16px",fontSize:13,fontWeight:600,marginBottom:16,border:`1px solid ${T.success}30`}}>{sentNote}</div>}
          {compose&&(
            <MessageComposer
              onClose={()=>setCompose(false)}
              onSent={name=>{
                setCompose(false);
                setSentNote(`Message sent to ${name}.`);
                setTimeout(()=>setSentNote(""),3000);
                onReload?.();
              }}
            />
          )}
          <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:18,height:520}}>
            <Crd style={{overflow:"hidden",display:"flex",flexDirection:"column"}}>
              <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",gap:4}}>
                  {[["inbox","Inbox"],["sent","Sent"]].map(([id,label])=>(
                    <span key={id} onClick={()=>{setBox(id);setSelMsg(null);}}
                      style={{fontSize:12,fontWeight:700,padding:"4px 10px",borderRadius:99,cursor:"pointer",
                        color:box===id?T.forest:T.muted,background:box===id?`${T.forest}12`:"transparent"}}>{label}</span>
                  ))}
                </div>
                <Bdg label={`${adminMsgs.filter(m=>m.unread).length} new`} color={T.clay} bg={`${T.clay}15`}/>
              </div>
              <div style={{flex:1,overflowY:"auto"}}>
                {!adminBoxMsgs.length&&(
                  <div style={{padding:"18px 16px",fontSize:12.5,color:T.muted,lineHeight:1.6}}>
                    {box==="sent"
                      ?"You haven't sent any messages yet. Use “New Message” to write to a teacher or a parent."
                      :"No messages yet. Teachers and parents who write to the office will appear here."}
                  </div>
                )}
                {adminBoxMsgs.map(m=>(
                  <div key={m.id} onClick={()=>openAdminMessage(m)} style={{padding:"13px 16px",cursor:"pointer",borderBottom:`1px solid ${T.border}`,background:selMsg?.id===m.id?`${T.forest}09`:"transparent",borderLeft:`3px solid ${selMsg?.id===m.id?T.forest:"transparent"}`,transition:"background .15s"}}>
                    <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                      <Av name={box==="sent"?m.to:m.from} size={30} bg={T.paper} color={T.forest} fs={10}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between"}}>
                          <span style={{fontSize:12,fontWeight:m.unread?700:500,color:T.ink}}>{box==="sent"?`To ${m.to}`:m.from}</span>
                          <span style={{fontSize:10,color:T.muted}}>{m.time}</span>
                        </div>
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
                    <MessageThread root={selMsg} meId={user.id}/>
                  </div>
                  {replyNote&&<div style={{background:`${T.success}12`,color:T.success,padding:"10px 26px",fontSize:13,fontWeight:600,border:`1px solid ${T.success}30`}}>{replyNote}</div>}
                  <div style={{padding:"16px 26px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10}}>
                    <input value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendAdminReply()} placeholder={`Reply to ${selMsg.from}…`} style={{flex:1,background:T.paper,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"10px 16px",color:T.ink,fontSize:13,outline:"none"}}/>
                    <Btn onClick={sendAdminReply} disabled={!reply.trim()||replyBusy}>{replyBusy?"Sending…":"Send"}</Btn>
                  </div>
                </>
              ):(
                <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:T.border}}>
                  <div style={{fontSize:48,marginBottom:12}}>✉</div>
                  <div style={{fontFamily:"Georgia,serif",fontSize:18,color:T.muted}}>Select a message</div>
                </div>
              )}
            </Crd>
          </div>
        </div>
      )}
      {/* NOTICES */}
      {tab==="notices"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Communication" title="Notices" action={<Btn onClick={()=>setModal("notice")} style={{marginBottom:4}}>+ Post Notice</Btn>}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
            {notices.map(n=>(
              <Crd key={n.id} style={{padding:"24px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                  <Bdg label={t(n.cat)} color={catC(n.cat)} bg={`${catC(n.cat)}15`}/>
                  <span style={{fontSize:12,color:T.muted}}>{n.date}</span>
                </div>
                <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:T.ink,marginBottom:8,lineHeight:1.3}}>{n.title}</div>
                <p style={{fontSize:13,color:T.muted,lineHeight:1.7,marginBottom:14}}>{n.body}</p>
                {/* Pills, but they act as buttons — including the destructive
                    one — so they answer to Tab and Enter like buttons. */}
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span {...pressable(()=>setEditNotice(n),`Edit notice: ${n.title}`)}
                    style={{cursor:"pointer"}}>
                    <Bdg label="Edit" color={T.forest} bg={`${T.forest}15`}/>
                  </span>
                  <span {...pressable(()=>removeNotice(n),`Delete notice: ${n.title}`,{disabled:noticeBusy===n.id})}
                    style={{cursor:noticeBusy===n.id?"default":"pointer",opacity:noticeBusy===n.id?.5:1}}>
                    <Bdg label={noticeBusy===n.id?"Deleting…":"Delete"} color={T.danger} bg={`${T.danger}15`}/>
                  </span>
                </div>
              </Crd>
            ))}
          </div>
          {!notices.length&&(
            <Crd style={{padding:"44px 26px",textAlign:"center"}}>
              <div style={{fontSize:26,color:T.border,marginBottom:10}}>✉</div>
              <div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:700,color:T.ink,marginBottom:6}}>No notices yet</div>
              <div style={{fontSize:13,color:T.muted,lineHeight:1.7,maxWidth:420,margin:"0 auto"}}>
                A notice reaches every parent and teacher in the school at once — a holiday,
                a fee deadline, a parent-teacher meeting. Post one to get started.
              </div>
            </Crd>
          )}
        </div>
      )}
      {/* REPORTS */}
      {tab==="reports"&&<ReportsTab/>}
      {/* BILLING */}
      {tab==="billing"&&<BillingTab/>}
      {/* SETTINGS */}
      {tab==="settings"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Configuration" title="Institute Settings"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
            <InstituteSettingsCard/>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <SessionRolloverCard/>
              <ExamTermsCard onSaved={()=>onReload?.()}/>
              <GradingPolicyCard onSaved={m=>{setPErr("");setPNote(m??"Grading policy saved.");}}/>
              <CampusesCard onChanged={()=>onReload?.()}/>
              <SubscriptionCard/>
              <NotificationSettingsCard/>
            </div>
          </div>
        </div>
      )}
      {modal&&["Student","Teacher","Parent"].includes(modal)&&<UserModal type={modal}/>}
      {reportCard&&<ReportCardModal studentId={reportCard} onClose={()=>setReportCard(null)}/>}
      {bin&&(
        <RecycleBinModal
          initialKind={bin}
          onClose={()=>setBin(null)}
          onRestored={name=>{setPNote(`${name} restored.`);onReload?.();}}
          onPurged={name=>{setPNote(`${name} deleted permanently.`);onReload?.();}}
        />
      )}
      {modal==="import"&&(
        <StudentImportModal
          seatsLeft={isUnlimited?null:Math.max(0,studentLimit-seatsUsed)}
          branches={branches}
          onClose={()=>setModal(null)}
          onImported={res=>{setPNote(`Imported ${count(res.imported,"student")}${res.skipped?`, skipped ${res.skipped}`:""}.`);onReload?.();}}
        />
      )}
      {modal==="notice"&&<NoticeComposer onClose={()=>setModal(null)} onSaved={()=>{setModal(null);onReload?.();}}/>}
      {editNotice&&<NoticeComposer notice={editNotice} onClose={()=>setEditNotice(null)} onSaved={t=>{setEditNotice(null);setPNote(`"${t}" updated.`);onReload?.();}}/>}
      {editing&&<EditModal type={editing.type} record={editing.record}/>}

      {/* Row-action feedback — fixed so it's visible whichever tab you're on. */}
      {(rowErr||rowNote)&&(
        <div style={{position:"fixed",right:22,bottom:22,maxWidth:400,zIndex:60,animation:"fadeUp .25s"}}>
          <div style={{background:rowErr?`${T.danger}f0`:`${T.success}f0`,color:"#fff",borderRadius:12,padding:"13px 16px",fontSize:13,lineHeight:1.6,boxShadow:"0 12px 36px rgba(0,0,0,.24)"}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{flex:1,wordBreak:"break-word"}}>{rowErr||rowNote}</span>
              <span {...pressable(()=>{setRowErr("");setRowNote("");},"Dismiss this message")} style={{cursor:"pointer",opacity:.8,fontSize:16,lineHeight:1}}>×</span>
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
  // What this school calls its terms — both mark-entry pickers read it.
  const sessionTerms=useSessionTerms();
  const[tab,setTab]=useHashTab("dashboard",TEACHER_TABS);
  const[col,setCol]=useState(false);
  const[selMsg,setSelMsg]=useState(null);
  const[reply,setReply]=useState("");
  const[replyBusy,setReplyBusy]=useState(false);
  const[replySent,setReplySent]=useState("");
  // Composing lives at portal level so a reload can't wipe a half-written note.
  const[compose,setCompose]=useState(false);
  const[sentNote,setSentNote]=useState("");
  const[box,setBox]=useState("inbox");
  // Portal-level so it survives the remount that follows a profile save.
  const[profileNote,setProfileNote]=useState("");
  // Notice compose/edit lives at portal level so a background reload cannot
  // wipe a half-written notice. "new" opens a blank form; a notice object
  // opens it for editing.
  const[noticeModal,setNoticeModal]=useState(null);
  const[noticeNote,setNoticeNote]=useState("");
  /** A student's result card, opened from the class roster. */
  const[reportCard,setReportCard]=useState(null);
  const[modal,setModal]=useState(null);
  const inst=db.institutes.find(i=>i.id===user.inst)||db.institutes[0];
  const teacher=db.teachers.find(t=>t.id===user.ref)||db.teachers[0];
  const myStudents=db.students.filter(s=>s.instId===user.inst);
  const msgs=db.messages.filter(m=>m.instId===user.inst);
  /**
   * The list is fetched with `box=all`, so it holds both directions. Splitting
   * it here is what makes a sent message visible: before this, a teacher who
   * wrote to a parent saw their own message filed under "Inbox" as though the
   * parent had written it, or — with nothing addressed to them — an empty page
   * that looked like the send had failed.
   */
  const boxMsgs=msgs.filter(m=>box==="sent"?m.fromId===user.id:m.toId===user.id);
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
      // Put it in the thread they are reading, rather than leaving them to
      // wonder whether it went: `onReload` refreshes the list, and the list
      // has never carried replies.
      try{ setSelMsg(toLegacyMessage(await api.messages.get(selMsg.id),user.id)); }catch{/* the banner already said it sent */}
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
    // The list carries a reply count and no replies, so the thread has to be
    // asked for. Falling back to the list object keeps the message readable
    // if that call fails.
    try{ setSelMsg(toLegacyMessage(await api.messages.get(m.parentId??m.id),user.id)); }
    catch{/* the list copy is still worth reading */}
    if(!m.unread)return;
    try{
      await api.messages.markRead(m.id);
      onReload?.();
    }catch{/* a failed read receipt shouldn't block reading the message */}
  };

  /**
   * Quick marks entry — records a real mark, not a subject score.
   *
   * This used to write the enrolment's `currentScore` directly, which put it in
   * competition with the marks: a teacher could type 23 over a subject whose
   * quizzes averaged 80, and the result card would print 23 with nothing behind
   * it. The score is derived from marks now, so this records the mark and lets
   * the server do the arithmetic — which is what the teacher was doing anyway.
   */
  const[quickScores,setQuickScores]=useState({});
  const[quickBusy,setQuickBusy]=useState("");
  const[quickMsg,setQuickMsg]=useState(null);
  const[quickTitle,setQuickTitle]=useState("Class Test");
  const[quickTotal,setQuickTotal]=useState("100");
  const[quickTerm,setQuickTerm]=useState("");

  const saveQuickScore=async(sub,student)=>{
    const raw=quickScores[sub.enrollmentId];
    const obtained=Number(raw);
    const total=Number(quickTotal);

    if(!quickTitle.trim()){
      setQuickMsg({bad:true,text:"Give the mark a name — \"Class Test\", \"Quiz 3\" — so it means something on the report."});
      return;
    }
    if(!Number.isFinite(total)||total<=0){
      setQuickMsg({bad:true,text:"Total marks must be greater than 0."});
      return;
    }
    if(raw===undefined||raw===""||!Number.isFinite(obtained)||obtained<0){
      setQuickMsg({bad:true,text:"Marks obtained must be a number, 0 or more."});
      return;
    }
    if(obtained>total){
      setQuickMsg({bad:true,text:`Obtained cannot be more than the total of ${total}.`});
      return;
    }

    setQuickBusy(sub.enrollmentId);setQuickMsg(null);
    try{
      await api.assessments.create({
        studentId:student.id, subjectId:sub.id,
        title:quickTitle.trim(), type:"TEST",
        obtained, total,
        ...(quickTerm&&{term:quickTerm}),
      });
      const pct=Math.round((obtained/total)*1000)/10;
      setQuickMsg({bad:false,text:`${student.name} — ${quickTitle.trim()}: ${obtained}/${total} (${pct}%) recorded.`});
      setQuickScores(v=>{const{[sub.enrollmentId]:_,...rest}=v;return rest;});
      onReload?.();
    }catch(e){
      setQuickMsg({bad:true,text:e.errors?.[0]?.message||e.message||"Could not record that mark."});
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
    const[date,setDate]=useState(todayISO());
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
        setSaved(`Saved for ${count(res.marked,"student")}.`);
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
            <div className="ec-pickers" style={{display:"flex",gap:12,alignItems:"flex-end"}}>
              <div style={{minWidth:170}}>
                <Sel label="Class" options={myClasses.map(c=>({v:`${c.grade}|${c.section}`,l:`${c.grade} — Section ${c.section}`}))} value={cls} onChange={e=>setCls(e.target.value)}/>
              </div>
              <div style={{minWidth:150}}>
                <Inp label="Date" type="date" max={todayISO()} value={date} onChange={e=>setDate(e.target.value)}/>
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
            <div key={s.id} className="ec-attrow" style={{display:"flex",gap:14,alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${T.border}`}}>
              <Av name={s.name} size={36} bg={`${T.forest}15`} color={T.forest} fs={12}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:T.ink}}>{s.name}</div>
                <div style={{fontSize:11,color:T.muted}}>{s.rollNo}</div>
              </div>
              <div className="ec-attmarks" style={{display:"flex",gap:8}}>
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
      title:"",type:"QUIZ",term:"",total:"20",
      takenOn:todayISO(),
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
          // Left blank the mark belongs to no term, which is honest: it then
          // appears on the full-year card only.
          ...(f.term&&{term:f.term}),
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
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Sel label="Type" options={["QUIZ","TEST","ASSIGNMENT","PROJECT","LAB","EXAM"]} value={f.type} onChange={e=>s("type",e.target.value)}/>
          <Sel label="Term" options={[{v:"",l:"No term"},...sessionTerms.map(t=>({v:t.name,l:t.name}))]} value={f.term} onChange={e=>s("term",e.target.value)}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Inp label="Date" value={f.takenOn} onChange={e=>s("takenOn",e.target.value)} type="date" max={todayISO()}/>
          <Inp label="Total Marks*" value={f.total} onChange={e=>s("total",e.target.value)} type="number"/>
        </div>

        <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:".6px"}}>
          Marks {roster.length>0&&`(${count(roster.length,"student")})`}
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
    const[recalcing,setRecalcing]=useState(false);
    const[recalcNote,setRecalcNote]=useState("");
    /** Bumped after a recalculation so the book refetches. */
    const[nonce,setNonce]=useState(0);

    useEffect(()=>{
      if(!subjectId){setBook(null);return;}
      let cancelled=false;
      setLoading(true);setErr("");
      api.assessments.gradebook({subjectId})
        .then(r=>{if(!cancelled)setBook(r);})
        .catch(e=>{if(!cancelled)setErr(e.message||"Could not load the grade book.");})
        .finally(()=>{if(!cancelled)setLoading(false);});
      return()=>{cancelled=true;};
    },[subjectId,nonce]);

    /**
     * Put every score in this subject back in step with its marks.
     *
     * Worth doing when the book shows a disagreement — a score somebody typed
     * by hand that the marks under it do not add up to.
     */
    const recalcBook=async(id)=>{
      if(!window.confirm(
        "Recalculate every score in this subject from its marks?" +
        "\n\nAny score entered by hand is replaced by the average of that student's marks." +
        "\n\nStudents with no marks in this subject are left as they are."
      ))return;
      setRecalcing(true);setErr("");setRecalcNote("");
      try{
        const r=await api.subjects.recalculate(id);
        setRecalcNote(`${count(r?.enrollments??0,"score")} recalculated from their marks.`);
        setNonce(n=>n+1);
        onReload?.();
      }catch(e){
        setErr(e.message||"Could not recalculate this subject.");
      }finally{
        setRecalcing(false);
      }
    };

    const cols=book?.columns??[];

    const exportCsv=()=>{
      if(!book?.rows?.length)return;
      downloadCsv(
        stamped(`gradebook-${book.subject.name.replace(/\W+/g,"-").toLowerCase()}`,"csv"),
        book.rows.map(r=>({
          roll:r.student.rollNo,name:r.student.name,
          ...Object.fromEntries(cols.map(c=>[c.label,r.marks[c.key]?`${r.marks[c.key].obtained}/${r.marks[c.key].total}`:""])),
          average:r.average??"",grade:r.letterGrade??"",trend:r.trend??"",
        })),
        [["Roll No","roll"],["Student","name"],...cols.map(c=>[c.label,c.label]),
          ["Average (%)","average"],["Grade","grade"],["Trend","trend"]]
      );
    };

    return(
      <div style={{animation:"fadeUp .35s"}}>
        <SecHead pre="Academic" title="Grade Book" action={
          <div style={{display:"flex",gap:8,marginBottom:4}}>
            {/* Offered to the subject's own teacher, because they are the one
                who can type a score over the marks in the first place — and the
                API scopes it to their subjects either way. Only worth showing
                when the book actually disagrees with itself. */}
            {book?.subject?.id&&book.rows?.some(r=>r.marksAverage!=null&&r.average!=null&&Math.abs(r.marksAverage-r.average)>0.05)&&(
              <Btn out color={T.warning} onClick={()=>recalcBook(book.subject.id)} disabled={recalcing}>
                {recalcing?"Recalculating…":"Recalculate from marks"}
              </Btn>
            )}
            <Btn onClick={()=>setModal("assessment")}>+ Add Assessment</Btn>
          </div>
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
          {recalcNote&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"10px 14px",fontSize:13,fontWeight:600,marginBottom:10,border:`1px solid ${T.success}30`}}>{recalcNote}</div>}
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
              <thead><tr>{["Student",...cols.map(c=>c.label),"Avg.","Grade","Trend"].map(h=>(
                <th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>
              ))}</tr></thead>
              <tbody>{book.rows.map(r=>(
                <tr key={r.enrollmentId} style={{borderBottom:`1px solid ${T.border}`}}>
                  <td style={{padding:"12px"}}><div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <Av name={r.student.name} size={28} bg={`${T.purple}18`} color={T.purple} fs={10}/>
                    <span style={{fontSize:13,color:T.ink,fontWeight:600}}>{r.student.name}</span>
                  </div></td>
                  {cols.map(c=>{
                    const m=r.marks[c.key];
                    return(
                      <td key={c.key} style={{padding:"12px",fontSize:13,fontWeight:600,
                        color:!m?T.muted:m.percentage>=80?T.success:m.percentage>=60?T.warning:T.danger}}>
                        {m?`${m.obtained}/${m.total}`:"—"}
                      </td>
                    );
                  })}
                  <td style={{padding:"12px",fontFamily:"Georgia,serif"}}>
                    {/* A subject score has two writers — the marks, and Quick Grade
                        Entry. When they disagree the recorded figure stands, but the
                        book says what the marks add up to rather than hiding it. */}
                    <div style={{fontSize:15,fontWeight:800,color:T.ink}}>{r.average!=null?`${Math.round(r.average)}%`:"—"}</div>
                    {r.marksAverage!=null&&r.average!=null&&Math.abs(r.marksAverage-r.average)>0.05&&(
                      <div title="This score was entered by hand and does not match the marks below it."
                        style={{fontSize:10,color:T.warning,fontWeight:600,marginTop:2,fontFamily:"inherit"}}>
                        marks say {Math.round(r.marksAverage)}%
                      </div>
                    )}
                  </td>
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
            <p style={{color:T.muted,fontSize:14,marginTop:5}}>You teach {teacher.subject} across {count(teacher.classes.length,"class","classes")}.</p>
          </div>
          <div className="ec-pair" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
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
                <div style={{fontSize:14,fontWeight:700,color:T.ink}}>Quick Marks Entry</div>
                <Btn onClick={()=>setModal("assessment")} style={{padding:"7px 14px",fontSize:12}}>+ Assessment</Btn>
              </div>

              {/* One mark, given to the whole column. The subject score follows
                  from the marks, so what a teacher types here has to be a mark. */}
              <div style={{display:"grid",gridTemplateColumns:"1.5fr .7fr 1fr",gap:8,marginBottom:12}}>
                <Inp label="Mark name" value={quickTitle} onChange={e=>setQuickTitle(e.target.value)}
                  placeholder="Class Test" maxLength={80} style={{marginBottom:0}}/>
                <Inp label="Out of" type="number" min="1" value={quickTotal}
                  onChange={e=>setQuickTotal(e.target.value)} style={{marginBottom:0}}/>
                <Sel label="Term" options={[{v:"",l:"No term"},...sessionTerms.map(t=>({v:t.name,l:t.name}))]}
                  value={quickTerm} onChange={e=>setQuickTerm(e.target.value)} style={{marginBottom:0}}/>
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
                    <span style={{fontSize:12,color:T.muted,flex:1}}>
                      {s.name}
                      {/* The subject score, so a teacher can see where the
                          column stands before adding to it. */}
                      <span style={{color:T.muted,opacity:.7}}>{sub.scored?` · ${sub.score}%`:" · no marks yet"}</span>
                    </span>
                    <input type="number" min="0" placeholder="—"
                      value={quickScores[key]??""}
                      onChange={e=>setQuickScores(v=>({...v,[key]:e.target.value}))}
                      style={{width:58,padding:"5px 8px",borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,textAlign:"center",color:T.ink,background:T.paper,outline:"none"}}/>
                    <span style={{fontSize:11,color:T.muted}}>/ {quickTotal||"—"}</span>
                    <Btn onClick={()=>saveQuickScore(sub,s)} disabled={!key||quickBusy===key||!(quickScores[key]??"")}
                      style={{padding:"5px 10px",fontSize:11}}>
                      {quickBusy===key?"…":"Record"}
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
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:12,flexWrap:"wrap"}}>
            <SecHead pre="Communication" title="Messages"/>
            {!compose&&<Btn onClick={()=>setCompose(true)} style={{marginBottom:18}}>+ New Message</Btn>}
          </div>
          {sentNote&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"11px 16px",fontSize:13,fontWeight:600,marginBottom:16,border:`1px solid ${T.success}30`}}>{sentNote}</div>}
          {compose&&(
            <MessageComposer
              onClose={()=>setCompose(false)}
              onSent={name=>{
                setCompose(false);
                setSentNote(`Message sent to ${name}.`);
                setTimeout(()=>setSentNote(""),3000);
                onReload?.();
              }}
            />
          )}
          <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:18,height:520}}>
            <Crd style={{overflow:"hidden",display:"flex",flexDirection:"column"}}>
              <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",gap:4}}>
                  {[["inbox","Inbox"],["sent","Sent"]].map(([id,label])=>(
                    <span key={id} onClick={()=>{setBox(id);setSelMsg(null);}}
                      style={{fontSize:12,fontWeight:700,padding:"4px 10px",borderRadius:99,cursor:"pointer",
                        color:box===id?T.forest:T.muted,background:box===id?`${T.forest}12`:"transparent"}}>{label}</span>
                  ))}
                </div>
                <Bdg label={`${msgs.filter(m=>m.unread).length} new`} color={T.clay} bg={`${T.clay}15`}/>
              </div>
              <div style={{flex:1,overflowY:"auto"}}>
                {!boxMsgs.length&&(
                  <div style={{padding:"18px 16px",fontSize:12.5,color:T.muted,lineHeight:1.6}}>
                    {box==="sent"
                      ?"You haven't sent any messages yet. Use “New Message” to write to a parent or an admin."
                      :"No messages yet. Parents and admins who write to you will appear here."}
                  </div>
                )}
                {boxMsgs.map(m=>(
                  <div key={m.id} onClick={()=>openMessage(m)} style={{padding:"13px 16px",cursor:"pointer",borderBottom:`1px solid ${T.border}`,background:selMsg?.id===m.id?`${T.forest}09`:"transparent",borderLeft:`3px solid ${selMsg?.id===m.id?T.forest:"transparent"}`,transition:"background .15s"}}>
                    <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                      {/* In Sent, the useful name is who it went TO, not our own. */}
                      <Av name={box==="sent"?m.to:m.from} size={30} bg={T.paper} color={T.forest} fs={10}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:m.unread?700:500,color:T.ink}}>{box==="sent"?`To ${m.to}`:m.from}</span><span style={{fontSize:10,color:T.muted}}>{m.time}</span></div>
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
                    <MessageThread root={selMsg} meId={user.id}/>
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
          <SecHead pre="School" title="Notices" action={<Btn onClick={()=>setNoticeModal("new")} style={{marginBottom:4}}>+ Post Notice</Btn>}/>
          {noticeNote&&<div style={{background:`${T.success}12`,color:T.success,borderRadius:10,padding:"11px 16px",fontSize:13,fontWeight:600,marginBottom:16,border:`1px solid ${T.success}30`}}>{noticeNote}</div>}
          {!notices.length&&<Crd style={{padding:"40px",textAlign:"center",color:T.muted,fontSize:13}}>No notices on the board yet. Post the first one.</Crd>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
            {notices.map(n=>{
              // Edit is offered on your own notices only. The API refuses the
              // rest, so a card without the badge is not merely hidden.
              const mine=Boolean(n.authorId&&n.authorId===user.id);
              return(
                <Crd key={n.id} style={{padding:"24px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><Bdg label={t(n.cat)} color={catC(n.cat)} bg={`${catC(n.cat)}15`}/><span style={{fontSize:12,color:T.muted}}>{n.date}</span></div>
                  <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:T.ink,marginBottom:8}}>{n.title}</div>
                  <p style={{fontSize:13,color:T.muted,lineHeight:1.7}}>{n.body}</p>
                  <div style={{display:"flex",gap:10,alignItems:"center",marginTop:14}}>
                    <span style={{fontSize:12,color:T.muted}}>{mine?"Posted by you":n.author?`Posted by ${n.author}`:""}</span>
                    {mine&&(
                      <span {...pressable(()=>setNoticeModal(n),`Open notice: ${n.title}`)} style={{cursor:"pointer",marginLeft:"auto"}}>
                        <Bdg label="Edit" color={T.forest} bg={`${T.forest}15`}/>
                      </span>
                    )}
                  </div>
                </Crd>
              );})}
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
                  <Bdg label={count(teacher.classes.length,"Class","Classes")} color={T.forest} bg={`${T.forest}15`}/>
                  <Bdg label={count(teacher.students,"Student")} color={T.purple} bg={`${T.purple}15`}/>
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
      {reportCard&&<ReportCardModal studentId={reportCard} onClose={()=>setReportCard(null)}/>}
      {noticeModal&&(
        <NoticeComposer
          notice={noticeModal==="new"?null:noticeModal}
          onClose={()=>setNoticeModal(null)}
          onSaved={(t,wasEdit)=>{
            setNoticeModal(null);
            setNoticeNote(`"${t}" ${wasEdit?"updated":"published"}.`);
            setTimeout(()=>setNoticeNote(""),4000);
            onReload?.();
          }}
        />
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
  // Repaints this portal when the guardian changes language.
  useLang();
  const[tab,setTab]=useHashTab("dashboard",PARENT_TABS);
  const[col,setCol]=useState(false);
  // The challan or receipt a guardian asked to print.
  const[feeSlip,setFeeSlip]=useState(null);
  const[selMsg,setSelMsg]=useState(db.messages[0]);
  const[msgs,setMsgs]=useState(db.messages);
  // Keep the local copy in step when the parent reloads db after a mutation.
  useEffect(()=>{setMsgs(db.messages);setSelMsg(m=>db.messages.find(x=>x.id===m?.id)||db.messages[0]);},[db.messages]);
  /**
   * Same split as the other portals. The list arrives as `box=all`, so without
   * this a parent's own reply was listed in their Inbox as though a teacher had
   * sent it to them.
   */
  const[box,setBox]=useState("inbox");
  const boxMsgs=msgs.filter(m=>box==="sent"?m.fromId===user.id:m.toId===user.id);
  const[reply,setReply]=useState("");
  const[sent,setSent]=useState(false);
  const[compose,setCompose]=useState(false);
  const[selNotice,setSelNotice]=useState(null);
  const[selSub,setSelSub]=useState(null);
  /** The child's result card, opened from the Grades screen. */
  const[reportCard,setReportCard]=useState(null);
  const inst=db.institutes.find(i=>i.id===user.inst)||db.institutes[0];
  const parent=db.parents.find(p=>p.id===user.ref)||db.parents[0];
  /**
   * Which child this guardian is looking at.
   *
   * This used to be `db.students.find(s => s.id === parent.studentId)` — the
   * first child of the family, permanently. The loader already fetches every
   * child in full, so the other two were sitting in memory the whole time
   * with nothing on screen able to reach them.
   */
  const kids=db.students;
  const[childId,setChildId]=useState(()=>parent?.studentId??kids[0]?.id??null);
  // A reload can add or remove a child; keep the choice on someone who exists.
  useEffect(()=>{
    if(!kids.some(k=>k.id===childId))setChildId(kids[0]?.id??null);
  },[kids,childId]);
  const student=kids.find(s=>s.id===childId)||kids[0];
  // Highest-severity concern from the insight engine — drives the AI alert card.
  const topInsight=(student?.aiRecs??[])
    .filter(r=>r.type==="WEAKNESS"||r.type==="ATTENDANCE")
    .sort((a,b)=>b.severity-a.severity)[0]??null;
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const nav=[
    {id:"dashboard", label:t("Dashboard"),   icon:"⊞"},
    {id:"attendance",label:t("Attendance"),  icon:"◷"},
    {id:"grades",    label:t("Grades"),      icon:"◈"},
    {id:"ai",        label:t("AI Insights"), icon:"✦"},
    {id:"messages",  label:t("Messages"),    icon:"◎",badge:msgs.filter(m=>m.unread).length},
    {id:"fees",      label:t("Fees"),        icon:"◑"},
    {id:"timetable", label:t("Timetable"),   icon:"▦"},
    {id:"notices",   label:t("Notices"),     icon:"◆"},
    {id:"profile",   label:t("Profile"),     icon:"◉"},
  ];

  const sendReply=async()=>{
    if(!reply.trim()||!selMsg)return;
    const body=reply;
    setReply("");
    try{
      await api.messages.reply(selMsg.id,body);
      // Put it in the thread they are reading, rather than leaving them to
      // wonder whether it went: `onReload` refreshes the list, and the list
      // has never carried replies.
      try{ setSelMsg(toLegacyMessage(await api.messages.get(selMsg.id),user.id)); }catch{/* the banner already said it sent */}
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
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><div style={{fontSize:14,fontWeight:700,color:T.ink}}>{t("New Message")}</div><span onClick={()=>setCompose(false)} style={{cursor:"pointer",color:T.muted,fontSize:22}}>×</span></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Sel label={t("To (Teacher / Admin)")}
            options={[{v:"",l:contacts?(contacts.length?"Choose a recipient…":"No contacts available"):"Loading…"},
              ...(contacts??[]).map(c=>({v:c.id,l:`${c.name}${c.role?` — ${c.role.toLowerCase()}`:""}`}))]}
            value={f.to} onChange={e=>s("to",e.target.value)}/>
          <Inp label={t("Subject")} value={f.subject} onChange={e=>s("subject",e.target.value)} placeholder={t("Subject of message")}/>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:".6px"}}>{t("Message")}</div>
          <textarea rows={4} value={f.body} onChange={e=>s("body",e.target.value)} placeholder={t("Write your message here…")} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,resize:"none",outline:"none",fontFamily:"inherit"}}/>
        </div>
        {e2&&<div style={{background:`${T.danger}12`,color:T.danger,borderRadius:10,padding:"10px 14px",fontSize:13,marginBottom:12,border:`1px solid ${T.danger}30`}}>{e2}</div>}
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={()=>setCompose(false)} out color={T.muted} style={{flex:1,padding:"11px"}}>{t("Cancel")}</Btn>
          <Btn onClick={send} style={{flex:2,padding:"11px"}} disabled={!f.to||!f.subject.trim()||!f.body.trim()||sending}>{sending?"Sending…":"Send Message"}</Btn>
        </div>
      </Crd>
    );
  };

  return(
    <Shell nav={nav} tab={tab} setTab={setTab} user={user} inst={inst} collapsed={col} setCollapsed={setCol} onLogout={onLogout}
      moreLabel={t("More")} logoutLabel={t("Log out")}>
      {feeSlip&&<FeeSlipModal invoiceId={feeSlip} onClose={()=>setFeeSlip(null)}/>}
      {/* Above everything, because every screen below it is about one child. */}
      {/* The guardian's own language, remembered between visits. Sits above
          the child picker because it applies to every screen below it. */}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
        <div style={{display:"flex",gap:2,background:T.paper,borderRadius:99,padding:3}}>
          {[["en","English"],["ur","اردو"]].map(([code,name])=>(
            <span key={code} {...pressable(()=>setLang(code),name)}
              style={{padding:"5px 14px",borderRadius:99,fontSize:12,fontWeight:700,cursor:"pointer",
                background:getLang()===code?T.card:"transparent",
                color:getLang()===code?T.forest:T.muted,
                boxShadow:getLang()===code?"0 1px 3px rgba(15,23,42,.10)":"none"}}>
              {name}
            </span>
          ))}
        </div>
      </div>
      <ChildSwitcher children={kids} value={student?.id} onChange={setChildId}/>
      {/* DASHBOARD */}
      {tab==="dashboard"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <div style={{marginBottom:24}}>
            <div style={{fontSize:10,fontWeight:700,color:T.muted,letterSpacing:"1.8px",textTransform:"uppercase",marginBottom:5}}>{new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</div>
            <h1 style={{fontFamily:"Georgia,serif",fontSize:34,fontWeight:800,color:T.ink}}>{t(greeting())}, <em style={{color:T.green,fontStyle:"italic"}}>{parent?.name.split(" ")[0]}.</em></h1>
            <p style={{color:T.muted,fontSize:14,marginTop:5}}>{t("Here's everything about ")}<b>{student.name}</b>{t("'s academic journey.")}</p>
          </div>
          <div className="ec-pair" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
            <KPI label={t("Average")} value={student.scored?`${student.average}%`:"—"} color={student.scored?T.forest:T.muted} icon="◈" sub={student.scored?t("Across all subjects"):t("No marks recorded yet")}/>
            {/* A child with nothing marked has no position — the same rule the
                result card applies. Showing "#0 of 5" was the old bug, and
                showing "#4 of 5" beside a blank card was the older one. */}
            <KPI label={t("Class Rank")} value={student.rank?`#${student.rank}`:"—"} color={T.purple} icon="◆"
              sub={student.rank?tn("of {n} students",student.classSize):t("No marks recorded yet")}/>
            <KPI label={t("Attendance")} value={`${student.att.rate??student.att.present}%`} color={T.success} icon="◷" sub={tn(student.att.days===1?"{n} school day":t("{n} school days"),student.att.days)}/>
            <KPI label={t("AI Score")} value={student.aiScore==null?"—":`${student.aiScore}/100`} color={T.gold} icon="✦" sub={t(student.aiScoreLabel)}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 300px",gap:18}}>
            {/* Subjects */}
            <Crd style={{padding:"24px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink}}>{t("Subject Performance")}</div>
                <span onClick={()=>setTab("grades")} style={{fontSize:12,color:T.green,cursor:"pointer",fontWeight:600}}>{t("Full report →")}</span>
              </div>
              {student.subjects.map((s,i)=>(
                <div key={s.name} style={{marginBottom:13}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}><div style={{width:7,height:7,borderRadius:2,background:s.color}}/><span style={{fontSize:13,fontWeight:500,color:T.ink}}>{s.name}</span></div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:11,color:T.muted}}>{s.scored?`${s.score}%`:"no marks"}</span>{s.scored&&<Bdg label={s.grade} color={gc(s.grade)} bg={`${gc(s.grade)}15`}/>}</div>
                  </div>
                  <Bar val={s.score} color={s.color} delay={i*70}/>
                </div>
              ))}
            </Crd>
            {/* Middle col */}
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <Crd style={{padding:"22px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.ink}}>{t("Attendance")}</div>
                  <span onClick={()=>setTab("attendance")} style={{fontSize:12,color:T.green,cursor:"pointer",fontWeight:600}}>{t("Details →")}</span>
                </div>
                <div style={{display:"flex",gap:18,alignItems:"center"}}>
                  <Donut p={student.att.present} color={T.forest} size={80}/>
                  <div style={{flex:1}}>
                    {[[t("Present"),student.att.present,T.success],[t("Absent"),student.att.absent,T.danger],[t("Late"),student.att.late,T.warning]].map(([l,v,c])=>(
                      <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}><div style={{width:7,height:7,borderRadius:"50%",background:c}}/><span style={{fontSize:12,color:T.muted}}>{l}</span></div>
                        <span style={{fontSize:13,fontWeight:700,color:T.ink}}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Crd>
              <Crd style={{padding:"22px",flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>{t("Recent Assessments")}</div>
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
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:10}}><span style={{color:T.gold,animation:"shimmer 2s infinite"}}>✦</span><span style={{fontSize:10,fontWeight:700,color:T.gold,letterSpacing:"1.5px",textTransform:"uppercase"}}>{t("AI Alert")}</span></div>
                <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:700,color:T.ink,lineHeight:1.3,marginBottom:8}}>{topInsight?`${topInsight.sub} needs attention`:t("No concerns flagged")}</div>
                <p style={{fontSize:12,color:T.muted,lineHeight:1.7}}>{topInsight?topInsight.tip:tn("{n} has no outstanding academic or attendance concerns this term.",student.name)}</p>
                <Btn onClick={()=>setTab("ai")} full style={{marginTop:14,padding:"9px",fontSize:12}}>{t("View AI Insights →")}</Btn>
              </Crd>
              <Crd style={{padding:"22px",flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.ink}}>{t("Messages")}</div>
                  <span onClick={()=>setTab("messages")} style={{fontSize:12,color:T.green,cursor:"pointer",fontWeight:600}}>{t("All →")}</span>
                </div>
                {msgs.slice(0,3).map((m,i)=>(
                  <div key={m.id} onClick={()=>{setTab("messages");setSelMsg(m);}} style={{display:"flex",gap:9,padding:"9px 0",borderBottom:i<2?`1px solid ${T.border}`:"none",cursor:"pointer"}}>
                    <Av name={m.from} size={28} bg={T.paper} color={T.forest} fs={9}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:m.unread?700:500,color:T.ink}}>{m.from}</span><span style={{fontSize:10,color:T.muted}}>{timeAgo(m.at,t)||m.time}</span></div>
                      <div style={{fontSize:11,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.subj}</div>
                    </div>
                    {m.unread&&<div style={{width:6,height:6,background:T.clay,borderRadius:"50%",flexShrink:0,marginTop:4}}/>}
                  </div>
                ))}
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.ink}}>{t("Fees")}</div>
                  <span onClick={()=>setTab("fees")} style={{fontSize:12,color:T.green,cursor:"pointer",fontWeight:600}}>{t("Details →")}</span>
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
                    :<div style={{fontSize:11,color:T.success,marginTop:8,fontWeight:600}}>{t("✓ All fees cleared")}</div>;})()}
              </Crd>
            </div>
          </div>
        </div>
      )}
      {/* ATTENDANCE */}
      {tab==="attendance"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre={t("Tracking")} title={t("Attendance Record")}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:18}}>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <Crd style={{padding:"26px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:16}}>{t("Attendance — last 12 months")}</div>
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
                          <div title={`${m.label} ${m.year}: ${m.present} of ${count(m.total,"day")}`}
                            style={{width:"100%",borderRadius:"3px 3px 0 0",background:i===lastIdx?G(T.mint,T.forest,"180deg"):T.border,height:`${(m.present/peak)*65}px`,transition:`height 1s ${i*55}ms`}}/>
                          <span style={{fontSize:8,color:T.muted}}>{m.label}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Real day counts, not the fixed 87/8/5/2/100/87% row. */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginTop:18}}>
                  {[[student.att.counts.present,t("Present"),T.forest],[student.att.counts.absent,t("Absent"),T.danger],
                    [student.att.counts.late,t("Late"),T.warning],[student.att.counts.leave,t("Leave"),T.muted],
                    [student.att.counts.total,t("Total"),T.ink],[`${student.att.rate}%`,t("Rate"),T.success]].map(([v,l,c])=>(
                    <div key={l} style={{padding:"10px 6px",background:T.paper,borderRadius:10,textAlign:"center"}}>
                      <div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:800,color:c}}>{v}</div>
                      <div style={{fontSize:9,color:T.muted,marginTop:2}}>{l}</div>
                    </div>
                  ))}
                </div>
              </Crd>
              <Crd style={{padding:"24px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:16}}>{t("Most Recent Days")}</div>
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
                        <div style={{fontSize:10,color:T.muted,textTransform:"capitalize"}}>{t(w.s)}</div>
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
                    <div style={{fontSize:10,fontWeight:700,color:T.gold,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:10}}>{t("✦ AI Insight")}</div>
                    {attInsight?(
                      <>
                        <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:700,color:T.ink,marginBottom:8,lineHeight:1.3}}>{attInsight.sub}</div>
                        <p style={{fontSize:12,color:T.muted,lineHeight:1.7}}>{attInsight.tip}</p>
                      </>
                    ):(
                      <p style={{fontSize:12,color:T.muted,lineHeight:1.7}}>
                        {tn("No attendance concerns flagged for {n}.",student.name)}
                      </p>
                    )}
                  </Crd>
                );
              })()}
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>{t("vs. Target")}</div>
                {[[t("Current"),student.att.rate,T.success],[t("Target"),95,T.forest],[t("Minimum"),75,T.muted]].map(([l,v,c])=>(
                  <div key={l} style={{marginBottom:13}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:T.muted}}>{l}</span><span style={{fontSize:12,fontWeight:700,color:c}}>{v}%</span></div>
                    <Bar val={v} color={c}/>
                  </div>
                ))}
              </Crd>
              {/* Derived from the attendance record actually held for this
                  student. Every figure here was previously a literal. */}
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>{t("Quick Stats")}</div>
                {(()=>{
                  const best=[...student.monthlyAtt].sort((a,b)=>b.present-a.present)[0];
                  const c=student.att.counts;
                  const punctual=c.total?Math.round((c.present/c.total)*100):0;
                  return[
                    [t("Days recorded"),String(c.total)],
                    [t("Best month"),best&&best.present?`${best.label} (${tc(best.present,"day")})`:"—"],
                    [t("On-time rate"),`${punctual}%`],
                    [t("Leave days"),String(c.leave)],
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
          <SecHead pre={t("Academic")} title={t("Grades & Results")} action={
            student?.id
              ? <Btn onClick={()=>setReportCard(student.id)} style={{marginBottom:4}}>{t("View Result Card")}</Btn>
              : null
          }/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 290px",gap:18}}>
            <Crd style={{padding:"26px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink}}>{t("Subject Breakdown")}</div>
                <span style={{fontSize:11,color:T.muted}}>{t("Click a row for details · ↑↓ = AI trend")}</span>
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
                  <span style={{fontSize:11,color:T.muted,marginTop:4,display:"block"}}>{s.scored?`${s.score}/100`:t("No marks recorded yet")} · Previous: {s.prev}%</span>
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
                <div style={{fontSize:10,color:"rgba(255,255,255,.5)",fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:5}}>{t("Current Average")}</div>
                {/* Standing and progress read from the real rank and average; this
                    claimed "Top 10% of class" and a fixed 82% bar for everyone. */}
                <div style={{fontFamily:"Georgia,serif",fontSize:52,fontWeight:800,color:"#fff",lineHeight:1}}>{student.average}%</div>
                <div style={{fontSize:13,color:"rgba(255,255,255,.6)",marginTop:8}}>
                  {student.rank&&student.classSize?`Ranked #${student.rank} of ${student.classSize} in class`:t("Class rank not available yet")}
                </div>
                <div style={{marginTop:14,height:4,background:"rgba(255,255,255,.15)",borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(100,student.average)}%`,background:T.mint,borderRadius:99}}/></div>
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>{t("All Assessments")}</div>
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
          <SecHead pre={t("Intelligence")} title={t("AI Insights & Predictions")}/>
          <Crd style={{padding:"32px",marginBottom:18,background:`linear-gradient(140deg,${T.ink},#1a3355)`,border:"none",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-50,right:-50,width:200,height:200,borderRadius:"50%",background:T.gold,opacity:.05}}/>
            <div style={{position:"absolute",bottom:-40,left:100,width:180,height:180,borderRadius:"50%",background:T.mint,opacity:.05}}/>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}><span style={{color:T.gold,animation:"shimmer 2s infinite",fontSize:18}}>✦</span><span style={{fontSize:10,fontWeight:700,color:T.gold,letterSpacing:"2px",textTransform:"uppercase"}}>{t("AI Academic Intelligence Engine")}</span></div>
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
                      ?(()=>{const[a,b]=tn("{n} is projected to average {v} across their subjects",student.name).split("{v}");return<>{a}<em style={{color:T.mint}}>{projected}%</em>{b}</>;})()
                      :<>{tn("No subject data recorded for {n} yet",student.name)}</>}
                  </h2>
                  <p style={{fontSize:14,color:"rgba(255,255,255,.5)",lineHeight:1.8,maxWidth:500,marginBottom:24}}>
                    {subs.length
                      ? t("Based on {v} and {d} of attendance.").split("{v}").join(tc(subs.length,"subject")).split("{d}").join(tc(student.att.days,"day"))
                      : t("Once marks and attendance are recorded, predictions appear here.")}
                  </p>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
                    {[[student.aiScore==null?"—":`${student.aiScore} / 100`,t("AI Performance Score"),T.gold],
                      [t(student.aiScoreLabel),t("Academic Standing"),T.mint],
                      [student.rank?tn("#{n} of {v}",student.rank).split("{v}").join(student.classSize):"—",t("Current Class Rank"),"#fff"]].map(([v,l,c])=>(
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
              <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:16}}>{t("Per-Subject Predictions")}</div>
              {student.subjects.map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 12px",borderRadius:12,background:T.paper,marginBottom:8,border:`1px solid ${T.border}`}}>
                  <div style={{width:36,height:36,borderRadius:10,background:`${s.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:s.color,flexShrink:0}}>{s.grade}</div>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.ink}}>{s.name}</div><div style={{fontSize:11,color:T.muted}}>Now: {s.score}%</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:s.pred>s.score?T.success:T.danger}}>{s.pred}%</div><div style={{fontSize:10,color:T.muted}}>{t("Predicted")}</div></div>
                  <span style={{fontSize:18,color:s.pred>s.score?T.success:T.danger,fontWeight:700}}>{s.pred>s.score?"↑":"↓"}</span>
                </div>
              ))}
            </Crd>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"24px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:14}}>{t("Personalized Recommendations")}</div>
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
                    <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:4}}>{t("Overall Performance Trend")}</div>
                    <div style={{fontSize:11.5,color:T.muted,marginBottom:14}}>{t("Average across all subjects, previous assessment vs current.")}</div>
                    <div style={{display:"flex",alignItems:"center",gap:20}}>
                      <div style={{display:"flex",alignItems:"flex-end",gap:14}}>
                        {[["Previous",prev,T.border],[t("Current"),cur,T.forest]].map(([l,v,c])=>(
                          <div key={l} style={{textAlign:"center"}}>
                            <div style={{fontSize:10,color:T.muted,marginBottom:4}}>{v}%</div>
                            <div style={{width:34,height:Math.max(4,(v/100)*60),background:c,borderRadius:"4px 4px 0 0"}}/>
                            <div style={{fontSize:10,color:T.muted,marginTop:5}}>{l}</div>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:800,color:col}}>{delta>0?"+":""}{delta}%</div>
                        <div style={{fontSize:12,color:T.muted}}>{t("Change")}</div>
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
          <SecHead pre={t("Communication")} title={t("Messages")} action={<Btn onClick={()=>setCompose(true)} style={{marginBottom:4}}>{t("+ Compose")}</Btn>}/>
          {compose&&<ComposeCard/>}
          <div style={{display:"grid",gridTemplateColumns:"290px 1fr",gap:18,height:500}}>
            <Crd style={{overflow:"hidden",display:"flex",flexDirection:"column"}}>
              <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",gap:4}}>
                  {[["inbox",t("Inbox")],["sent",t("Sent")]].map(([id,label])=>(
                    <span key={id} onClick={()=>{setBox(id);setSelMsg(null);}}
                      style={{fontSize:12,fontWeight:700,padding:"4px 10px",borderRadius:99,cursor:"pointer",
                        color:box===id?T.forest:T.muted,background:box===id?`${T.forest}12`:"transparent"}}>{label}</span>
                  ))}
                </div>
                <Bdg label={`${msgs.filter(m=>m.unread).length} new`} color={T.clay} bg={`${T.clay}15`}/>
              </div>
              <div style={{flex:1,overflowY:"auto"}}>
                {!boxMsgs.length&&(
                  <div style={{padding:"18px 16px",fontSize:12.5,color:T.muted,lineHeight:1.6}}>
                    {box==="sent"
                      ?"You haven't sent any messages yet. Use “Compose” to write to a teacher or the school office."
                      :"No messages yet. Teachers and the school office will appear here."}
                  </div>
                )}
                {boxMsgs.map(m=>(
                  <div key={m.id} onClick={async()=>{setSelMsg(m);setMsgs(prev=>prev.map(x=>x.id===m.id?{...x,unread:false}:x));try{setSelMsg(toLegacyMessage(await api.messages.get(m.parentId??m.id),user.id));}catch{/* the list copy still reads */}}}
                    style={{padding:"13px 16px",cursor:"pointer",borderBottom:`1px solid ${T.border}`,background:selMsg?.id===m.id?`${T.forest}09`:"transparent",borderLeft:`3px solid ${selMsg?.id===m.id?T.forest:"transparent"}`,transition:"background .15s"}}>
                    <div style={{display:"flex",gap:9,alignItems:"flex-start"}}>
                      {/* In Sent the useful name is the recipient, not our own. */}
                      <Av name={box==="sent"?m.to:m.from} size={30} bg={T.paper} color={T.forest} fs={10}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:m.unread?700:500,color:T.ink}}>{box==="sent"?`To ${m.to}`:m.from}</span><span style={{fontSize:10,color:T.muted}}>{timeAgo(m.at,t)||m.time}</span></div>
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
                      <span style={{fontSize:11,color:T.muted,marginLeft:"auto"}}>{timeAgo(selMsg.at,t)||selMsg.time}</span>
                    </div>
                  </div>
                  <div style={{flex:1,padding:"26px",overflowY:"auto"}}>
                    <MessageThread root={selMsg} meId={user.id}/>
                  </div>
                  {sent&&<div style={{background:`${T.success}12`,color:T.success,padding:"10px 26px",fontSize:13,fontWeight:600,border:`1px solid ${T.success}30`}}>✓ Reply sent successfully</div>}
                  <div style={{padding:"16px 26px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10}}>
                    <input value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendReply()} placeholder={`Reply to ${selMsg.from}…`} style={{flex:1,background:T.paper,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"10px 16px",color:T.ink,fontSize:13,outline:"none",transition:"border-color .15s"}} onFocus={e=>e.target.style.borderColor=T.forest} onBlur={e=>e.target.style.borderColor=T.border}/>
                    <Btn onClick={sendReply}>{t("Send")}</Btn>
                  </div>
                </>
              ):(
                <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                  <div style={{fontSize:48,color:T.border,marginBottom:12}}>◎</div>
                  <div style={{fontFamily:"Georgia,serif",fontSize:18,color:T.muted}}>{t("Select a message")}</div>
                  <div style={{fontSize:13,color:T.border,marginTop:6}}>{t("Choose from the inbox on the left")}</div>
                </div>
              )}
            </Crd>
          </div>
        </div>
      )}
      {/* FEES */}
      {tab==="fees"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre={t("Finance")} title={t("Fee Management")}/>
          {/* Real invoice totals from the server. These were an assumed
              Rs 1,50,000 a year and an invoice count times a literal 12,500,
              so the figures matched no actual invoice. */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>
            <KPI label={t("Invoiced")} value={`Rs. ${(student.feeTotals.paid+student.feeTotals.outstanding).toLocaleString()}`} color={T.ink} icon="◑" sub={tn(student.fees.length===1?"{n} invoice":t("{n} invoices"),student.fees.length)}/>
            <KPI label={t("Paid")} value={`Rs. ${student.feeTotals.paid.toLocaleString()}`} color={T.success} icon="✓" sub={tn("{n} settled",student.fees.filter(f=>f.status==="paid").length)}/>
            <KPI label={t("Outstanding")} value={`Rs. ${student.feeTotals.outstanding.toLocaleString()}`} color={T.warning} icon="⏳" sub={tn("{n} unpaid",student.fees.filter(f=>f.status!=="paid"&&f.status!=="waived").length)}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:18}}>
            <Crd style={{padding:"26px"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>{t("Payment History")}</div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{[t("Month"),t("Amount"),t("Due Date"),t("Paid On"),t("Status"),""].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{t(h)}</th>)}</tr></thead>
                <tbody>{!student.fees.length&&(
                  <tr><td colSpan={6} style={{padding:"16px 12px",fontSize:13,color:T.muted}}>{t("No invoices have been issued yet.")}</td></tr>
                )}
                {/* Each invoice carries its own due date — the column was a
                    literal "20th" for every row regardless. An itemised challan
                    opens to show the heads it is made of. */}
                {student.fees.map((f,i)=><ParentFeeRow key={f.id??i} fee={f} onSlip={setFeeSlip}/>)}</tbody>
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
                    <div style={{fontSize:10,fontWeight:700,color:T.success,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:10}}>{t("✓ Nothing Due")}</div>
                    <div style={{fontSize:13,color:T.muted,lineHeight:1.7}}>{tn("All issued invoices for {n} have been settled.",student.name)}</div>
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
                        [["Period","period"],["Amount (PKR)","amount"],[t("Status"),"status"],["Due","due"],[t("Paid On"),"paid"],["Method","method"]]))
                        alert("No invoices to download yet.");
                    }} style={{padding:"11px",fontSize:13}}>{t("Download Fee Statement")}</Btn>
                  </Crd>
                );
              })()}
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:4}}>{t("Invoice Amounts")}</div>
                <div style={{fontSize:11.5,color:T.muted,marginBottom:12,lineHeight:1.6}}>
                  {t("What the school has billed per period.")}
                </div>
                {!student.fees.length&&<div style={{fontSize:12,color:T.muted}}>{t("Nothing billed yet.")}</div>}
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
          <SecHead pre={t("Schedule")} title={t("Class Timetable")}/>
          <Crd style={{padding:"26px",overflowX:"auto"}}>
            {!student.timetable.length?(
              <div style={{fontSize:13,color:T.muted,padding:"8px 0",lineHeight:1.7}}>
                {tn("No timetable has been published for {n} yet.",`${student.grade} ${student.section}`)}
              </div>
            ):(
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:660}}>
                <thead>
                  <tr>
                    <th style={{padding:"10px 16px",textAlign:"left",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",borderBottom:`2px solid ${T.border}`,width:110}}>{t("Day")}</th>
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
          <SecHead pre={t("School")} title={t("Notices & Announcements")}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
            {db.notices.filter(n=>n.instId===user.inst).map(n=>(
              <Crd key={n.id} onClick={()=>setSelNotice(selNotice===n.id?null:n.id)} style={{padding:"24px",border:selNotice===n.id?`1.5px solid ${T.forest}55`:`1px solid ${T.border}`,cursor:"pointer",transition:"border-color .15s"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><Bdg label={t(n.cat)} color={catC(n.cat)} bg={`${catC(n.cat)}15`}/><span style={{fontSize:12,color:T.muted}}>{n.date}</span></div>
                <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:T.ink,marginBottom:8,lineHeight:1.3}}>{n.title}</div>
                {selNotice===n.id?<p style={{fontSize:13,color:T.muted,lineHeight:1.75}}>{n.body}</p>:<p style={{fontSize:13,color:T.muted}}>{n.body.slice(0,65)}…</p>}
                <div style={{marginTop:10,fontSize:12,color:T.green,fontWeight:600}}>{selNotice===n.id?"▲ Collapse":t("▼ Read more")}</div>
              </Crd>
            ))}
          </div>
        </div>
      )}
      {/* PROFILE */}
      {tab==="profile"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre={t("Account")} title={t("Student Profile")}/>
          <div style={{display:"grid",gridTemplateColumns:"290px 1fr",gap:18}}>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"28px",textAlign:"center"}}>
                <div style={{width:80,height:80,borderRadius:"50%",background:G(T.forest,T.mint),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:28,color:"#fff",margin:"0 auto 14px"}}>{ini(student.name)}</div>
                <div style={{fontFamily:"Georgia,serif",fontSize:19,fontWeight:700,color:T.ink}}>{student.name}</div>
                <div style={{fontSize:12,color:T.muted,marginTop:4}}>{student.grade} · Section {student.section}</div>
                <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:12}}>
                  <Bdg label={`${student.average}% average`} color={T.success} bg={`${T.success}15`}/>
                  {student.rank?<Bdg label={`Rank #${student.rank}`} color={T.purple} bg={`${T.purple}15`}/>:null}
                </div>
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>{t("Academic Info")}</div>
                {[[t("Roll No."),student.roll],[t("Grade"),`${student.grade} · ${student.section}`],[t("Average"),`${student.average}%`],[t("Rank"),student.rank?`#${student.rank} of ${student.classSize}`:t("Not ranked yet")],[t("Subjects"),String(student.subjects.length)],[t("AI Score"),student.aiScore==null?"—":`${student.aiScore} / 100`]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:12,color:T.muted}}>{l}</span><span style={{fontSize:12,fontWeight:600,color:T.ink}}>{v}</span>
                  </div>
                ))}
              </Crd>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"26px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>{t("Personal Information")}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  {[[t("Full Name"),student.name],[t("Date of Birth"),student.dob],[t("Blood Group"),student.blood],[t("Phone"),student.phone]].map(([l,v])=>(
                    <div key={l}><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:".5px"}}>{l}</div><div style={{fontSize:14,color:T.ink,fontWeight:500}}>{v}</div></div>
                  ))}
                  <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:T.muted,fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:".5px"}}>{t("Address")}</div><div style={{fontSize:14,color:T.ink,fontWeight:500}}>{student.address}</div></div>
                </div>
              </Crd>
              <Crd style={{padding:"26px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>{t("Parent / Guardian")}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
                  {[[t("Name"),parent?.name],[t("Email"),parent?.email],[t("Phone"),parent?.phone],[t("Relation"),parent?.rel]].map(([l,v])=>(
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
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:6}}>{t("Notifications")}</div>
                <p style={{fontSize:12.5,color:T.muted,lineHeight:1.7,marginBottom:14}}>
                  {inst?.name||"Your school"} decides which alerts go out — fee reminders,
                  attendance notices and message emails are configured by the school office.
                  Contact them to change what you receive at <b style={{color:T.ink}}>{parent?.email}</b>.
                </p>
                <Btn out color={T.forest} full onClick={()=>{setTab("messages");setCompose(true);}} style={{padding:"10px",fontSize:12.5}}>
                  {t("Message the school →")}
                </Btn>
              </Crd>
            </div>
          </div>
        </div>
      )}
      {reportCard&&<ReportCardModal studentId={reportCard} onClose={()=>setReportCard(null)}/>}
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

/**
 * Lifts a reset token out of the URL exactly once, on first render, and wipes
 * it from the address bar in the same breath.
 *
 * The emailed link is `/reset-password?token=…`. That token is a bearer
 * credential: leaving it in the URL would park it in browser history, hand it
 * to any outbound referrer, and put it on screen during a screen-share. It is
 * read into memory and the URL is rewritten before anything renders.
 */
/**
 * Where the payment provider sent the browser back to.
 *
 * Read once and wiped from the address bar, like the reset token. The value is
 * used *only* to choose which message to show. It is never treated as evidence
 * that money moved: anyone can type `/billing/success` into the address bar,
 * and a genuine payer can close the tab before ever being redirected. The
 * server learns about payment from a signed webhook and from nothing else, so
 * these screens tell the truth — that confirmation is pending — and let the
 * billing page display whatever the server actually knows.
 */
let billingReturnRead=false;
let billingReturnValue=null;

const takeBillingReturn=()=>{
  if(billingReturnRead)return billingReturnValue;
  billingReturnRead=true;
  if(typeof window==="undefined")return null;

  const match=/\/billing\/(pending|success|cancelled)\/?$/.exec(window.location.pathname);
  if(!match)return null;

  window.history.replaceState(null,"","/");
  // "success" is treated exactly like "pending" — see above.
  billingReturnValue=match[1]==="cancelled"?"cancelled":"pending";
  return billingReturnValue;
};

let resetTokenRead=false;
let resetTokenValue=null;

const takeResetToken=()=>{
  // Memoised at module scope because this both reads *and* clears the URL.
  // React's StrictMode runs a lazy `useState` initialiser twice in
  // development: the first call consumed the token and rewrote the address
  // bar, so the second saw a clean URL and returned null, dropping the user on
  // the landing page holding a link that had already been spent.
  if(resetTokenRead)return resetTokenValue;
  resetTokenRead=true;

  if(typeof window==="undefined")return resetTokenValue;
  const params=new URLSearchParams(window.location.search);
  const token=params.get("token");
  const onResetPath=/\/reset-password\/?$/.test(window.location.pathname);
  if(!token&&!onResetPath)return resetTokenValue;

  window.history.replaceState(null,"","/");
  // "" rather than null when the path was right but the token was missing or
  // truncated in transit — that's a broken link to explain, not a normal visit.
  resetTokenValue=token??"";
  return resetTokenValue;
};

export default function App() {
  // Read before any state is set up, so a reset link always wins over whatever
  // session the browser might restore a moment later.
  const[resetToken]=useState(takeResetToken);
  const[billingReturn,setBillingReturn]=useState(takeBillingReturn);
  const[screen,setScreen]=useState(()=>(resetToken===null?"landing":"reset"));
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
        // Someone already signed in who follows a reset link still means to
        // reset — don't drop them into the portal instead.
        if(resetToken===null)setScreen("app");
      })
      .finally(()=>setRestoring(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Redeeming a reset link takes priority over restoring a session, so this
  // sits above the "signing you in" splash.
  if(screen==="reset") return (
    <ResetPassword
      token={resetToken}
      onDone={()=>setScreen("login")}
      onRequestNew={()=>setScreen("forgot")}
    />
  );

  if(restoring) return <Splash title="Signing you in…" detail="Restoring your session."/>;

  if(screen==="landing") return <Landing onLogin={()=>setScreen("login")} onSignup={()=>setScreen("signup")} onDemoLogin={login}/>;
  if(screen==="login")   return <Login   onLogin={login} onBack={()=>setScreen("landing")} onSignup={()=>setScreen("signup")} onForgot={()=>setScreen("forgot")}/>;
  if(screen==="forgot")  return <ForgotPassword onBack={()=>setScreen("login")}/>;
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

  /**
   * Returned from the payment provider.
   *
   * Deliberately says "confirming", never "paid". The provider redirects the
   * browser the instant the form is submitted, well before the payment is
   * settled and webhook-confirmed — and the URL can be visited directly by
   * anyone. Claiming success here would be claiming something this application
   * genuinely does not yet know.
   */
  if(billingReturn) return (
    <Splash
      title={billingReturn==="cancelled"?"Checkout cancelled":"Confirming your payment…"}
      detail={
        billingReturn==="cancelled"
          ? "Nothing was charged and your subscription is unchanged. You can start again from the Billing page whenever you're ready."
          : "Your payment provider is confirming the transaction with us. This usually takes a few seconds. Your Billing page shows the status as soon as it's confirmed — you don't need to pay again."
      }
      tone={billingReturn==="cancelled"?T.muted:T.forest}
      action={()=>setBillingReturn(null)}
      actionLabel="Go to Billing →"
    />
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






