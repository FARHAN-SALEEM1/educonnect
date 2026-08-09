import { useState, useEffect, useReducer } from "react";

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

const initDB = () => ({
  institutes:[
    {id:"INS001",name:"Beaconhouse School",city:"Lahore",plan:"growth",email:"admin@beaconhouse.edu",phone:"042-111-222",logo:"🏫",color:T.forest,status:"active",joined:"2025-08-01",students:420,teachers:38},
    {id:"INS002",name:"LACAS",city:"Karachi",plan:"elite",email:"admin@lacas.edu",phone:"021-333-444",logo:"🎓",color:T.purple,status:"active",joined:"2025-09-15",students:890,teachers:72},
    {id:"INS003",name:"The City School",city:"Islamabad",plan:"starter",email:"admin@citys.edu",phone:"051-555-666",logo:"📚",color:T.blue,status:"active",joined:"2025-11-01",students:145,teachers:18},
  ],
  users:[
    {id:"U001",email:"sa@educonnect.io",  pass:"super123", role:"superadmin",name:"Platform Admin",    inst:null,      ref:null},
    {id:"U002",email:"admin@bhs.edu",     pass:"admin123", role:"admin",     name:"Dr. Imran Sheikh", inst:"INS001",  ref:null},
    {id:"U003",email:"hassan@bhs.edu",    pass:"teach123", role:"teacher",   name:"Mr. Hassan",       inst:"INS001",  ref:"TCH001"},
    {id:"U004",email:"sara@gmail.com",    pass:"par123",   role:"parent",    name:"Sara Ahmed",       inst:"INS001",  ref:"PAR001"},
    {id:"U005",email:"nadia@bhs.edu",     pass:"teach123", role:"teacher",   name:"Ms. Nadia",        inst:"INS001",  ref:"TCH002"},
    {id:"U006",email:"admin@lacas.edu",   pass:"admin123", role:"admin",     name:"Ms. Rabia Noor",   inst:"INS002",  ref:null},
  ],
  students:[
    {id:"STU001",name:"Zain Ahmed",   grade:"Grade 8",section:"A",roll:"2024-081",parentId:"PAR001",instId:"INS001",dob:"2010-03-15",blood:"B+",phone:"0300-1234567",address:"House 12, Block C, DHA Lahore",
     subjects:[
       {name:"Mathematics", score:91,prev:85,grade:"A", teacher:"Mr. Hassan",color:T.purple,pred:93},
       {name:"Computer Sc.",score:98,prev:95,grade:"A+",teacher:"Ms. Hira",  color:T.forest,pred:97},
       {name:"Urdu",        score:94,prev:90,grade:"A", teacher:"Mr. Tariq", color:T.green, pred:95},
       {name:"English",     score:85,prev:85,grade:"A−",teacher:"Mr. Ali",   color:T.blue,  pred:86},
       {name:"Physics",     score:78,prev:72,grade:"B+",teacher:"Ms. Nadia", color:T.gold,  pred:82},
       {name:"Chemistry",   score:72,prev:80,grade:"B", teacher:"Ms. Fatima",color:T.clay,  pred:69},
     ],
     att:{present:87,absent:8,late:5,total:100},gpa:3.7,rank:4,classSize:42,
     weekAtt:[{d:"Mon",s:"present"},{d:"Tue",s:"absent"},{d:"Wed",s:"present"},{d:"Thu",s:"late"},{d:"Fri",s:"present"}],
     monthlyAtt:[22,20,19,21,20,18,21,22,20,19,21,22],
     assessments:[{sub:"Mathematics",type:"Quiz 3",got:18,of:20,date:"Mar 10"},{sub:"Chemistry",type:"Test 2",got:14,of:20,date:"Mar 8"},{sub:"English",type:"Assign.",got:17,of:20,date:"Mar 6"},{sub:"Physics",type:"Lab",got:19,of:20,date:"Mar 5"},{sub:"Comp. Sc.",type:"Project",got:20,of:20,date:"Mar 3"}],
     fees:[{month:"Jan 2026",amt:12500,status:"paid",date:"Jan 5"},{month:"Feb 2026",amt:12500,status:"paid",date:"Feb 3"},{month:"Mar 2026",amt:12500,status:"pending",date:null},{month:"Apr 2026",amt:12500,status:"pending",date:null}],
     timetable:[
       {day:"Monday",   p:["Mathematics","English","Computer Sc.","Physics","Urdu","Chemistry"]},
       {day:"Tuesday",  p:["English","Physics","Mathematics","Urdu","Computer Sc.","Chemistry"]},
       {day:"Wednesday",p:["Physics","Mathematics","Urdu","Computer Sc.","English","Mathematics"]},
       {day:"Thursday", p:["Urdu","Computer Sc.","Chemistry","Mathematics","Physics","English"]},
       {day:"Friday",   p:["Chemistry","Urdu","English","Physics","Mathematics","Computer Sc."]},
     ],
     aiRecs:[{sub:"Chemistry",tip:"Focus on Chemical Bonding — 3 consecutive tests show weakness."},{sub:"Physics",tip:"Revise Newton's Laws before exam on Mar 20."},{sub:"Mathematics",tip:"Excellent! Attempt advanced problem sets to stay ahead."}],
    },
    {id:"STU002",name:"Ayesha Khan",  grade:"Grade 9",section:"B",roll:"2024-092",parentId:"PAR002",instId:"INS001",dob:"2009-07-22",blood:"A+",phone:"0300-9876543",address:"House 5, F-7/2, Islamabad",
     subjects:[
       {name:"Mathematics",  score:88,prev:84,grade:"A−",teacher:"Mr. Hassan",color:T.purple,pred:90},
       {name:"Biology",      score:95,prev:92,grade:"A", teacher:"Ms. Sara",  color:T.teal,  pred:96},
       {name:"Chemistry",    score:82,prev:78,grade:"A−",teacher:"Ms. Fatima",color:T.clay,  pred:84},
       {name:"English",      score:90,prev:88,grade:"A", teacher:"Mr. Ali",   color:T.blue,  pred:91},
       {name:"Urdu",         score:79,prev:75,grade:"B+",teacher:"Mr. Tariq", color:T.green, pred:81},
       {name:"Pak. Studies", score:85,prev:83,grade:"A−",teacher:"Ms. Hina",  color:T.gold,  pred:87},
     ],
     att:{present:92,absent:5,late:3,total:100},gpa:3.9,rank:2,classSize:38,
     weekAtt:[{d:"Mon",s:"present"},{d:"Tue",s:"present"},{d:"Wed",s:"present"},{d:"Thu",s:"present"},{d:"Fri",s:"late"}],
     monthlyAtt:[21,22,20,22,21,20,22,22,21,20,22,21],
     assessments:[{sub:"Biology",type:"Test 2",got:19,of:20,date:"Mar 10"},{sub:"Mathematics",type:"Quiz 3",got:17,of:20,date:"Mar 8"},{sub:"Chemistry",type:"Lab",got:18,of:20,date:"Mar 6"}],
     fees:[{month:"Jan 2026",amt:12500,status:"paid",date:"Jan 4"},{month:"Feb 2026",amt:12500,status:"paid",date:"Feb 2"},{month:"Mar 2026",amt:12500,status:"paid",date:"Mar 5"},{month:"Apr 2026",amt:12500,status:"pending",date:null}],
     timetable:[
       {day:"Monday",   p:["Biology","English","Mathematics","Chemistry","Urdu","Pak. Studies"]},
       {day:"Tuesday",  p:["English","Chemistry","Biology","Pak. Studies","Mathematics","Urdu"]},
       {day:"Wednesday",p:["Chemistry","Biology","Urdu","Mathematics","English","Biology"]},
       {day:"Thursday", p:["Urdu","Mathematics","Pak. Studies","Biology","Chemistry","English"]},
       {day:"Friday",   p:["Pak. Studies","Urdu","English","Chemistry","Biology","Mathematics"]},
     ],
     aiRecs:[{sub:"Urdu",tip:"Reading Urdu literature daily will improve composition marks."},{sub:"Biology",tip:"Outstanding — consider entering the science olympiad."}],
    },
  ],
  teachers:[
    {id:"TCH001",name:"Mr. Hassan", subject:"Mathematics",instId:"INS001",classes:["8A","8B","9A"],students:126,email:"hassan@bhs.edu",phone:"0300-1111111",status:"active"},
    {id:"TCH002",name:"Ms. Nadia",  subject:"Physics",    instId:"INS001",classes:["8A","9A","10B"],students:108,email:"nadia@bhs.edu", phone:"0300-3333333",status:"active"},
    {id:"TCH003",name:"Ms. Fatima", subject:"Chemistry",  instId:"INS001",classes:["8A","8B","9B"],students:118,email:"fatima@bhs.edu",phone:"0300-4444444",status:"active"},
    {id:"TCH004",name:"Ms. Hira",   subject:"Computer Sc.",instId:"INS001",classes:["8A","9B","10A"],students:112,email:"hira@bhs.edu", phone:"0300-2222222",status:"active"},
  ],
  parents:[
    {id:"PAR001",name:"Sara Ahmed",studentId:"STU001",instId:"INS001",email:"sara@gmail.com",phone:"0321-9876543",rel:"Mother"},
    {id:"PAR002",name:"Ali Khan",  studentId:"STU002",instId:"INS001",email:"ali@gmail.com", phone:"0321-8765432",rel:"Father"},
  ],
  messages:[
    {id:1,from:"Ms. Nadia",fromRole:"Physics Teacher",to:"Sara Ahmed",subj:"Physics Exam Prep",body:"Dear Sara, please ensure Zain revises chapters 4–6 thoroughly before the upcoming exam. I have noticed significant improvement in his lab work but the theory needs more attention. Kindly arrange revision time this weekend.",time:"2h ago",unread:true,instId:"INS001"},
    {id:2,from:"Mr. Hassan",fromRole:"Math Teacher",to:"Sara Ahmed",subj:"Olympiad Selection",body:"It is my pleasure to inform you that Zain has been selected for the inter-school Mathematics Olympiad on April 5, 2026. Please confirm his participation by Friday so we can arrange the necessary preparation sessions.",time:"1d ago",unread:true,instId:"INS001"},
    {id:3,from:"Admin",fromRole:"School Office",to:"Sara Ahmed",subj:"Parent-Teacher Meeting",body:"You are cordially invited to the quarterly parent-teacher meeting on March 18 at 10:00 AM in the school auditorium. Tea and refreshments will be served. Kindly confirm attendance.",time:"2d ago",unread:false,instId:"INS001"},
    {id:4,from:"Ms. Hira",fromRole:"Computer Teacher",to:"Sara Ahmed",subj:"Outstanding Project",body:"I am pleased to inform you that Zain scored full marks on his database design project. He demonstrated excellent understanding of the subject. I encourage nurturing this interest at home.",time:"3d ago",unread:false,instId:"INS001"},
    {id:5,from:"Sara Ahmed",fromRole:"Parent",to:"Ms. Nadia",subj:"Re: Physics Exam Prep",body:"Thank you for the update. We will ensure Zain revises this weekend. Could you please share a list of the most important topics so we can focus accordingly?",time:"1h ago",unread:false,instId:"INS001"},
  ],
  notices:[
    {id:1,title:"Annual Exam Schedule Released",  date:"Mar 12",cat:"Academic",body:"Annual examinations will begin April 15. Detailed timetable is on the school notice board and has been emailed to all parents.",instId:"INS001"},
    {id:2,title:"Fee Deadline — March 2026",      date:"Mar 10",cat:"Finance", body:"Last date to submit March fees without late penalty is March 20. Parents are requested to clear dues promptly.",instId:"INS001"},
    {id:3,title:"Annual Science Fair Open",       date:"Mar 8", cat:"Event",   body:"Registrations for the Annual Science Fair are now open. Students may register at the reception by March 18.",instId:"INS001"},
    {id:4,title:"Revised Summer Timings",         date:"Mar 5", cat:"General", body:"From April 1, school hours will change to 7:30 AM – 1:00 PM. Please adjust drop-off and pick-up accordingly.",instId:"INS001"},
  ],
});

// ═══════════════════════════════════════════════════════════════════
// HELPERS & ATOMS
// ═══════════════════════════════════════════════════════════════════
const ini = n => n.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
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
const Inp=({label,type="text",value,onChange,placeholder,style={}})=>(
  <div style={{marginBottom:14,...style}}>
    {label&&<div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:".6px"}}>{label}</div>}
    <input type={type} value={value||""} onChange={onChange} placeholder={placeholder}
      style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,outline:"none",transition:"border-color .15s"}}
      onFocus={e=>e.target.style.borderColor=T.forest} onBlur={e=>e.target.style.borderColor=T.border}/>
  </div>
);
const Sel=({label,options,value,onChange,style={}})=>(
  <div style={{marginBottom:14,...style}}>
    {label&&<div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:".6px"}}>{label}</div>}
    <select value={value||""} onChange={onChange} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,outline:"none"}}>
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
const Sidebar=({nav,tab,setTab,user,inst,collapsed,setCollapsed,onLogout})=>{
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
        <div onClick={()=>setCollapsed(c=>!c)} style={{cursor:"pointer",color:T.muted,fontSize:20,flexShrink:0,lineHeight:1,marginLeft:"auto",userSelect:"none"}}>{collapsed?"›":"‹"}</div>
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

const Shell=({nav,tab,setTab,user,inst,collapsed,setCollapsed,onLogout,children})=>(
  <div style={{display:"flex",minHeight:"100vh",background:T.bg}}>
    <style>{css}</style>
    <Sidebar nav={nav} tab={tab} setTab={setTab} user={user} inst={inst} collapsed={collapsed} setCollapsed={setCollapsed} onLogout={onLogout}/>
    <main style={{flex:1,padding:"28px 34px",overflowY:"auto",minWidth:0,animation:"fadeUp .38s ease"}}>{children}</main>
  </div>
);

// ═══════════════════════════════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════════════════════════════
const Landing=({onLogin,onSignup})=>{
  const [demoOpen,setDemoOpen]=useState(false);
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
      <nav style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:"14px 64px",display:"flex",alignItems:"center",gap:20,position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 12px rgba(0,0,0,.04)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginRight:"auto"}}>
          <div style={{width:36,height:36,borderRadius:10,background:T.forest,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 12px ${T.forest}55`}}><span style={{color:"#fff",fontSize:16}}>✦</span></div>
          <div><div style={{fontSize:16,fontWeight:800,color:T.ink,fontFamily:"Georgia,serif"}}>EduConnect</div><div style={{fontSize:9,color:T.muted,fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase"}}>SaaS Platform</div></div>
        </div>
        {["Features","Pricing","About","Contact"].map(l=><span key={l} style={{fontSize:13,color:T.muted,cursor:"pointer",fontWeight:500,transition:"color .15s"}}>{l}</span>)}
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
          <Btn onClick={()=>setDemoOpen(true)} out color="rgba(255,255,255,.5)" style={{padding:"15px 36px",fontSize:15,color:"rgba(255,255,255,.8)",borderRadius:12}}>View Demo Portals</Btn>
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
      <div style={{padding:"88px 64px",maxWidth:1280,margin:"0 auto"}}>
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
      <div style={{background:T.paper,padding:"88px 64px"}}>
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
        <div style={{display:"flex",gap:20}}>{["Privacy","Terms","Support"].map(l=><span key={l} style={{fontSize:12,color:"rgba(255,255,255,.35)",cursor:"pointer"}}>{l}</span>)}</div>
      </div>
      {demoOpen&&<Modal title="Live Demo Credentials" onClose={()=>setDemoOpen(false)} width={460}>
        <p style={{fontSize:13,color:T.muted,marginBottom:18,lineHeight:1.7}}>Use these to explore all four portals. Each shows a different role and permission level.</p>
        {[["🔑 Super Admin","sa@educonnect.io","super123","Full platform control — all institutes, revenue, users"],["🏫 Institute Admin","admin@bhs.edu","admin123","Manage Beaconhouse — students, teachers, parents, fees"],["📖 Teacher","hassan@bhs.edu","teach123","Mr. Hassan — Mathematics classes, gradebook, attendance"],["👨‍👩‍👦 Parent","sara@gmail.com","par123","Sara Ahmed — Zain's grades, attendance, messages, fees"]].map(([role,email,pass,desc])=>(
          <div key={role} style={{padding:"14px",background:T.paper,borderRadius:12,marginBottom:10,border:`1px solid ${T.border}`}}>
            <div style={{fontSize:13,fontWeight:700,color:T.forest,marginBottom:4}}>{role}</div>
            <div style={{fontSize:13,color:T.ink,marginBottom:2}}>Email: <b>{email}</b></div>
            <div style={{fontSize:13,color:T.ink,marginBottom:4}}>Password: <b>{pass}</b></div>
            <div style={{fontSize:11,color:T.muted}}>{desc}</div>
          </div>
        ))}
        <Btn onClick={onLogin} full style={{marginTop:6}}>→ Go to Login</Btn>
      </Modal>}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════
const Login=({onLogin,onBack,onSignup,db})=>{
  const[email,setEmail]=useState("");
  const[pass,setPass]=useState("");
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);
  const submit=()=>{
    if(!email||!pass){setErr("Please fill all fields.");return;}
    setLoading(true);setErr("");
    setTimeout(()=>{
      const u=db.users.find(u=>u.email===email&&u.pass===pass);
      if(u) onLogin(u); else setErr("Invalid email or password. Use the quick-fill below.");
      setLoading(false);
    },700);
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
          {[["Super Admin","sa@educonnect.io","super123",T.ink],["Institute Admin","admin@bhs.edu","admin123",T.forest],["Teacher","hassan@bhs.edu","teach123",T.purple],["Parent","sara@gmail.com","par123",T.blue]].map(([r,e,p,c])=>(
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
                <Inp label="Contact Phone*" value={f.phone} onChange={e=>set("phone",e.target.value)} placeholder="042-000-000"/>
                <Inp label="Official Email*" value={f.email} onChange={e=>set("email",e.target.value)} placeholder="info@school.edu" type="email" style={{gridColumn:"1/-1"}}/>
                <Inp label="Approx. No. of Students" value={f.students} onChange={e=>set("students",e.target.value)} placeholder="e.g. 500" type="number" style={{gridColumn:"1/-1"}}/>
              </div>
              <Btn onClick={()=>f.name&&f.city&&f.email?setStep(2):null} full style={{padding:"12px",fontSize:14,borderRadius:11,marginTop:4}} disabled={!f.name||!f.city||!f.email}>Next: Choose Your Plan →</Btn>
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
                <Inp label="Admin Phone" value={f.adminPhone} onChange={e=>set("adminPhone",e.target.value)} placeholder="0300-0000000"/>
                <Inp label="Password*" value={f.adminPass} onChange={e=>set("adminPass",e.target.value)} placeholder="Min 8 characters" type="password" style={{gridColumn:"1/-1"}}/>
              </div>
              <div style={{background:T.paper,borderRadius:12,padding:"16px",marginBottom:18,border:`1px solid ${T.border}`}}>
                <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:".5px"}}>Registration Summary</div>
                {[[f.name||"—","Institute"],[f.city||"—","City"],[selPlan?.name||"—","Plan"],[`Rs. ${(selPlan?.price||0).toLocaleString()}`,"Monthly Fee"]].map(([v,l])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5}}>
                    <span style={{color:T.muted}}>{l}</span><span style={{fontWeight:700,color:T.ink}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:10}}>
                <Btn onClick={()=>setStep(2)} out color={T.muted} style={{flex:1,padding:"11px",borderRadius:11}}>← Back</Btn>
                <Btn onClick={()=>f.adminName&&f.adminEmail&&f.adminPass&&setDone(true)} style={{flex:2,padding:"11px",borderRadius:11}} disabled={!f.adminName||!f.adminEmail||!f.adminPass}>Complete Registration ✓</Btn>
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
const SuperAdmin=({user,db,setDb,onLogout})=>{
  const[tab,setTab]=useState("dashboard");
  const[col,setCol]=useState(false);
  const[modal,setModal]=useState(null);
  const[selInst,setSelInst]=useState(null);
  const nav=[{id:"dashboard",label:"Dashboard",icon:"⊞"},{id:"institutes",label:"Institutes",icon:"🏫"},{id:"revenue",label:"Revenue",icon:"◑"},{id:"users",label:"Users",icon:"◉"},{id:"settings",label:"Settings",icon:"⚙"}];
  const insts=db.institutes;
  const totS=insts.reduce((a,i)=>a+i.students,0);
  const totT=insts.reduce((a,i)=>a+i.teachers,0);
  const mrr=insts.reduce((a,i)=>{const pl=PLANS.find(p=>p.id===i.plan);return a+(pl?.price||0);},0);

  return(
    <Shell nav={nav} tab={tab} setTab={setTab} user={user} inst={{name:"EduConnect HQ",logo:"✦",color:T.ink}} collapsed={col} setCollapsed={setCol} onLogout={onLogout}>
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
              {insts.map(i=>{const pl=PLANS.find(p=>p.id===i.plan); return(
                <div key={i.id} onClick={()=>setSelInst(selInst?.id===i.id?null:i)} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 0",borderBottom:`1px solid ${T.border}`,cursor:"pointer"}}>
                  <div style={{width:44,height:44,borderRadius:13,background:`${pl?.color||T.forest}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{i.logo}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:600,color:T.ink}}>{i.name}</div>
                    <div style={{fontSize:12,color:T.muted}}>{i.city} · {i.students} students · {i.teachers} teachers</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <Bdg label={pl?.name||i.plan} color={pl?.color||T.forest} bg={`${pl?.color||T.forest}18`}/>
                    <div style={{fontSize:11,color:T.success,marginTop:4,fontWeight:600}}>Rs. {pl?.price.toLocaleString()}/mo</div>
                  </div>
                </div>
              );})}
            </Crd>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Plan Distribution</div>
                {PLANS.map(pl=>{const n=insts.filter(i=>i.plan===pl.id).length; return(
                  <div key={pl.id} style={{marginBottom:13}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:T.muted}}>{pl.name}</span><span style={{fontSize:12,fontWeight:700,color:pl.color}}>{n} schools</span></div>
                    <Bar val={n/insts.length*100} color={pl.color}/>
                  </div>
                );})}
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Revenue by Plan</div>
                {PLANS.map(pl=>{const rev=insts.filter(i=>i.plan===pl.id).length*pl.price; return(
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
                {[["Broadcast Notification",T.purple],["Export All Data",T.blue],["Platform Settings",T.forest]].map(([l,c])=>(
                  <Btn key={l} out color={c} full style={{marginBottom:8,padding:"9px",fontSize:12}}>{l}</Btn>
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
                {[[selInst.students,"Students",T.forest],[selInst.teachers,"Teachers",T.purple],["Active","Status",T.success],[PLANS.find(p=>p.id===selInst.plan)?.name,"Plan",T.blue]].map(([v,l,c])=>(
                  <div key={l} style={{padding:"12px",background:T.paper,borderRadius:12,textAlign:"center"}}>
                    <div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:c}}>{v}</div>
                    <div style={{fontSize:10,color:T.muted,marginTop:3}}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:10,marginTop:16}}>
                {[["View Admin Portal",T.forest],["Upgrade Plan",T.blue],["Suspend Institute",T.danger]].map(([l,c])=>(
                  <Btn key={l} out color={c} style={{padding:"8px 16px",fontSize:12}}>{l}</Btn>
                ))}
              </div>
            </Crd>
          )}
        </div>
      )}
      {tab==="institutes"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Management" title="All Institutes" action={<Btn onClick={()=>setModal("addInst")} style={{marginBottom:4}}>+ Onboard Institute</Btn>}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
            {insts.map(i=>{const pl=PLANS.find(p=>p.id===i.plan); return(
              <Crd key={i.id} style={{padding:"24px"}}>
                <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:16}}>
                  <div style={{width:48,height:48,borderRadius:14,background:`${pl?.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{i.logo}</div>
                  <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:T.ink}}>{i.name}</div><div style={{fontSize:12,color:T.muted}}>{i.city} · {i.email}</div></div>
                  <Bdg label={i.status} color={T.success} bg={`${T.success}15`}/>
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
                  <Bdg label={pl?.name} color={pl?.color} bg={`${pl?.color}18`}/>
                  <span style={{fontSize:13,fontWeight:700,color:T.forest}}>Rs. {pl?.price.toLocaleString()}/mo</span>
                </div>
                <div style={{fontSize:11,color:T.muted,marginBottom:12}}>Joined: {i.joined}</div>
                <div style={{display:"flex",gap:8}}>
                  <Btn out color={T.forest} style={{flex:1,padding:"8px",fontSize:12,textAlign:"center"}}>Manage</Btn>
                  <Btn out color={T.blue} style={{flex:1,padding:"8px",fontSize:12,textAlign:"center"}}>Upgrade</Btn>
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
            <KPI label="Monthly Recurring" value={`Rs. ${mrr.toLocaleString()}`} color={T.forest} icon="◑" sub="Current MRR"/>
            <KPI label="Annual Run Rate" value={`Rs. ${(mrr*12/1000).toFixed(0)}K`} color={T.blue} icon="◈" sub="Projected ARR"/>
            <KPI label="Projected MRR (6mo)" value={`Rs. ${(mrr*1.2/1000).toFixed(0)}K`} color={T.purple} icon="↑" sub="+20% growth est."/>
          </div>
          <Crd style={{padding:"26px"}}>
            <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Invoice History</div>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Institute","Plan","Amount","Period","Status","Action"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
              <tbody>
                {insts.map((i,idx)=>{const pl=PLANS.find(p=>p.id===i.plan); return(
                  <tr key={i.id} style={{borderBottom:`1px solid ${T.border}`}}>
                    <td style={{padding:"12px"}}><div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:18}}>{i.logo}</span><span style={{fontSize:13,fontWeight:600,color:T.ink}}>{i.name}</span></div></td>
                    <td style={{padding:"12px"}}><Bdg label={pl?.name} color={pl?.color} bg={`${pl?.color}18`}/></td>
                    <td style={{padding:"12px",fontSize:13,fontWeight:700,color:T.forest}}>Rs. {pl?.price.toLocaleString()}</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>March 2026</td>
                    <td style={{padding:"12px"}}><Bdg label={idx===0?"✓ Paid":"⏳ Pending"} color={idx===0?T.success:T.warning} bg={idx===0?`${T.success}15`:`${T.warning}15`}/></td>
                    <td style={{padding:"12px"}}><Btn out color={T.forest} style={{padding:"5px 12px",fontSize:11}}>View</Btn></td>
                  </tr>
                );})}
              </tbody>
            </table>
          </Crd>
        </div>
      )}
      {tab==="users"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Platform" title="All Users"/>
          <Crd style={{padding:"26px"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Name","Role","Institute","Email","Status"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
              <tbody>
                {db.users.map((u,i)=>{
                  const inst=db.institutes.find(x=>x.id===u.inst);
                  const rc={superadmin:T.ink,admin:T.forest,teacher:T.purple,parent:T.blue}[u.role]||T.muted;
                  return(
                    <tr key={u.id} style={{borderBottom:`1px solid ${T.border}`}}>
                      <td style={{padding:"12px"}}><div style={{display:"flex",gap:10,alignItems:"center"}}><Av name={u.name} size={32} bg={`${rc}18`} color={rc} fs={11}/><span style={{fontSize:13,fontWeight:600,color:T.ink}}>{u.name}</span></div></td>
                      <td style={{padding:"12px"}}><Bdg label={u.role} color={rc} bg={`${rc}15`}/></td>
                      <td style={{padding:"12px",fontSize:13,color:T.muted}}>{inst?.name||"EduConnect HQ"}</td>
                      <td style={{padding:"12px",fontSize:13,color:T.muted}}>{u.email}</td>
                      <td style={{padding:"12px"}}><Bdg label="Active" color={T.success} bg={`${T.success}15`}/></td>
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
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Crd style={{padding:"26px"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>General Settings</div>
              <Inp label="Platform Name" placeholder="EduConnect"/>
              <Inp label="Support Email" placeholder="support@educonnect.io"/>
              <Inp label="Default Currency" placeholder="PKR"/>
              <Inp label="Trial Duration (days)" placeholder="14" type="number"/>
              <Btn full style={{padding:"11px",marginTop:4}}>Save Changes</Btn>
            </Crd>
            <Crd style={{padding:"26px"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Platform Stats</div>
              {[["Total Institutes",insts.length],["Total Students",totS.toLocaleString()],["Total Teachers",totT],["Monthly Revenue",`Rs. ${mrr.toLocaleString()}`],["Platform Uptime","99.97%"],["Avg. Satisfaction","4.9 / 5"]].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
                  <span style={{fontSize:13,color:T.muted}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:700,color:T.ink}}>{v}</span>
                </div>
              ))}
            </Crd>
          </div>
        </div>
      )}
      {modal==="addInst"&&<Modal title="Onboard New Institute" onClose={()=>setModal(null)}>
        <Inp label="Institute Name" placeholder="e.g. The City School"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Inp label="City" placeholder="e.g. Karachi"/>
          <Inp label="Contact" placeholder="021-000-000"/>
        </div>
        <Inp label="Admin Email" placeholder="admin@school.edu" type="email"/>
        <Sel label="Plan" options={PLANS.map(p=>({v:p.id,l:`${p.name} — Rs. ${p.price.toLocaleString()}/mo`}))} value="" onChange={()=>{}}/>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn onClick={()=>setModal(null)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={()=>setModal(null)} style={{flex:2,padding:"11px"}}>Create & Send Credentials</Btn>
        </div>
      </Modal>}
    </Shell>
  );
};

// ═══════════════════════════════════════════════════════════════════
// INSTITUTE ADMIN PORTAL
// ═══════════════════════════════════════════════════════════════════
const AdminPortal=({user,db,setDb,onLogout})=>{
  const[tab,setTab]=useState("dashboard");
  const[col,setCol]=useState(false);
  const[modal,setModal]=useState(null);
  const[selStu,setSelStu]=useState(null);
  const inst=db.institutes.find(i=>i.id===user.inst)||db.institutes[0];
  const plan=PLANS.find(p=>p.id===inst.plan);
  const students=db.students.filter(s=>s.instId===user.inst);
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

  const UserModal=({type})=>{
    const[f,setF]=useState({name:"",email:"",phone:"",grade:"",section:"",roll:"",subject:"",rel:"",child:""});
    const s=(k,v)=>setF(x=>({...x,[k]:v}));
    const subjectOptions=["Mathematics","Physics","Chemistry","Biology","English","Urdu","Computer Sc.","Pak. Studies"];
    return(
      <Modal title={`Add New ${type}`} onClose={()=>setModal(null)} width={500}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Inp label="Full Name*" value={f.name} onChange={e=>s("name",e.target.value)} placeholder={type==="Student"?"Zain Ahmed":type==="Teacher"?"Mr. Hassan":"Sara Ahmed"} style={{gridColumn:"1/-1"}}/>
          <Inp label="Email*" value={f.email} onChange={e=>s("email",e.target.value)} placeholder="email@example.com" type="email"/>
          <Inp label="Phone" value={f.phone} onChange={e=>s("phone",e.target.value)} placeholder="0300-0000000"/>
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
          <div style={{fontSize:12,color:T.forest,fontWeight:700,marginBottom:3}}>🔑 Auto-generated Login</div>
          <div style={{fontSize:12,color:T.muted}}>A login email and temporary password will be automatically generated and sent to <b>{f.email||"the provided email"}</b>.</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={()=>setModal(null)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={()=>setModal(null)} style={{flex:2,padding:"11px"}} disabled={!f.name||!f.email}>Create & Send Login</Btn>
        </div>
      </Modal>
    );
  };

  return(
    <Shell nav={nav} tab={tab} setTab={setTab} user={user} inst={inst} collapsed={col} setCollapsed={setCol} onLogout={onLogout}>
      {/* DASHBOARD */}
      {tab==="dashboard"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre={inst.name} title="Admin Dashboard"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
            <KPI label="Students" value={inst.students} color={T.forest} icon="◈" sub={`${plan?.maxStudents===9999?"Unlimited":plan?.maxStudents} limit`}/>
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
                <div key={s.id} onClick={()=>setSelStu(selStu?.id===s.id?null:s)} style={{display:"flex",gap:12,alignItems:"center",padding:"11px 0",borderBottom:`1px solid ${T.border}`,cursor:"pointer",background:selStu?.id===s.id?`${T.forest}05`:"transparent",borderRadius:selStu?.id===s.id?8:0,padding:"11px 6px"}}>
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
                <div style={{display:"flex",justifyContent:"center",marginBottom:12}}><Donut p={87} color={T.forest} size={84}/></div>
                <div style={{fontSize:12,color:T.muted,textAlign:"center",marginBottom:10}}>87% of students present today</div>
                {[["Present","87%",T.success],["Absent","8%",T.danger],["Late","5%",T.warning]].map(([l,v,c])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0"}}><div style={{display:"flex",gap:6,alignItems:"center"}}><div style={{width:7,height:7,borderRadius:"50%",background:c}}/><span style={{fontSize:12,color:T.muted}}>{l}</span></div><span style={{fontSize:12,fontWeight:700,color:c}}>{v}</span></div>
                ))}
              </Crd>
              <Crd style={{padding:"22px",border:`1.5px solid ${T.warning}44`}}>
                <div style={{fontSize:11,fontWeight:700,color:T.warning,textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>⚠ Fee Alert</div>
                <div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:800,color:T.ink}}>Rs. 87,500</div>
                <div style={{fontSize:12,color:T.muted,marginTop:4}}>Pending from 7 students</div>
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
                {[["GPA",selStu.gpa,T.forest],["Rank",`#${selStu.rank}`,T.purple],["Attendance",`${selStu.att.present}%`,T.success],["AI Score","82/100",T.gold]].map(([l,v,c])=>(
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
                <thead><tr>{["Student","Grade","Roll No","GPA","Attendance","Fees","Status"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                <tbody>{students.map(s=>(
                  <tr key={s.id} onClick={()=>setSelStu(selStu?.id===s.id?null:s)} style={{borderBottom:`1px solid ${T.border}`,cursor:"pointer",background:selStu?.id===s.id?`${T.forest}07`:"transparent",transition:"background .1s"}}>
                    <td style={{padding:"12px"}}><div style={{display:"flex",gap:10,alignItems:"center"}}><Av name={s.name} size={32} bg={`${T.forest}18`} color={T.forest} fs={11}/><span style={{fontSize:13,fontWeight:600,color:T.ink}}>{s.name}</span></div></td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{s.grade} {s.section}</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{s.roll}</td>
                    <td style={{padding:"12px",fontSize:13,fontWeight:700,color:T.forest}}>{s.gpa}</td>
                    <td style={{padding:"12px",fontSize:13,color:s.att.present>=90?T.success:T.warning,fontWeight:600}}>{s.att.present}%</td>
                    <td style={{padding:"12px"}}><Bdg label={s.fees.some(f=>f.status==="pending")?"Pending":"Paid"} color={s.fees.some(f=>f.status==="pending")?T.warning:T.success} bg={s.fees.some(f=>f.status==="pending")?`${T.warning}15`:`${T.success}15`}/></td>
                    <td style={{padding:"12px"}}><Bdg label="Active" color={T.success} bg={`${T.success}15`}/></td>
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
                  {[["GPA",selStu.gpa,T.forest],["Rank",`#${selStu.rank}`,T.purple],["Att.",`${selStu.att.present}%`,T.success],["AI","82",T.gold]].map(([l,v,c])=>(
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
                <div style={{display:"flex",gap:8,marginTop:16}}>
                  <Btn out color={T.forest} style={{flex:1,padding:"8px",fontSize:12}}>Edit</Btn>
                  <Btn out color={T.blue} style={{flex:1,padding:"8px",fontSize:12}}>Reset PW</Btn>
                  <Btn out color={T.danger} style={{flex:1,padding:"8px",fontSize:12}}>Remove</Btn>
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
                  <Bdg label={t.status} color={T.success} bg={`${T.success}15`}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
                  {[[t.classes.length,"Classes"],[t.students,"Students"],["4.8★","Rating"]].map(([v,l])=>(
                    <div key={l} style={{padding:"10px",background:T.paper,borderRadius:10,textAlign:"center"}}>
                      <div style={{fontSize:17,fontWeight:800,color:T.ink}}>{v}</div>
                      <div style={{fontSize:10,color:T.muted}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:12,color:T.muted,marginBottom:14}}>Classes: {t.classes.join(", ")}</div>
                <div style={{display:"flex",gap:8}}>
                  <Btn out color={T.forest} style={{flex:1,padding:"8px",fontSize:12}}>View Classes</Btn>
                  <Btn out color={T.blue} style={{flex:1,padding:"8px",fontSize:12}}>Edit Profile</Btn>
                  <Btn out color={T.warning} style={{flex:1,padding:"8px",fontSize:12}}>Reset PW</Btn>
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
                    <td style={{padding:"12px"}}><div style={{display:"flex",gap:6}}><Bdg label="Edit" color={T.forest} bg={`${T.forest}15`} style={{cursor:"pointer"}}/><Bdg label="Reset PW" color={T.warning} bg={`${T.warning}15`} style={{cursor:"pointer"}}/></div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </Crd>
        </div>
      )}
      {/* ATTENDANCE */}
      {tab==="attendance"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Tracking" title="Attendance Management"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:18}}>
            <Crd style={{padding:"26px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink}}>Mark Attendance — Grade 8A</div>
                <Bdg label="Thursday, Mar 12, 2026" color={T.blue} bg={`${T.blue}15`}/>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Student","Roll","Status","Mark"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                <tbody>{students.map((s,i)=>{
                  const st=s.weekAtt[2]?.s||"present";
                  return(
                    <tr key={s.id} style={{borderBottom:`1px solid ${T.border}`}}>
                      <td style={{padding:"12px"}}><div style={{display:"flex",gap:8,alignItems:"center"}}><Av name={s.name} size={28} bg={`${T.forest}15`} color={T.forest} fs={10}/><span style={{fontSize:13,color:T.ink,fontWeight:500}}>{s.name}</span></div></td>
                      <td style={{padding:"12px",fontSize:12,color:T.muted}}>{s.roll}</td>
                      <td style={{padding:"12px"}}><AttBadge s={st}/></td>
                      <td style={{padding:"12px"}}>
                        <div style={{display:"flex",gap:6}}>
                          {[["P","present",T.success],["A","absent",T.danger],["L","late",T.warning]].map(([lbl,sv,c])=>(
                            <span key={sv} style={{padding:"5px 11px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",background:st===sv?c:"transparent",color:st===sv?"#fff":c,border:`1.5px solid ${c}`,transition:"all .15s"}}>{lbl}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
              <Btn full style={{marginTop:18,padding:"12px"}}>Save Attendance Record</Btn>
            </Crd>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>School-Wide Today</div>
                <div style={{display:"flex",justifyContent:"center",marginBottom:14}}><Donut p={87} color={T.forest} size={90}/></div>
                {[["Present","87",T.success],["Absent","8",T.danger],["Late","5",T.warning]].map(([l,v,c])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:13,color:T.muted}}>{l}</span><span style={{fontSize:13,fontWeight:700,color:c}}>{v} students</span>
                  </div>
                ))}
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Monthly Summary</div>
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
      )}
      {/* FEES */}
      {tab==="fees"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Finance" title="Fee Management"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
            <KPI label="Total Due (March)" value="Rs. 1,50,000" color={T.ink} icon="◑" sub="All students"/>
            <KPI label="Collected" value="Rs. 62,500" color={T.success} icon="✓" sub="5 students"/>
            <KPI label="Pending" value="Rs. 87,500" color={T.warning} icon="⏳" sub="7 students"/>
            <KPI label="Defaulters" value="3" color={T.danger} icon="⚠" sub=">30 days overdue"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:18}}>
            <Crd style={{padding:"26px"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Student Fee Status — March 2026</div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Student","Grade","Amount","Due","Paid On","Status","Action"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                <tbody>{students.map(s=>s.fees.map((f,j)=>(
                  <tr key={`${s.id}-${j}`} style={{borderBottom:`1px solid ${T.border}`}}>
                    <td style={{padding:"12px",fontSize:13,fontWeight:600,color:T.ink}}>{s.name}</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{s.grade}</td>
                    <td style={{padding:"12px",fontSize:13}}>Rs. {f.amt.toLocaleString()}</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>20th</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{f.date||"—"}</td>
                    <td style={{padding:"12px"}}><Bdg label={f.status==="paid"?"✓ Paid":"⏳ Pending"} color={f.status==="paid"?T.success:T.warning} bg={f.status==="paid"?`${T.success}15`:`${T.warning}15`}/></td>
                    <td style={{padding:"12px"}}>{f.status!=="paid"&&<Btn style={{padding:"5px 12px",fontSize:11}}>Mark Paid</Btn>}</td>
                  </tr>
                )))}</tbody>
              </table>
            </Crd>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>Fee Breakdown / Student</div>
                {[["Tuition","Rs. 10,000"],["Lab Charges","Rs. 1,000"],["Library","Rs. 500"],["Sports","Rs. 500"],["Miscellaneous","Rs. 500"]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:12,color:T.muted}}>{l}</span><span style={{fontSize:12,fontWeight:600,color:T.ink}}>{v}</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0"}}><span style={{fontSize:13,fontWeight:700,color:T.ink}}>Monthly Total</span><span style={{fontSize:14,fontWeight:800,color:T.forest}}>Rs. 12,500</span></div>
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>Actions</div>
                {[["Send Reminders (Pending)",T.warning],["Download Fee Report",T.blue],["Adjust Fee Structure",T.forest]].map(([l,c])=>(
                  <Btn key={l} out color={c} full style={{marginBottom:8,padding:"9px",fontSize:12}}>{l}</Btn>
                ))}
              </Crd>
            </div>
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
                  <Bdg label={n.cat} color={catC(n.cat)} bg={`${catC(n.cat)}15`}/>
                  <span style={{fontSize:12,color:T.muted}}>{n.date}</span>
                </div>
                <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:T.ink,marginBottom:8,lineHeight:1.3}}>{n.title}</div>
                <p style={{fontSize:13,color:T.muted,lineHeight:1.7,marginBottom:14}}>{n.body}</p>
                <div style={{display:"flex",gap:8}}>
                  <Bdg label="Edit" color={T.forest} bg={`${T.forest}15`} style={{cursor:"pointer"}}/>
                  <Bdg label="Delete" color={T.danger} bg={`${T.danger}15`} style={{cursor:"pointer"}}/>
                </div>
              </Crd>
            ))}
          </div>
        </div>
      )}
      {/* REPORTS */}
      {tab==="reports"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Analytics" title="Reports & Exports"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
            {[["◈","Academic Report","Subject-wise performance for all students, class averages, and grade distributions.",T.purple],["◷","Attendance Report","Monthly attendance summary, absentee lists, and punctuality analysis.",T.blue],["◑","Fee Collection Report","Collected vs. pending fees, defaulter list, and monthly projections.",T.success],["✦","AI Insights Report","At-risk students, predicted performance, and personalized recommendations.",T.gold],["◉","Teacher Performance","Class results by teacher, student satisfaction, and subject averages.",T.forest],["▦","Custom Report","Build your own report by selecting metrics, date ranges, and filters.",T.muted]].map(([ic,t,d,c])=>(
              <Crd key={t} style={{padding:"26px",cursor:"pointer",transition:"transform .2s,box-shadow .2s"}}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 12px 36px rgba(0,0,0,.1)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
                <div style={{width:48,height:48,borderRadius:14,background:`${c}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:c,marginBottom:16}}>{ic}</div>
                <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:T.ink,marginBottom:8}}>{t}</div>
                <p style={{fontSize:13,color:T.muted,lineHeight:1.65,marginBottom:16}}>{d}</p>
                <Btn out color={c} style={{padding:"8px 18px",fontSize:12}}>Generate PDF</Btn>
              </Crd>
            ))}
          </div>
        </div>
      )}
      {/* SETTINGS */}
      {tab==="settings"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Configuration" title="Institute Settings"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
            <Crd style={{padding:"26px"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Institute Information</div>
              <Inp label="Institute Name" placeholder={inst.name}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Inp label="City" placeholder={inst.city}/>
                <Inp label="Phone" placeholder={inst.phone}/>
              </div>
              <Inp label="Official Email" placeholder={inst.email} type="email"/>
              <Inp label="Website" placeholder="www.school.edu"/>
              <Btn full style={{padding:"11px",marginTop:4}}>Save Changes</Btn>
            </Crd>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <Crd style={{padding:"26px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:16}}>Current Subscription</div>
                <div style={{padding:"18px",background:G(`${T.forest}15`,`${T.mint}15`),borderRadius:14,marginBottom:16,border:`1px solid ${T.forest}25`}}>
                  <div style={{fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Active Plan</div>
                  <div style={{fontFamily:"Georgia,serif",fontSize:26,fontWeight:800,color:T.forest}}>{plan?.name}</div>
                  <div style={{fontSize:13,color:T.muted,marginTop:4}}>Rs. {plan?.price.toLocaleString()}/month · Up to {plan?.maxStudents===9999?"unlimited":plan?.maxStudents.toLocaleString()} students</div>
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:11,color:T.muted,marginBottom:4}}>Usage: {inst.students}/{plan?.maxStudents===9999?"∞":plan?.maxStudents} students</div>
                    {plan?.maxStudents!==9999&&<Bar val={inst.students/plan.maxStudents*100} color={T.forest}/>}
                  </div>
                </div>
                <Btn full style={{marginBottom:10,padding:"11px"}}>Upgrade Plan</Btn>
                <Btn out color={T.danger} full style={{padding:"11px",fontSize:13}}>Cancel Subscription</Btn>
              </Crd>
              <Crd style={{padding:"26px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:16}}>Notifications</div>
                {[["Fee reminders to parents",true],["Attendance alerts",true],["AI weekly reports",false],["Exam notifications",true]].map(([l,on])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:13,color:T.ink}}>{l}</span>
                    <Toggle on={on}/>
                  </div>
                ))}
              </Crd>
            </div>
          </div>
        </div>
      )}
      {modal&&["Student","Teacher","Parent"].includes(modal)&&<UserModal type={modal}/>}
      {modal==="notice"&&<Modal title="Post New Notice" onClose={()=>setModal(null)}>
        <Inp label="Title" placeholder="e.g. Annual Exam Schedule"/>
        <Sel label="Category" options={["Academic","Finance","Event","General"]} value="" onChange={()=>{}}/>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:".6px"}}>Message</div>
          <textarea rows={4} placeholder="Notice content…" style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,resize:"none",outline:"none"}}/>
        </div>
        <Sel label="Notify" options={["All (Students, Parents, Teachers)","Parents only","Teachers only","Everyone"]} value="" onChange={()=>{}}/>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn onClick={()=>setModal(null)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={()=>setModal(null)} style={{flex:2,padding:"11px"}}>Publish Notice</Btn>
        </div>
      </Modal>}
    </Shell>
  );
};

// ═══════════════════════════════════════════════════════════════════
// TEACHER PORTAL
// ═══════════════════════════════════════════════════════════════════
const TeacherPortal=({user,db,onLogout})=>{
  const[tab,setTab]=useState("dashboard");
  const[col,setCol]=useState(false);
  const[selMsg,setSelMsg]=useState(null);
  const[reply,setReply]=useState("");
  const[modal,setModal]=useState(null);
  const inst=db.institutes.find(i=>i.id===user.inst)||db.institutes[0];
  const teacher=db.teachers.find(t=>t.id===user.ref)||db.teachers[0];
  const myStudents=db.students.filter(s=>s.instId===user.inst);
  const msgs=db.messages.filter(m=>m.instId===user.inst);
  const notices=db.notices.filter(n=>n.instId===user.inst);

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
            <h1 style={{fontFamily:"Georgia,serif",fontSize:32,fontWeight:800,color:T.ink}}>Good morning, <em style={{color:T.green,fontStyle:"italic"}}>{teacher.name}!</em></h1>
            <p style={{color:T.muted,fontSize:14,marginTop:5}}>You teach {teacher.subject} across {teacher.classes.length} classes.</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
            <KPI label="My Classes" value={teacher.classes.length} color={T.forest} icon="▦" sub={teacher.subject}/>
            <KPI label="Students" value={teacher.students} color={T.purple} icon="◈" sub="Total enrolled"/>
            <KPI label="Avg Score" value="84%" color={T.success} icon="◈" sub="Class average"/>
            <KPI label="Avg Attendance" value="87%" color={T.blue} icon="◷" sub="Across all classes"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 280px",gap:18}}>
            <Crd style={{padding:"24px"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:16}}>My Students — {teacher.subject}</div>
              {myStudents.map(s=>{
                const sub=s.subjects.find(x=>x.teacher===teacher.name);
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
              {myStudents.map(s=>{
                const sub=s.subjects.find(x=>x.teacher===teacher.name);
                return sub?(
                  <div key={s.id} style={{display:"flex",gap:10,alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:12,color:T.muted,flex:1}}>{s.name}</span>
                    <input defaultValue={sub.score} style={{width:58,padding:"5px 8px",borderRadius:8,border:`1px solid ${T.border}`,fontSize:13,textAlign:"center",color:T.ink,background:T.paper,outline:"none"}}/>
                    <span style={{fontSize:11,color:T.muted}}>/ 100</span>
                    <Btn style={{padding:"5px 10px",fontSize:11}}>Save</Btn>
                  </div>
                ):null;
              })}
            </Crd>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>Today's Schedule</div>
                {[["8:00 AM","Grade 8A",teacher.subject],["9:20 AM","Grade 9B",teacher.subject],["10:40 AM","Grade 10A",teacher.subject],["1:00 PM","Grade 8B",teacher.subject]].map(([t,g,s])=>(
                  <div key={t} style={{display:"flex",gap:10,alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:11,color:T.muted,width:62,flexShrink:0,fontWeight:600}}>{t}</span>
                    <div><div style={{fontSize:12,fontWeight:600,color:T.ink}}>{g}</div><div style={{fontSize:11,color:T.muted}}>{s}</div></div>
                  </div>
                ))}
              </Crd>
              <Crd style={{padding:"22px",border:`1.5px solid ${T.gold}44`,background:`linear-gradient(135deg,#fff,${T.gold}06)`}}>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:10}}><span style={{color:T.gold,animation:"shimmer 2s infinite"}}>✦</span><span style={{fontSize:10,fontWeight:700,color:T.gold,letterSpacing:"1.5px",textTransform:"uppercase"}}>AI Insights</span></div>
                <div style={{padding:"10px",background:`${T.danger}10`,borderRadius:10,marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.danger,marginBottom:3}}>⚠ At-Risk</div>
                  <div style={{fontSize:12,color:T.muted}}>Zain Ahmed — Chemistry declining 8%</div>
                </div>
                <div style={{padding:"10px",background:`${T.success}10`,borderRadius:10}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.success,marginBottom:3}}>↑ Top Performer</div>
                  <div style={{fontSize:12,color:T.muted}}>Ayesha Khan — consistent 90%+</div>
                </div>
              </Crd>
            </div>
          </div>
        </div>
      )}
      {tab==="classes"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Teaching" title="My Classes"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
            {teacher.classes.map(cls=>(
              <Crd key={cls} style={{padding:"26px"}}>
                <div style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:800,color:T.forest,marginBottom:4}}>Grade {cls}</div>
                <div style={{fontSize:13,color:T.muted,marginBottom:18}}>{teacher.subject}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                  {[["~42","Students"],["87%","Avg Att."],["82%","Avg Score"],["4","Assessments"]].map(([v,l])=>(
                    <div key={l} style={{padding:"12px",background:T.paper,borderRadius:12,textAlign:"center"}}>
                      <div style={{fontSize:18,fontWeight:800,color:T.ink}}>{v}</div>
                      <div style={{fontSize:10,color:T.muted,marginTop:2}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <Btn out color={T.forest} style={{flex:1,padding:"9px",fontSize:12,textAlign:"center"}}>Students</Btn>
                  <Btn style={{flex:1,padding:"9px",fontSize:12,textAlign:"center"}}>Attendance</Btn>
                </div>
              </Crd>
            ))}
          </div>
        </div>
      )}
      {tab==="gradebook"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Academic" title={`Grade Book — ${teacher.subject}`} action={<Btn onClick={()=>setModal("assessment")} style={{marginBottom:4}}>+ Add Assessment</Btn>}/>
          <Crd style={{padding:"26px"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Student","Quiz 1","Quiz 2","Test 1","Test 2","Project","Avg.","Grade","Trend"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
              <tbody>{myStudents.map(s=>{
                const sub=s.subjects.find(x=>x.teacher===teacher.name);
                if(!sub) return null;
                const scores=[sub.prev-2,sub.prev,sub.prev+3,sub.score-2,sub.score];
                const avg=Math.round(scores.reduce((a,b)=>a+b)/scores.length);
                return(
                  <tr key={s.id} style={{borderBottom:`1px solid ${T.border}`}}>
                    <td style={{padding:"12px"}}><div style={{display:"flex",gap:8,alignItems:"center"}}><Av name={s.name} size={28} bg={`${T.purple}18`} color={T.purple} fs={10}/><span style={{fontSize:13,color:T.ink,fontWeight:600}}>{s.name}</span></div></td>
                    {scores.map((sc,j)=><td key={j} style={{padding:"12px",fontSize:13,color:sc>=80?T.success:sc>=60?T.warning:T.danger,fontWeight:600}}>{sc}</td>)}
                    <td style={{padding:"12px",fontSize:15,fontWeight:800,color:T.ink,fontFamily:"Georgia,serif"}}>{avg}%</td>
                    <td style={{padding:"12px"}}><Bdg label={sub.grade} color={gc(sub.grade)} bg={`${gc(sub.grade)}15`}/></td>
                    <td style={{padding:"12px",fontSize:16,color:sub.pred>sub.score?T.success:T.danger}}>{sub.pred>sub.score?"↑":"↓"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </Crd>
        </div>
      )}
      {tab==="attendance"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Tracking" title="Take Attendance"/>
          <Crd style={{padding:"26px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink}}>Grade 8A — {teacher.subject}</div>
              <div style={{display:"flex",gap:10}}>
                <Bdg label="Thursday, Mar 12" color={T.blue} bg={`${T.blue}15`}/>
                <Btn out color={T.success} style={{padding:"7px 14px",fontSize:12}}>Mark All Present</Btn>
              </div>
            </div>
            {myStudents.map((s,i)=>{
              const st=s.weekAtt[3]?.s||"present";
              return(
                <div key={s.id} style={{display:"flex",gap:14,alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${T.border}`}}>
                  <Av name={s.name} size={36} bg={`${T.forest}15`} color={T.forest} fs={12}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:T.ink}}>{s.name}</div>
                    <div style={{fontSize:11,color:T.muted}}>{s.roll}</div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    {[["Present","present",T.success],["Absent","absent",T.danger],["Late","late",T.warning]].map(([l,sv,c])=>(
                      <span key={sv} style={{padding:"7px 16px",borderRadius:99,fontSize:12,fontWeight:600,cursor:"pointer",background:st===sv?c:"transparent",color:st===sv?"#fff":c,border:`1.5px solid ${c}`,transition:"all .15s"}}>{l}</span>
                    ))}
                  </div>
                </div>
              );
            })}
            <Btn full style={{marginTop:18,padding:"12px"}}>Save Attendance</Btn>
          </Crd>
        </div>
      )}
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
                {msgs.map(m=>(
                  <div key={m.id} onClick={()=>setSelMsg(m)} style={{padding:"13px 16px",cursor:"pointer",borderBottom:`1px solid ${T.border}`,background:selMsg?.id===m.id?`${T.forest}09`:"transparent",borderLeft:`3px solid ${selMsg?.id===m.id?T.forest:"transparent"}`,transition:"background .15s"}}>
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
                  <div style={{padding:"16px 26px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10}}>
                    <input value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>e.key==="Enter"&&setReply("")} placeholder={`Reply to ${selMsg.from}…`} style={{flex:1,background:T.paper,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"10px 16px",color:T.ink,fontSize:13,outline:"none"}}/>
                    <Btn onClick={()=>setReply("")}>Send</Btn>
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
              <Crd style={{padding:"26px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Edit Profile</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Inp label="Full Name" placeholder={teacher.name}/>
                  <Inp label="Phone" placeholder={teacher.phone}/>
                  <Inp label="Email" placeholder={teacher.email} type="email" style={{gridColumn:"1/-1"}}/>
                </div>
                <Btn full style={{padding:"11px",marginTop:4}}>Update Profile</Btn>
              </Crd>
              <Crd style={{padding:"26px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Change Password</div>
                {["Current Password","New Password","Confirm New Password"].map(l=><Inp key={l} label={l} type="password" placeholder="••••••••"/>)}
                <Btn full style={{padding:"11px",marginTop:4}}>Update Password</Btn>
              </Crd>
            </div>
          </div>
        </div>
      )}
      {modal==="assessment"&&<Modal title="Add New Assessment" onClose={()=>setModal(null)} width={440}>
        <Inp label="Assessment Title" placeholder="e.g. Quiz 3 / Test 2 / Project"/>
        <Sel label="Class" options={teacher.classes.map(c=>({v:c,l:`Grade ${c}`}))} value="" onChange={()=>{}}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Inp label="Date" placeholder="Mar 15, 2026"/>
          <Inp label="Total Marks" placeholder="20" type="number"/>
        </div>
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <Btn onClick={()=>setModal(null)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
          <Btn onClick={()=>setModal(null)} style={{flex:2,padding:"11px"}}>Create Assessment</Btn>
        </div>
      </Modal>}
    </Shell>
  );
};

// ═══════════════════════════════════════════════════════════════════
// PARENT PORTAL — FULL FEATURED
// ═══════════════════════════════════════════════════════════════════
const ParentPortal=({user,db,onLogout})=>{
  const[tab,setTab]=useState("dashboard");
  const[col,setCol]=useState(false);
  const[selMsg,setSelMsg]=useState(db.messages[0]);
  const[msgs,setMsgs]=useState(db.messages);
  const[reply,setReply]=useState("");
  const[sent,setSent]=useState(false);
  const[compose,setCompose]=useState(false);
  const[selNotice,setSelNotice]=useState(null);
  const[selSub,setSelSub]=useState(null);
  const inst=db.institutes.find(i=>i.id===user.inst)||db.institutes[0];
  const parent=db.parents.find(p=>p.id===user.ref)||db.parents[0];
  const student=db.students.find(s=>s.id===parent?.studentId)||db.students[0];
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

  const sendReply=()=>{if(!reply.trim())return;setSent(true);setReply("");setTimeout(()=>setSent(false),2500);};

  return(
    <Shell nav={nav} tab={tab} setTab={setTab} user={user} inst={inst} collapsed={col} setCollapsed={setCol} onLogout={onLogout}>
      {/* DASHBOARD */}
      {tab==="dashboard"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <div style={{marginBottom:24}}>
            <div style={{fontSize:10,fontWeight:700,color:T.muted,letterSpacing:"1.8px",textTransform:"uppercase",marginBottom:5}}>Thursday, March 12, 2026</div>
            <h1 style={{fontFamily:"Georgia,serif",fontSize:34,fontWeight:800,color:T.ink}}>Good morning, <em style={{color:T.green,fontStyle:"italic"}}>{parent?.name.split(" ")[0]}.</em></h1>
            <p style={{color:T.muted,fontSize:14,marginTop:5}}>Here's everything about <b>{student.name}</b>'s academic journey.</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
            <KPI label="GPA" value={student.gpa} color={T.forest} icon="◈" sub="Current semester"/>
            <KPI label="Class Rank" value={`#${student.rank}`} color={T.purple} icon="◆" sub={`of ${student.classSize} students`}/>
            <KPI label="Attendance" value={`${student.att.present}%`} color={T.success} icon="◷" sub="100 school days"/>
            <KPI label="AI Score" value={`82/100`} color={T.gold} icon="✦" sub="Excellent"/>
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
                <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:700,color:T.ink,lineHeight:1.3,marginBottom:8}}>Chemistry needs attention this week</div>
                <p style={{fontSize:12,color:T.muted,lineHeight:1.7}}>Score dropped 8% over 3 tests. AI predicts further decline without intervention.</p>
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
                <div style={{fontSize:11,color:T.clay,marginTop:8,fontWeight:600}}>⚠ March fee pending — due Mar 20</div>
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
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:16}}>Monthly Attendance 2025–26</div>
                <div style={{display:"flex",alignItems:"flex-end",gap:5,height:90,marginBottom:4}}>
                  {student.monthlyAtt.map((v,i)=>(
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                      <div style={{fontSize:8,color:T.muted,fontWeight:600}}>{v}</div>
                      <div style={{width:"100%",borderRadius:"3px 3px 0 0",background:i===2?G(T.mint,T.forest,"180deg"):T.border,height:`${(v/22)*65}px`,transition:`height 1s ${i*55}ms`}}/>
                      <span style={{fontSize:8,color:T.muted}}>{months[i]}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginTop:18}}>
                  {[["87","Present",T.forest],["8","Absent",T.danger],["5","Late",T.warning],["2","Leave",T.muted],["100","Total",T.ink],["87%","Rate",T.success]].map(([v,l,c])=>(
                    <div key={l} style={{padding:"10px 6px",background:T.paper,borderRadius:10,textAlign:"center"}}>
                      <div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:800,color:c}}>{v}</div>
                      <div style={{fontSize:9,color:T.muted,marginTop:2}}>{l}</div>
                    </div>
                  ))}
                </div>
              </Crd>
              <Crd style={{padding:"24px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:16}}>This Week — Mar 8–12</div>
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
              <Crd style={{padding:"22px",border:`1.5px solid ${T.gold}44`}}>
                <div style={{fontSize:10,fontWeight:700,color:T.gold,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:10}}>✦ AI Insight</div>
                <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:700,color:T.ink,marginBottom:8,lineHeight:1.3}}>Irregular Thursday arrivals detected</div>
                <p style={{fontSize:12,color:T.muted,lineHeight:1.7}}>Recurring late pattern on Thursdays. Departing 15 min earlier could resolve this and prevent grade impact.</p>
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>vs. Target</div>
                {[["Current",student.att.present,T.success],["Target",95,T.forest],["Minimum",75,T.muted]].map(([l,v,c])=>(
                  <div key={l} style={{marginBottom:13}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:T.muted}}>{l}</span><span style={{fontSize:12,fontWeight:700,color:c}}>{v}%</span></div>
                    <Bar val={v} color={c}/>
                  </div>
                ))}
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>Quick Stats</div>
                {[["Consecutive present days","12"],["Best month","Sep (22 days)"],["Punctuality rate","94%"],["Medical leaves","2"]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:12,color:T.muted}}>{l}</span><span style={{fontSize:12,fontWeight:700,color:T.ink}}>{v}</span>
                  </div>
                ))}
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
                <div style={{fontFamily:"Georgia,serif",fontSize:52,fontWeight:800,color:"#fff",lineHeight:1}}>{student.gpa}</div>
                <div style={{fontSize:13,color:"rgba(255,255,255,.6)",marginTop:8}}>Semester · Top 10% of class</div>
                <div style={{marginTop:14,height:4,background:"rgba(255,255,255,.15)",borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",width:"82%",background:T.mint,borderRadius:99}}/></div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:4}}>82% toward 4.0 GPA</div>
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
            <h2 style={{fontFamily:"Georgia,serif",fontSize:26,fontWeight:800,color:"#fff",marginBottom:10,lineHeight:1.2,maxWidth:560}}>{student.name} is projected to reach <em style={{color:T.mint}}>85%</em> overall by semester end</h2>
            <p style={{fontSize:14,color:"rgba(255,255,255,.5)",lineHeight:1.8,maxWidth:500,marginBottom:24}}>Analysis of 6 subjects, attendance data, and historical patterns. Model confidence: 78%.</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
              {[["82 / 100","AI Performance Score",T.gold],["Low Risk","Academic Risk Level",T.mint],["#3 Predicted","End-of-Semester Rank","#fff"]].map(([v,l,c])=>(
                <div key={l} style={{padding:"18px",background:"rgba(255,255,255,.07)",borderRadius:14,border:"1px solid rgba(255,255,255,.08)"}}>
                  <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:800,color:c,marginBottom:5}}>{v}</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,.4)"}}>{l}</div>
                </div>
              ))}
            </div>
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
              <Crd style={{padding:"24px",border:`1.5px solid ${T.clay}44`,background:`linear-gradient(135deg,#fff,${T.clay}05)`}}>
                <div style={{fontSize:10,fontWeight:700,color:T.clay,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:10}}>⚠ Attendance Impact</div>
                <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:T.ink,marginBottom:8,lineHeight:1.3}}>Low attendance affecting Chemistry</div>
                <p style={{fontSize:13,color:T.muted,lineHeight:1.7}}>Reaching 95% attendance could recover up to 6 marks in Chemistry based on historical performance data.</p>
              </Crd>
              <Crd style={{padding:"24px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>Overall Performance Trend</div>
                <div style={{display:"flex",alignItems:"center",gap:16}}>
                  <svg width={140} height={50} style={{overflow:"visible"}}>
                    {[72,75,78,80,81,83,82,85].map((v,i,arr)=>{
                      const x=i/(arr.length-1)*140, y=50-(v-70)/(90-70)*50;
                      return i===0?null:<line key={i} x1={(i-1)/(arr.length-1)*140} y1={50-(arr[i-1]-70)/(90-70)*50} x2={x} y2={y} stroke={T.forest} strokeWidth="2.5" strokeLinecap="round"/>;
                    })}
                    <circle cx={140} cy={50-(85-70)/(90-70)*50} r="5" fill={T.forest}/>
                  </svg>
                  <div>
                    <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:800,color:T.forest}}>+13%</div>
                    <div style={{fontSize:12,color:T.muted}}>Overall since Sept</div>
                    <div style={{fontSize:11,color:T.success,marginTop:4,fontWeight:600}}>↑ Positive trajectory</div>
                  </div>
                </div>
              </Crd>
            </div>
          </div>
        </div>
      )}
      {/* MESSAGES */}
      {tab==="messages"&&(
        <div style={{animation:"fadeUp .35s"}}>
          <SecHead pre="Communication" title="Messages" action={<Btn onClick={()=>setCompose(true)} style={{marginBottom:4}}>+ Compose</Btn>}/>
          {compose&&(
            <Crd style={{padding:"24px",marginBottom:18,border:`1.5px solid ${T.forest}44`,animation:"fadeUp .3s"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><div style={{fontSize:14,fontWeight:700,color:T.ink}}>New Message</div><span onClick={()=>setCompose(false)} style={{cursor:"pointer",color:T.muted,fontSize:22}}>×</span></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Inp label="To (Teacher / Admin)" placeholder="Ms. Nadia, Mr. Hassan…"/>
                <Inp label="Subject" placeholder="Subject of message"/>
              </div>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:".6px"}}>Message</div>
                <textarea rows={4} placeholder="Write your message here…" style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.border}`,fontSize:13,color:T.ink,background:T.paper,resize:"none",outline:"none"}}/>
              </div>
              <div style={{display:"flex",gap:10}}>
                <Btn onClick={()=>setCompose(false)} out color={T.muted} style={{flex:1,padding:"11px"}}>Cancel</Btn>
                <Btn onClick={()=>setCompose(false)} style={{flex:2,padding:"11px"}}>Send Message</Btn>
              </div>
            </Crd>
          )}
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
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>
            <KPI label="Annual Total" value="Rs. 1,50,000" color={T.ink} icon="◑" sub="4 terms"/>
            <KPI label="Paid" value={`Rs. ${(student.fees.filter(f=>f.status==="paid").length*12500).toLocaleString()}`} color={T.success} icon="✓" sub={`${student.fees.filter(f=>f.status==="paid").length} months`}/>
            <KPI label="Pending" value={`Rs. ${(student.fees.filter(f=>f.status==="pending").length*12500).toLocaleString()}`} color={T.warning} icon="⏳" sub={`${student.fees.filter(f=>f.status==="pending").length} months due`}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:18}}>
            <Crd style={{padding:"26px"}}>
              <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:18}}>Payment History</div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Month","Amount","Due Date","Paid On","Status"].map(h=><th key={h} style={{textAlign:"left",padding:"9px 12px",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",borderBottom:`2px solid ${T.border}`}}>{h}</th>)}</tr></thead>
                <tbody>{student.fees.map((f,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${T.border}`}}>
                    <td style={{padding:"12px",fontSize:13,fontWeight:600,color:T.ink}}>{f.month}</td>
                    <td style={{padding:"12px",fontSize:13}}>Rs. {f.amt.toLocaleString()}</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>20th</td>
                    <td style={{padding:"12px",fontSize:13,color:T.muted}}>{f.date||"—"}</td>
                    <td style={{padding:"12px"}}><Bdg label={f.status==="paid"?"✓ Paid":"⏳ Pending"} color={f.status==="paid"?T.success:T.warning} bg={f.status==="paid"?`${T.success}15`:`${T.warning}15`}/></td>
                  </tr>
                ))}</tbody>
              </table>
            </Crd>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Crd style={{padding:"22px",border:`1.5px solid ${T.warning}55`,background:`linear-gradient(135deg,#fff,${T.warning}05)`}}>
                <div style={{fontSize:10,fontWeight:700,color:T.warning,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:10}}>⚠ Payment Due</div>
                <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:800,color:T.ink}}>Rs. 25,000</div>
                <div style={{fontSize:12,color:T.muted,marginTop:4,marginBottom:16}}>March + April 2026<br/>Deadline: March 20, 2026</div>
                <Btn full style={{marginBottom:8,padding:"11px"}}>Pay Online Now</Btn>
                <Btn out color={T.forest} full style={{padding:"11px",fontSize:13}}>Download Invoice</Btn>
              </Crd>
              <Crd style={{padding:"22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>Monthly Breakdown</div>
                {[["Tuition","Rs. 10,000"],["Lab Charges","Rs. 1,000"],["Library","Rs. 500"],["Sports","Rs. 500"],["Miscellaneous","Rs. 500"]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:12,color:T.muted}}>{l}</span><span style={{fontSize:12,fontWeight:600,color:T.ink}}>{v}</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0"}}><span style={{fontSize:13,fontWeight:700,color:T.ink}}>Total / Month</span><span style={{fontSize:14,fontWeight:800,color:T.forest}}>Rs. 12,500</span></div>
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
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:660}}>
              <thead>
                <tr>
                  <th style={{padding:"10px 16px",textAlign:"left",fontSize:11,color:T.muted,fontWeight:700,textTransform:"uppercase",borderBottom:`2px solid ${T.border}`,width:110}}>Day</th>
                  {["8:00–8:40","8:40–9:20","9:20–10:00","10:00–10:40","10:40–11:20","11:20–12:00"].map(t=><th key={t} style={{padding:"10px 8px",textAlign:"center",fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:".4px",borderBottom:`2px solid ${T.border}`}}>{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {student.timetable.map((row,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${T.border}`,background:i%2===0?T.card:T.paper}}>
                    <td style={{padding:"11px 16px",fontSize:12,fontWeight:700,color:T.ink}}>{row.day}</td>
                    {row.p.map((p,j)=>{const c=sc(p);return<td key={j} style={{padding:"7px 5px",textAlign:"center"}}><div style={{background:`${c}15`,color:c,borderRadius:9,padding:"6px 4px",fontSize:10,fontWeight:700,lineHeight:1.3}}>{p}</div></td>;})}
                  </tr>
                ))}
              </tbody>
            </table>
          </Crd>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:16}}>
            {Object.entries({Mathematics:T.purple,"Computer Sc.":T.forest,Urdu:T.green,English:T.blue,Physics:T.gold,Chemistry:T.clay}).map(([s,c])=>(
              <div key={s} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",background:`${c}12`,borderRadius:99,border:`1px solid ${c}30`}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:c}}/><span style={{fontSize:11,color:c,fontWeight:700}}>{s}</span>
              </div>
            ))}
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
                {[["Roll No.",student.roll],["Grade",`${student.grade} · ${student.section}`],["GPA",`${student.gpa} / 4.0`],["Rank",`#${student.rank} of ${student.classSize}`],["Subjects","6"],["AI Score","82 / 100"]].map(([l,v])=>(
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
              <Crd style={{padding:"26px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:16}}>Notification Preferences</div>
                {[["Email Notifications","Grades, attendance & message alerts",true],["SMS Alerts","Fee reminders via SMS",true],["Weekly AI Report","AI performance summary every Monday",false],["Event Reminders","School events and exam notifications",true]].map(([l,sub,on])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${T.border}`}}>
                    <div><div style={{fontSize:13,fontWeight:500,color:T.ink}}>{l}</div><div style={{fontSize:11,color:T.muted,marginTop:2}}>{sub}</div></div>
                    <Toggle on={on}/>
                  </div>
                ))}
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
export default function App() {
  const[screen,setScreen]=useState("landing");
  const[user,setUser]=useState(null);
  const[db,setDb]=useState(initDB());

  const login=u=>{setUser(u);setScreen("app");};
  const logout=()=>{setUser(null);setScreen("landing");};

  if(screen==="landing") return <Landing onLogin={()=>setScreen("login")} onSignup={()=>setScreen("signup")}/>;
  if(screen==="login")   return <Login   db={db} onLogin={login} onBack={()=>setScreen("landing")} onSignup={()=>setScreen("signup")}/>;
  if(screen==="signup")  return <Signup  onBack={()=>setScreen("landing")} onLogin={()=>setScreen("login")}/>;

  if(!user) return <Landing onLogin={()=>setScreen("login")} onSignup={()=>setScreen("signup")}/>;
  if(user.role==="superadmin") return <SuperAdmin  user={user} db={db} setDb={setDb} onLogout={logout}/>;
  if(user.role==="admin")      return <AdminPortal user={user} db={db} setDb={setDb} onLogout={logout}/>;
  if(user.role==="teacher")    return <TeacherPortal user={user} db={db} onLogout={logout}/>;
  if(user.role==="parent")     return <ParentPortal user={user} db={db} onLogout={logout}/>;
}


