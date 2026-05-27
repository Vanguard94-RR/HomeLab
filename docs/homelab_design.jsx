import { useState, useEffect } from "react";

// ── Dark mode detection ────────────────────────────────────────────────────────
function useDark() {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = e => setDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return dark;
}

// ── Color palette: light / dark pairs ─────────────────────────────────────────
// [fill, stroke/text-dark, text-on-fill]
function palette(dark) {
  return {
    teal:  dark ? ["#085041","#5DCAA5","#9FE1CB"] : ["#E1F5EE","#0F6E56","#0F6E56"],
    blue:  dark ? ["#042C53","#378ADD","#B5D4F4"] : ["#E6F1FB","#185FA5","#185FA5"],
    purple:dark ? ["#26215C","#7F77DD","#AFA9EC"] : ["#EEEDFE","#534AB7","#534AB7"],
    amber: dark ? ["#412402","#EF9F27","#FAC775"] : ["#FAEEDA","#854F0B","#854F0B"],
    green: dark ? ["#173404","#639922","#C0DD97"] : ["#EAF3DE","#3B6D11","#3B6D11"],
    red:   dark ? ["#501313","#E24B4A","#F7C1C1"] : ["#FCEBEB","#A32D2D","#A32D2D"],
    gray:  dark ? ["#2C2C2A","#888780","#B4B2A9"] : ["#F1EFE8","#5F5E5A","#5F5E5A"],
    coral: dark ? ["#4A1B0C","#D85A30","#F5C4B3"] : ["#FAECE7","#993C1D","#993C1D"],
    line:  dark ? "#444441" : "#B4B2A9",
    txt:   dark ? "#E8E6DC" : "#2C2C2A",
    txts:  dark ? "#888780" : "#5F5E5A",
    bg:    dark ? "#1e1e1c" : "#ffffff",
    bg2:   dark ? "#2C2C2A" : "#F1EFE8",
    bdr:   dark ? "#444441" : "#D3D1C7",
  };
}

// ── SVG helpers ────────────────────────────────────────────────────────────────
function Nd({x,y,w,h,rx=8,p,t,s,sw=0.5,dash}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={rx} fill={p[0]} stroke={p[1]} strokeWidth={sw} strokeDasharray={dash||undefined}/>
      <text x={x+w/2} y={s?y+h/2-9:y+h/2} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="500" fill={p[2]}>{t}</text>
      {s&&<text x={x+w/2} y={y+h/2+9} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={p[2]} opacity="0.9">{s}</text>}
    </g>
  );
}

function Arr({id, col}) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M2 1L8 5L2 9" fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </marker>
    </defs>
  );
}

function Ln({x1,y1,x2,y2,col,dash,arr}) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth="1.2" strokeDasharray={dash} markerEnd={arr?`url(#${arr})`:undefined}/>;
}

// ── Data ──────────────────────────────────────────────────────────────────────
const MACHINES = [
  { id:"m720q",  name:"Lenovo M720q",          role:"Core Router / Firewall",          badge:"CORE",      pal:"teal",
    cpu:"Intel Core i5-8500T (6C/6T, 2.1–3.5GHz, 8th Gen)", ram:"32GB DDR4 SO-DIMM (2×16GB) — MAXED",
    storage:"512GB NVMe M.2 (único slot) + NIC PCIe ocupa slot 2.5\"", net:"NIC PCIe 4-puertos Intel I350-T4", gpu:"Intel UHD 630", os:"Proxmox VE",
    roleDetail:"Router/Firewall pfSense VM · AdGuard Home LXC · Gateway principal del lab",
    limits:["Solo 1 slot NVMe M.2 2280 — sin expansión interna","NIC PCIe ocupa slot 2.5\" — sin bahía libre","Sin GPU dedicada para ML","i5-8500T sin HT — 6 cores reales"],
    upgrades:[], workloads:["pfSense/OPNsense VM","AdGuard Home LXC (DNS/blocker)","Proxmox hypervisor","WireGuard VPN"] },
  { id:"t440p",  name:"Lenovo T440p",           role:"K3s Master Node / CI-CD",         badge:"K3s MASTER",pal:"blue",
    cpu:"Intel Core i7-4712MQ (4C/8T, 2.3–3.3GHz, 4th Gen)", ram:"16GB DDR3L SO-DIMM (2×8GB) — MAXED",
    storage:"512GB SSD NGFF (WAN) + 1TB HDD (SATA) + 1TB HDD (Ultrabay) + M.2 2242 SATA vacío", net:"Intel Gigabit", gpu:"GTX 730M (sin uso)", os:"Fedora Server 42",
    roleDetail:"K3s control-plane · GitOps ArgoCD/Flux · CI/CD pipelines",
    limits:["M.2 slot 2242 SATA — NO soporta NVMe","RAM maxeada 16GB DDR3L (Haswell)","CPU 4th Gen — alto consumo","GTX 730M sin utilidad en modo server"],
    upgrades:[{text:"Reemplazar HDD Ultrabay por SSD 1TB SATA",priority:"HIGH",cost:"~$40"},{text:"M.2 2242 SATA 256GB dedicado para etcd",priority:"MED",cost:"~$20"}],
    workloads:["K3s control-plane","ArgoCD / Flux","Gitea / Forgejo","Tekton Pipelines","Harbor Registry"] },
  { id:"t430",   name:"Lenovo T430",            role:"K3s Worker Node 1 / Storage",     badge:"WORKER 1",  pal:"purple",
    cpu:"Intel Core i7-3xxx (4C/8T, 3rd Gen Ivy Bridge)", ram:"16GB DDR3 SO-DIMM (2×8GB) — MAXED",
    storage:"512GB SSD (WAN) + 500GB HDD (SATA) + 500GB HDD (Ultrabay)", net:"Intel Gigabit", gpu:"Intel HD 4000", os:"Fedora Server 42",
    roleDetail:"K3s worker 1 · Longhorn storage · Prometheus/Grafana",
    limits:["RAM maxeada 16GB DDR3 (Ivy Bridge)","CPU 3rd Gen — más antiguo del lab","Sin slot M.2/NVMe disponible","Alto consumo energético"],
    upgrades:[{text:"Reemplazar HDDs por SSDs SATA (crítico para etcd/Longhorn)",priority:"HIGH",cost:"~$60"}],
    workloads:["K3s worker node","Longhorn storage","Prometheus + Grafana","Loki logs"] },
  { id:"p52",    name:"Lenovo ThinkPad P52",    role:"Build Server / ML / Worker 2 ★",  badge:"BUILD ★",   pal:"amber",
    cpu:"Intel Core i7 6C/12T (8th Gen Coffee Lake-H)", ram:"32GB DDR4 (4 slots — 2 libres, max 128GB)",
    storage:"512GB NVMe M.2 2280 + slot 2.5\" libre + slot M.2 secundario vacío", net:"Intel Gigabit + Thunderbolt 3", gpu:"Quadro P1000 4GB GDDR5", os:"Fedora 42",
    roleDetail:"K3s Worker Node 2 (recomendado) · Build server · ML inference · VS Code remoto",
    limits:["32GB RAM actual (ampliable a 64–128GB)","Ruido ventilación bajo carga sostenida","Quadro P1000 limitado para ML serio"],
    upgrades:[{text:"Expandir RAM a 64GB (2×32GB en slots libres)",priority:"HIGH",cost:"~$80"},{text:"2TB NVMe en slot secundario vacío",priority:"MED",cost:"~$80"}],
    workloads:["K3s Worker Node 2","Podman/Buildah builds","Ollama ML inference","VS Code Server remoto"] },
  { id:"dell",   name:"Dell Inspiron 15 3501",  role:"Monitoring / Jump Host",          badge:"MON",       pal:"green",
    cpu:"Intel Core i5-1135G7 (4C/8T, 11th Gen Tiger Lake)", ram:"16GB DDR4 (2×8GB — MAXED, límite plataforma)",
    storage:"256GB NVMe M.2 2280 (OS) + 120GB SSD SATA 2.5\"", net:"Intel Gigabit", gpu:"Intel Iris Xe", os:"Linux",
    roleDetail:"Jump host · bastion SSH · Grafana UI · Uptime Kuma",
    limits:["RAM maxeada 16GB — límite Tiger Lake-U","TDP 15W — throttlea bajo carga","Sin expansión NVMe adicional","Iris Xe comparte RAM del sistema"],
    upgrades:[{text:"Reemplazar 120GB SATA por 500GB SSD",priority:"LOW",cost:"~$25"}],
    workloads:["Bastion host SSH","Grafana / Kibana UI","Uptime Kuma","Jump host acceso lab"] },
  { id:"parrot", name:"T440p Parrot OS",        role:"Red Team / Pentesting — AISLADO", badge:"RED TEAM",  pal:"red",
    cpu:"Intel Core i7-4712MQ (4C/8T, 4th Gen)", ram:"16GB DDR3L SO-DIMM (2×8GB) — MAXED",
    storage:"512GB SSD NGFF (OS) + Ultrabay disponible", net:"Intel Gigabit + WiFi adapters", gpu:"NVIDIA GTX (legacy)", os:"Parrot OS Security",
    roleDetail:"Red team · pentesting · auditorías seguridad del lab — VLAN 50 aislada",
    limits:["Aislado en VLAN 50 — sin acceso a otras VLANs","NO conectar al cluster K3s"],
    upgrades:[], workloads:["Metasploit","Nmap / Nessus","Burp Suite","Aircrack-ng"] },
  { id:"p53",    name:"Lenovo P53 (Daily)",     role:"Daily Driver / Remote Dev",       badge:"DAILY",     pal:"gray",
    cpu:"Intel Core i9-9880H (8C/16T, 9th Gen Coffee Lake-H)", ram:"64GB DDR4 (4 slots, max 128GB)",
    storage:"480GB NVMe + 1TB NVMe (3 slots M.2 disponibles)", net:"Intel Gigabit + WiFi 6 AX200 + TB3", gpu:"Quadro RTX 4000 8GB GDDR6", os:"Windows 11",
    roleDetail:"Trabajo diario · kubectl/Lens · acceso remoto al lab",
    limits:["Máquina personal — no servidor permanente","Windows 11 como OS principal"],
    upgrades:[], workloads:["IDE (VS Code / JetBrains)","kubectl / Lens / k9s","Acceso remoto lab","Docker Desktop"] },
];

const WORKER2 = [
  { name:"ThinkPad P52", verdict:"RECOMENDADO", score:92, pal:"teal",
    pros:["6C/12T Coffee Lake-H — CPU más potente para K3s","32GB DDR4 ampliables a 64GB","Quadro P1000 para ML con Ollama","NVMe principal + slot secundario para Longhorn","Thunderbolt 3 para NIC 10GbE futura","Ya tiene Fedora 42 — K3s agent en minutos"],
    cons:["Doble rol build+worker requiere taints bien configurados","Ruido ventilación bajo carga","Mayor consumo que Dell 3501"],
    roles:["K3s Worker Node 2","Build server (Podman/Kaniko)","ML inference (Ollama)","VS Code Server"],
    impl:"Fedora Server minimal. k3s agent → T440p master. Taint node-role=build:NoSchedule para aislar builds de prod." },
  { name:"Dell Inspiron 3501", verdict:"VIABLE (limitado)", score:58, pal:"amber",
    pros:["11th Gen Tiger Lake — arquitectura más moderna","TDP 15W — menor consumo","Libera P52 para build/ML exclusivo"],
    cons:["RAM maxeada en 16GB — sin headroom","TDP 15W throttlea bajo carga","256GB NVMe — muy poco para Longhorn","Sin expansión posible"],
    roles:["K3s Worker Node 2 (ligero)","Monitoring namespace","Bastion host"],
    impl:"Solo cargas ligeras. Resource limits estrictos. No asignar Longhorn replicas." },
  { name:"M720q (VM en Proxmox)", verdict:"NO RECOMENDADO", score:31, pal:"red",
    pros:["Hardware potente disponible","VM K3s trivial en Proxmox"],
    cons:["Mezclar gateway + K3s = antipatrón enterprise crítico","SPOF absoluto — tumba red Y cluster","Sin almacenamiento para Longhorn"],
    roles:["Mantener exclusivamente como gateway/firewall"],
    impl:"No implementar. Separación de responsabilidades es fundamental." },
];

const UPGRADES = [
  { n:1, title:"Switch managed (reemplazar TL-SG108)", mach:["Infraestructura"], pal:"red",
    reason:"Sin 802.1Q VLANs es imposible segregar redes. Piedra fundamental del diseño enterprise.", cost:"~$60–100",
    items:["Switch managed 8–16 puertos 802.1Q (TP-Link TL-SG108E o Netgear GS308E)"] },
  { n:2, title:"SSDs para nodos K3s (HDDs → SSDs)", mach:["T430","T440p Master"], pal:"red",
    reason:"etcd requiere latencia <10ms. HDDs mecánicos causan timeouts y corrompen Longhorn.", cost:"~$80–120",
    items:["2× SSD SATA 1TB para Ultrabays","1× M.2 2242 SATA 256GB para etcd dedicado en T440p"] },
  { n:3, title:"Definir Worker Node 2 (P52 recomendado)", mach:["P52"], pal:"amber",
    reason:"Sin tercer nodo, Longhorn no puede replicar 2× y no hay tolerancia a fallos real.", cost:"$0 (hardware existente)",
    items:["Instalar Fedora Server minimal en P52","Unir como K3s agent","Configurar taints build/prod"] },
  { n:4, title:"RAM expansión ThinkPad P52", mach:["P52"], pal:"amber",
    reason:"32GB no permiten build + ML + K3s agent simultáneamente. 64GB = nodo más potente.", cost:"~$80",
    items:["2× SO-DIMM DDR4-2666 32GB en los 2 slots libres"] },
  { n:5, title:"NVMe secundario para P52", mach:["P52"], pal:"blue",
    reason:"Slot M.2 secundario vacío — ideal para Longhorn volumes, imágenes OCI y datasets ML.", cost:"~$60–80",
    items:["1× NVMe M.2 2280 2TB (Samsung 990 EVO o similar)"] },
  { n:6, title:"UPS para M720q + switch", mach:["M720q","Switch"], pal:"blue",
    reason:"Caída de luz sin UPS corrompe etcd y tumba el cluster sin shutdown graceful.", cost:"~$80–120",
    items:["UPS 650VA con AVR (APC Back-UPS ES 650)"] },
];

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const dark = useDark();
  const P = palette(dark);
  const [tab, setTab] = useState("worker2");
  const [sel, setSel] = useState(null);
  const tabs=[{id:"worker2",l:"⭐ Worker 2"},{id:"hw",l:"Hardware"},{id:"up",l:"Upgrades"},{id:"net",l:"Red"},{id:"adguard",l:"🛡 AdGuard Home"},{id:"k3s",l:"Cluster K3s"},{id:"git",l:"GitOps"},{id:"iam",l:"IAM"},{id:"stor",l:"Storage"}];
  return (
    <div style={{fontFamily:"var(--font-sans)",background:P.bg,minHeight:"100vh"}}>
      <div style={{background:P.bg2,borderBottom:`0.5px solid ${P.bdr}`,padding:"20px 24px 0"}}>
        <div style={{fontSize:11,fontWeight:500,letterSpacing:"0.08em",color:P.txts,marginBottom:4}}>ENTERPRISE HOMELAB DESIGN · V2</div>
        <h1 style={{fontSize:22,fontWeight:500,margin:"0 0 4px",color:P.txt}}>HomeLab Architecture</h1>
        <p style={{fontSize:13,color:P.txts,margin:"0 0 20px"}}>
          Production-ready · K3s · GitOps · IAM · DevOps · Networking
          <span style={{marginLeft:10,padding:"2px 8px",borderRadius:4,background:P.teal[0],color:P.teal[2],fontSize:11,fontWeight:500}}>Corregido: 2 T440p</span>
        </p>
        <div style={{display:"flex",gap:2,overflowX:"auto"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 14px",fontSize:13,border:"none",cursor:"pointer",borderRadius:"6px 6px 0 0",background:tab===t.id?P.bg:"transparent",color:tab===t.id?P.txt:P.txts,fontWeight:tab===t.id?500:400,borderBottom:tab===t.id?`2px solid ${P.txt}`:"2px solid transparent",whiteSpace:"nowrap"}}>{t.l}</button>
          ))}
        </div>
      </div>
      <div style={{padding:24}}>
        {tab==="worker2"&&<Worker2 P={P}/>}
        {tab==="hw"&&<Hardware P={P} sel={sel} setSel={setSel}/>}
        {tab==="up"&&<Upgrades P={P}/>}
        {tab==="net"&&<Network P={P}/>}
        {tab==="adguard"&&<AdGuard P={P}/>}
        {tab==="k3s"&&<K3s P={P}/>}
        {tab==="git"&&<GitOps P={P}/>}
        {tab==="iam"&&<IAM P={P}/>}
        {tab==="stor"&&<Storage P={P}/>}
      </div>
    </div>
  );
}

// ── Worker2 ────────────────────────────────────────────────────────────────────
function Worker2({P}) {
  const [s,setS]=useState(0);
  const o=WORKER2[s];
  const op=P[o.pal];
  return (
    <div>
      <div style={{padding:"14px 18px",background:P.blue[0],border:`0.5px solid ${P.blue[1]}`,borderRadius:12,marginBottom:24}}>
        <div style={{fontSize:13,fontWeight:500,color:P.blue[2],marginBottom:4}}>Contexto corregido</div>
        <div style={{fontSize:13,color:P.blue[2]}}>El lab tiene <strong>2 T440p</strong>: uno como K3s master (Fedora Server) y uno como pentesting (Parrot OS, VLAN 50 aislada). Cluster actual: <strong>T440p (master) + T430 (worker 1)</strong>. Falta Worker Node 2.</div>
      </div>
      <div style={{fontSize:15,fontWeight:500,color:P.txt,marginBottom:4}}>¿Qué máquina debe ser Worker Node 2?</div>
      <div style={{fontSize:13,color:P.txts,marginBottom:16}}>Análisis comparativo de las 3 opciones del hardware existente.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:24}}>
        {WORKER2.map((o,i)=>{
          const cp=P[o.pal];
          return (
            <button key={o.name} onClick={()=>setS(i)} style={{padding:14,border:s===i?`2px solid ${cp[1]}`:`0.5px solid ${P.bdr}`,borderRadius:12,cursor:"pointer",background:s===i?cp[0]:P.bg,textAlign:"left"}}>
              <div style={{fontSize:11,fontWeight:500,color:cp[2],marginBottom:4}}>{o.verdict}</div>
              <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:8}}>{o.name}</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{flex:1,height:4,borderRadius:2,background:P.bdr,overflow:"hidden"}}>
                  <div style={{width:`${o.score}%`,height:"100%",background:cp[1],borderRadius:2}}/>
                </div>
                <span style={{fontSize:12,fontWeight:500,color:cp[2]}}>{o.score}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{background:P.bg,border:`0.5px solid ${P.bdr}`,borderRadius:12,padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div><div style={{fontSize:18,fontWeight:500,color:P.txt}}>{o.name}</div><div style={{fontSize:13,color:P.txts}}>Análisis como Worker Node 2</div></div>
          <span style={{fontSize:11,fontWeight:500,padding:"4px 10px",borderRadius:6,background:op[0],color:op[2]}}>{o.verdict}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
          <div>
            <div style={{fontSize:12,fontWeight:500,color:P.green[2],textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10}}>Ventajas</div>
            {o.pros.map(p=><div key={p} style={{display:"flex",gap:8,marginBottom:7,fontSize:13}}><span style={{color:P.green[1],flexShrink:0}}>✓</span><span style={{color:P.txt}}>{p}</span></div>)}
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:500,color:P.red[2],textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10}}>Limitaciones</div>
            {o.cons.map(c=><div key={c} style={{display:"flex",gap:8,marginBottom:7,fontSize:13}}><span style={{color:P.red[1],flexShrink:0}}>✗</span><span style={{color:P.txt}}>{c}</span></div>)}
          </div>
        </div>
        <div style={{padding:14,background:P.bg2,borderRadius:8,marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:500,color:P.txts,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"}}>Plan de implementación</div>
          <div style={{fontSize:13,color:P.txt}}>{o.impl}</div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {o.roles.map(r=><span key={r} style={{fontSize:12,padding:"4px 10px",borderRadius:4,background:op[0],color:op[2]}}>{r}</span>)}
        </div>
      </div>
      {s===0&&(
        <div style={{marginTop:16,padding:"14px 18px",background:P.bg2,border:`0.5px solid ${P.bdr}`,borderRadius:8}}>
          <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:8}}>Comandos de implementación — P52 como Worker 2</div>
          <pre style={{fontFamily:"var(--font-mono)",fontSize:12,color:P.txts,lineHeight:1.9,margin:0,whiteSpace:"pre-wrap"}}>
            <span style={{color:P.txts}}># En el T440p (master){"\n"}</span>
            <span style={{color:P.txt}}>sudo cat /var/lib/rancher/k3s/server/node-token{"\n\n"}</span>
            <span style={{color:P.txts}}># En el P52 — instalar como agent{"\n"}</span>
            <span style={{color:P.txt}}>{"curl -sfL https://get.k3s.io | \\\n  K3S_URL=https://<T440p-IP>:6443 \\\n  K3S_TOKEN=<TOKEN> sh -\n\n"}</span>
            <span style={{color:P.txts}}># Etiquetar como build node{"\n"}</span>
            <span style={{color:P.txt}}>{"kubectl label node p52 node-role.kubernetes.io/build=true\nkubectl taint node p52 node-role=build:NoSchedule"}</span>
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Hardware ────────────────────────────────────────────────────────────────────
function Hardware({P,sel,setSel}) {
  const m = sel ? MACHINES.find(x=>x.id===sel) : null;
  return (
    <div>
      <p style={{fontSize:14,color:P.txts,margin:"0 0 20px"}}>Análisis técnico con limitaciones reales investigadas. Clic en una máquina para detalles.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12,marginBottom:24}}>
        {MACHINES.map(mac=>{
          const cp=P[mac.pal];
          return (
            <div key={mac.id} onClick={()=>setSel(sel===mac.id?null:mac.id)} style={{background:P.bg,border:sel===mac.id?`2px solid ${P.blue[1]}`:`0.5px solid ${P.bdr}`,borderRadius:12,padding:16,cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div><div style={{fontSize:14,fontWeight:500,color:P.txt,marginBottom:2}}>{mac.name}</div><div style={{fontSize:12,color:P.txts}}>{mac.role}</div></div>
                <span style={{fontSize:11,fontWeight:500,padding:"3px 8px",borderRadius:4,background:cp[0],color:cp[2],whiteSpace:"nowrap"}}>{mac.badge}</span>
              </div>
              <div style={{fontSize:12,color:P.txts,marginBottom:8}}>
                <div style={{marginBottom:3}}><span style={{color:P.txt,fontWeight:500}}>CPU: </span>{mac.cpu.split("(")[0].trim()}</div>
                <div><span style={{color:P.txt,fontWeight:500}}>RAM: </span>{mac.ram.split("—")[0].trim()}</div>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {mac.workloads.slice(0,3).map(w=><span key={w} style={{fontSize:11,padding:"2px 6px",borderRadius:3,background:P.bg2,color:P.txts}}>{w}</span>)}
                {mac.workloads.length>3&&<span style={{fontSize:11,padding:"2px 6px",borderRadius:3,background:P.bg2,color:P.txts}}>+{mac.workloads.length-3}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {m&&(
        <div style={{background:P.bg,border:`0.5px solid ${P.bdr}`,borderRadius:12,padding:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
            <div><h2 style={{fontSize:18,fontWeight:500,margin:"0 0 4px",color:P.txt}}>{m.name}</h2><p style={{fontSize:13,color:P.txts,margin:0}}>{m.roleDetail}</p></div>
            <span style={{fontSize:11,fontWeight:500,padding:"4px 10px",borderRadius:4,background:P[m.pal][0],color:P[m.pal][2]}}>{m.badge}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
            <div>
              <div style={{fontSize:12,fontWeight:500,color:P.txts,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10}}>Especificaciones</div>
              {[["CPU",m.cpu],["RAM",m.ram],["Storage",m.storage],["Red",m.net],["GPU",m.gpu],["OS",m.os]].map(([k,v])=>(
                <div key={k} style={{display:"flex",gap:8,marginBottom:8,fontSize:13}}>
                  <span style={{color:P.txts,minWidth:80,flexShrink:0}}>{k}</span>
                  <span style={{color:P.txt}}>{v}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:500,color:P.txts,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10}}>Workloads</div>
              {m.workloads.map(w=><div key={w} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,fontSize:13,color:P.txt}}><div style={{width:6,height:6,borderRadius:"50%",background:P.blue[1],flexShrink:0}}/>{w}</div>)}
              {m.limits.length>0&&<>
                <div style={{fontSize:12,fontWeight:500,color:P.red[1],textTransform:"uppercase",letterSpacing:"0.05em",margin:"14px 0 8px"}}>Limitaciones</div>
                {m.limits.map(l=><div key={l} style={{display:"flex",gap:8,marginBottom:6,fontSize:13}}><span style={{color:P.red[1],flexShrink:0}}>⚠</span><span style={{color:P.txt}}>{l}</span></div>)}
              </>}
            </div>
          </div>
          {m.upgrades.length>0&&(
            <div>
              <div style={{fontSize:12,fontWeight:500,color:P.blue[2],textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10}}>Upgrades recomendados</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {m.upgrades.map(u=>{
                  const uc=u.priority==="HIGH"?P.red:u.priority==="MED"?P.amber:P.green;
                  return (
                    <div key={u.text} style={{padding:10,background:P.bg2,borderRadius:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontSize:11,padding:"2px 6px",borderRadius:3,background:uc[0],color:uc[2]}}>{u.priority}</span>
                        <span style={{fontSize:12,color:P.txts}}>{u.cost}</span>
                      </div>
                      <div style={{fontSize:13,color:P.txt}}>{u.text}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Upgrades ────────────────────────────────────────────────────────────────────
function Upgrades({P}) {
  return (
    <div>
      <p style={{fontSize:14,color:P.txts,margin:"0 0 20px"}}>Lista priorizada para alcanzar nivel enterprise production-ready.</p>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {UPGRADES.map(u=>{
          const cp=P[u.pal];
          const label=u.pal==="red"?"CRÍTICO":u.pal==="amber"?"ALTO":"MEDIO";
          return (
            <div key={u.n} style={{background:P.bg,border:`0.5px solid ${P.bdr}`,borderRadius:12,padding:20,display:"grid",gridTemplateColumns:"48px 1fr auto",gap:16,alignItems:"start"}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:500,color:P.txt}}>#{u.n}</div><div style={{fontSize:11,color:P.txts}}>prioridad</div></div>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontSize:11,fontWeight:500,padding:"3px 8px",borderRadius:4,background:cp[0],color:cp[2]}}>{label}</span>
                  <div style={{fontSize:15,fontWeight:500,color:P.txt}}>{u.title}</div>
                </div>
                <div style={{fontSize:13,color:P.txts,marginBottom:10}}>{u.reason}</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                  {u.mach.map(m=><span key={m} style={{fontSize:11,padding:"2px 8px",borderRadius:3,background:P.bg2,color:P.txts,fontFamily:"var(--font-mono)"}}>{m}</span>)}
                </div>
                {u.items.map(i=><div key={i} style={{fontSize:13,color:P.txt,display:"flex",gap:8,marginBottom:4}}><span style={{color:P.txts}}>→</span>{i}</div>)}
              </div>
              <div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:500,color:P.txt}}>{u.cost}</div><div style={{fontSize:11,color:P.txts}}>costo est.</div></div>
            </div>
          );
        })}
      </div>
      <div style={{marginTop:20,padding:16,background:P.bg2,borderRadius:8,fontSize:13,color:P.txts}}>
        <strong style={{color:P.txt}}>Costo total estimado:</strong> ~$300–420 USD. Switch managed + SSDs desbloquean el resto del lab.
      </div>
    </div>
  );
}

// ── Network ─────────────────────────────────────────────────────────────────────
function Network({P}) {
  const aid="aN2";
  const AH=`url(#${aid})`;
  const vlans=[
    {l:"VLAN 10 MGMT",s:"192.168.10.0/24",x:14, pal:"teal"},
    {l:"VLAN 20 PROD",s:"192.168.20.0/24",x:144,pal:"blue"},
    {l:"VLAN 30 DEV", s:"192.168.30.0/24",x:274,pal:"purple"},
    {l:"VLAN 40 STOR",s:"192.168.40.0/24",x:404,pal:"amber"},
    {l:"VLAN 50 PEN", s:"192.168.50.0/24",x:534,pal:"red"},
  ];
  const hosts=[
    {l:"M720q · Dell",    cx:74, pal:"teal"},
    {l:"T440p·T430·P52",  cx:204,pal:"blue"},
    {l:"P52 · P53 daily", cx:334,pal:"purple"},
    {l:"Longhorn traffic",cx:464,pal:"amber"},
    {l:"T440p Parrot",    cx:594,pal:"red"},
  ];
  return (
    <div>
      <p style={{fontSize:14,color:P.txts,margin:"0 0 20px"}}>Red segregada por VLANs. M720q con pfSense como gateway y AdGuard Home LXC como DNS resolver para todas las VLANs.</p>
      <svg width="100%" viewBox="0 0 660 560" role="img">
        <title>Arquitectura de red del HomeLab</title>
        <Arr id={aid} col={P.line}/>
        {/* Internet */}
        <Nd x={250} y={14} w={160} h={38} p={P.gray} t="Internet / ISP"/>
        {/* pfSense VM */}
        <Nd x={120} y={76} w={420} h={52} rx={10} p={P.teal} t="M720q Proxmox — pfSense VM" s="Firewall · NAT · VLAN routing · WireGuard · DNS → AdGuard LXC"/>
        <Ln x1={330} y1={52} x2={330} y2={76} col={P.line} arr={aid}/>
        {/* AdGuard LXC — destacado como componente propio */}
        <Nd x={186} y={150} w={180} h={48} rx={8} p={P.green} t="AdGuard Home LXC" s="DNS blocker · DoH upstream"/>
        <Nd x={374} y={150} w={160} h={48} rx={8} p={P.gray}  t="Switch Managed" s="802.1Q (upgrade)"/>
        <Ln x1={330} y1={128} x2={276} y2={150} col={P.line} arr={aid}/>
        <Ln x1={330} y1={128} x2={454} y2={150} col={P.line} arr={aid}/>
        {/* DNS flow from AdGuard */}
        <line x1={276} y1={198} x2={276} y2={218} stroke={P.green[1]} strokeWidth="1" strokeDasharray="3 3" markerEnd={AH}/>
        <text x={240} y={212} textAnchor="middle" fontSize="9" fill={P.green[1]}>DNS queries</text>
        {/* VLANs */}
        {vlans.map(v=>(
          <g key={v.l}>
            <Nd x={v.x} y={230} w={120} h={48} p={P[v.pal]} t={v.l} s={v.s}/>
            <Ln x1={v.x+60} y1={198} x2={v.x+60} y2={230} col={P.line} arr={aid}/>
          </g>
        ))}
        {hosts.map(v=>(
          <g key={v.l}>
            <Nd x={v.cx-60} y={312} w={120} h={30} rx={6} p={P[v.pal]} t={v.l}/>
            <Ln x1={v.cx} y1={278} x2={v.cx} y2={312} col={P.line} arr={aid}/>
          </g>
        ))}
        {/* DoH upstream */}
        <text x={330} y={370} textAnchor="middle" fontSize="10" fill={P.txts}>AdGuard Home — upstream DNS cifrado</text>
        {[["DoH Cloudflare",100],["DoT Quad9",240],["DNSSEC",370],["Blocklists",500],["Split-horizon",620]].map(([l,x])=>(
          <Nd key={l} x={x-70} y={382} w={142} h={26} rx={4} p={P.green} t={l}/>
        ))}
        {/* WireGuard remote */}
        <Nd x={220} y={430} w={220} h={36} p={P.gray} t="Acceso remoto WireGuard"/>
        <Ln x1={330} y1={408} x2={330} y2={430} col={P.line} arr={aid}/>
        <text x={330} y={485} textAnchor="middle" fontSize="11" fill={P.txts}>P53 daily driver · clientes externos</text>
        <line x1={330} y1={466} x2={330} y2={482} stroke={P.line} strokeWidth="0.8"/>
        {/* DNS resolution label */}
        <text x={60} y={370} textAnchor="middle" fontSize="9" fill={P.green[1]}>192.168.10.2</text>
        <text x={60} y={380} textAnchor="middle" fontSize="9" fill={P.green[1]}>(IP fija LXC)</text>
      </svg>
      <div style={{marginTop:16,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
        {[
          {v:"VLAN 10 · MGMT",   d:"SSH, Proxmox UI, pfSense admin.",    pal:"teal"},
          {v:"VLAN 20 · PROD",   d:"K3s nodes, workloads, Longhorn.",     pal:"blue"},
          {v:"VLAN 30 · DEV",    d:"Builds, staging, CI/CD runners.",     pal:"purple"},
          {v:"VLAN 40 · STORAGE",d:"Tráfico replicación Longhorn.",       pal:"amber"},
          {v:"VLAN 50 · PENTEST",d:"Aislada. T440p Parrot OS únicamente.",pal:"red"},
          {v:"VLAN 60 · DMZ",    d:"Ingress externo controlado.",          pal:"teal"},
        ].map(v=>{
          const cp=P[v.pal];
          return (
            <div key={v.v} style={{padding:12,background:cp[0],borderRadius:8,border:`0.5px solid ${cp[1]}`}}>
              <div style={{fontSize:12,fontWeight:500,color:cp[2],marginBottom:4}}>{v.v}</div>
              <div style={{fontSize:12,color:cp[2]}}>{v.d}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AdGuard Home ────────────────────────────────────────────────────────────────
function AdGuard({P}) {
  const [activeSection, setActiveSection] = useState("arch");
  const sections = [{id:"arch",l:"Arquitectura LXC"},{id:"config",l:"Configuración"},{id:"integ",l:"Integraciones"},{id:"monitoring",l:"Monitoring"}];

  return (
    <div>
      {/* Header */}
      <div style={{padding:"16px 20px",background:P.green[0],border:`0.5px solid ${P.green[1]}`,borderRadius:12,marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:15,fontWeight:500,color:P.green[2],marginBottom:4}}>🛡 AdGuard Home</div>
            <div style={{fontSize:13,color:P.green[2]}}>DNS resolver · Ad/malware blocker · DoH/DoT upstream · Split-horizon DNS · Open source (GPL-3.0)</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,fontWeight:500,padding:"3px 8px",borderRadius:4,background:P.bg,color:P.green[1],marginBottom:4}}>LXC Container</div>
            <div style={{fontSize:11,color:P.green[2]}}>M720q · Proxmox</div>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:`0.5px solid ${P.bdr}`,paddingBottom:0}}>
        {sections.map(s=>(
          <button key={s.id} onClick={()=>setActiveSection(s.id)} style={{padding:"7px 14px",fontSize:13,border:"none",cursor:"pointer",borderRadius:"6px 6px 0 0",background:activeSection===s.id?P.bg:"transparent",color:activeSection===s.id?P.txt:P.txts,fontWeight:activeSection===s.id?500:400,borderBottom:activeSection===s.id?`2px solid ${P.green[1]}`:"2px solid transparent"}}>{s.l}</button>
        ))}
      </div>

      {activeSection==="arch" && (
        <div>
          <p style={{fontSize:14,color:P.txts,margin:"0 0 20px"}}>Contenedor LXC en Proxmox sobre el M720q. IP fija en VLAN 10 (MGMT), sirviendo DNS a todas las VLANs vía pfSense.</p>
          <svg width="100%" viewBox="0 0 660 420" role="img">
            <title>Arquitectura AdGuard Home LXC en Proxmox</title>
            <defs><marker id="aAG" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke={P.line} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></marker></defs>
            {/* Proxmox host */}
            <rect x={10} y={10} width={640} height={260} rx={12} fill={P.bg2} stroke={P.bdr} strokeWidth="1" strokeDasharray="6 3"/>
            <text x={30} y={32} fontSize="11" fontWeight="500" fill={P.txts}>Proxmox VE — M720q (i5-8500T · 32GB RAM · 512GB NVMe)</text>

            {/* pfSense VM */}
            <rect x={30} y={44} width={280} height={100} rx={8} fill={P.teal[0]} stroke={P.teal[1]} strokeWidth="0.5"/>
            <text x={170} y={68} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="500" fill={P.teal[2]}>pfSense VM</text>
            <text x={170} y={84} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.teal[2]}>2 vCPU · 4GB RAM · 20GB disk</text>
            <text x={170} y={100} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.teal[2]}>WAN: eth0 (ISP) · LAN: VLAN trunk</text>
            <text x={170} y={116} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.teal[2]}>DNS forwarder → 192.168.10.2</text>
            <text x={170} y={132} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.teal[2]}>DHCP option 6 → 192.168.10.2</text>

            {/* AdGuard LXC */}
            <rect x={350} y={44} width={280} height={100} rx={8} fill={P.green[0]} stroke={P.green[1]} strokeWidth="1"/>
            <text x={490} y={68} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="500" fill={P.green[2]}>AdGuard Home LXC</text>
            <text x={490} y={84} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.green[2]}>1 vCPU · 512MB RAM · 8GB disk</text>
            <text x={490} y={100} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.green[2]}>IP fija: 192.168.10.2 (VLAN 10)</text>
            <text x={490} y={116} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.green[2]}>Puerto 53 (DNS) · 3000 (UI)</text>
            <text x={490} y={132} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.green[2]}>Unprivileged · nesting=1</text>

            {/* Arrow pfSense → AdGuard */}
            <line x1={310} y1={94} x2={350} y2={94} stroke={P.green[1]} strokeWidth="1.5" markerEnd="url(#aAG)"/>
            <text x={330} y={86} textAnchor="middle" fontSize="9" fill={P.green[1]}>DNS fwd</text>

            {/* Other VMs row */}
            {[["WireGuard VM","1vCPU 512MB",30],["Monitoring VM","1vCPU 1GB",185],["Future VMs","...","",340]].map(([t,s,x],i)=>(
              <g key={t}>
                <rect x={30+i*210} y={174} width={180} height={46} rx={6} fill={P.gray[0]} stroke={P.gray[1]} strokeWidth="0.5"/>
                <text x={120+i*210} y={193} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500" fill={P.gray[2]}>{t}</text>
                <text x={120+i*210} y={209} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.gray[2]}>{s}</text>
              </g>
            ))}

            {/* Proxmox label */}
            <text x={640} y={260} textAnchor="end" fontSize="10" fill={P.txts}>Proxmox VE</text>
          </svg>

          {/* LXC creation commands */}
          <div style={{marginTop:20,padding:"14px 18px",background:P.bg2,border:`0.5px solid ${P.bdr}`,borderRadius:8}}>
            <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:10}}>Creación del contenedor LXC en Proxmox</div>
            <pre style={{fontFamily:"var(--font-mono)",fontSize:12,color:P.txts,lineHeight:2,margin:0,whiteSpace:"pre-wrap"}}>
              <span style={{color:P.txts}}>{`# Desde la shell de Proxmox (pve shell)\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`pct create 100 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \\\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`  --hostname adguard-home \\\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`  --cores 1 --memory 512 --swap 256 \\\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`  --rootfs local-lvm:8 \\\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`  --net0 name=eth0,bridge=vmbr0,tag=10,ip=192.168.10.2/24,gw=192.168.10.1 \\\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`  --unprivileged 1 --features nesting=1 \\\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`  --start 1 --onboot 1\n\n`}</span>
              <span style={{color:P.txts}}>{`# Dentro del LXC — instalar AdGuard Home\n`}</span>
              <span style={{color:P.txt}}>{`curl -s -S -L https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh | sh -s -- -v`}</span>
            </pre>
          </div>
        </div>
      )}

      {activeSection==="config" && (
        <div>
          <p style={{fontSize:14,color:P.txts,margin:"0 0 20px"}}>Configuración enterprise con DoH upstream, blocklists curadas y split-horizon DNS para el lab.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {/* Upstream DNS */}
            <div style={{padding:16,background:P.bg2,borderRadius:8}}>
              <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:12}}>Upstream DNS (DoH/DoT)</div>
              {[
                {provider:"Cloudflare", url:"https://cloudflare-dns.com/dns-query", note:"DoH · DNSSEC · privacy-first"},
                {provider:"Quad9",      url:"https://dns.quad9.net/dns-query",      note:"DoH · malware blocking"},
                {provider:"NextDNS",    url:"https://dns.nextdns.io",               note:"DoH · configurable · fallback"},
              ].map(d=>(
                <div key={d.provider} style={{marginBottom:10,padding:"8px 10px",background:P.bg,borderRadius:6,border:`0.5px solid ${P.bdr}`}}>
                  <div style={{fontSize:12,fontWeight:500,color:P.txt,marginBottom:2}}>{d.provider}</div>
                  <div style={{fontSize:11,fontFamily:"var(--font-mono)",color:P.green[1],marginBottom:2}}>{d.url}</div>
                  <div style={{fontSize:11,color:P.txts}}>{d.note}</div>
                </div>
              ))}
            </div>
            {/* Blocklists */}
            <div style={{padding:16,background:P.bg2,borderRadius:8}}>
              <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:12}}>Blocklists recomendadas</div>
              {[
                {name:"AdGuard DNS filter",       url:"filters/15.txt",         domains:"~800K"},
                {name:"OISD Big",                 url:"oisd.nl/full",            domains:"~4M"},
                {name:"Steven Black Unified",     url:"steven-black/hosts",      domains:"~200K"},
                {name:"URLhaus Malware",          url:"urlhaus-filter/hosts",    domains:"~100K"},
                {name:"Hagezi Pro",               url:"hagezi/dns-blocklists",   domains:"~500K"},
              ].map(b=>(
                <div key={b.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,fontSize:12}}>
                  <span style={{color:P.txt}}>{b.name}</span>
                  <span style={{padding:"2px 6px",borderRadius:3,background:P.green[0],color:P.green[2],fontSize:11}}>{b.domains}</span>
                </div>
              ))}
            </div>
            {/* Split-horizon DNS */}
            <div style={{padding:16,background:P.bg2,borderRadius:8}}>
              <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:12}}>Split-horizon DNS</div>
              <div style={{fontSize:12,color:P.txts,marginBottom:10}}>Zonas internas resueltas localmente, sin salir a internet:</div>
              {[
                {zone:"*.lab.internal",       res:"192.168.20.x (K3s MetalLB)"},
                {zone:"*.cluster.local",      res:"CoreDNS del cluster K3s"},
                {zone:"proxmox.mgmt",         res:"192.168.10.1"},
                {zone:"adguard.mgmt",         res:"192.168.10.2"},
                {zone:"pfsense.mgmt",         res:"192.168.10.254"},
              ].map(z=>(
                <div key={z.zone} style={{display:"flex",gap:8,marginBottom:7,alignItems:"baseline"}}>
                  <span style={{fontSize:11,fontFamily:"var(--font-mono)",color:P.blue[2]||P.txt,minWidth:160,flexShrink:0}}>{z.zone}</span>
                  <span style={{fontSize:11,color:P.txts}}>→ {z.res}</span>
                </div>
              ))}
            </div>
            {/* pfSense integration */}
            <div style={{padding:16,background:P.bg2,borderRadius:8}}>
              <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:12}}>Integración pfSense</div>
              {[
                {setting:"DNS Resolver (Unbound)",    action:"Deshabilitar — AdGuard toma ese rol"},
                {setting:"DNS Forwarder",             action:"Habilitar → forward a 192.168.10.2"},
                {setting:"DHCP Server (todas VLANs)", action:"DNS option = 192.168.10.2"},
                {setting:"Firewall rule",             action:"Bloquear DNS (53/853) excepto desde LXC"},
                {setting:"DoT pfSense propio",        action:"Opcional — usar AdGuard como único resolver"},
              ].map(s=>(
                <div key={s.setting} style={{marginBottom:8}}>
                  <div style={{fontSize:12,fontWeight:500,color:P.txt}}>{s.setting}</div>
                  <div style={{fontSize:11,color:P.txts}}>{s.action}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeSection==="integ" && (
        <div>
          <p style={{fontSize:14,color:P.txts,margin:"0 0 20px"}}>Integración de AdGuard Home con el resto del stack enterprise del lab.</p>
          <svg width="100%" viewBox="0 0 660 360" role="img">
            <title>Integraciones de AdGuard Home</title>
            <defs><marker id="aAGI" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke={P.line} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></marker></defs>
            {/* AdGuard center */}
            <rect x={240} y={130} width={180} height={60} rx={10} fill={P.green[0]} stroke={P.green[1]} strokeWidth="1.5"/>
            <text x={330} y={154} textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="500" fill={P.green[2]}>AdGuard Home</text>
            <text x={330} y={172} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.green[2]}>192.168.10.2 · LXC</text>
            {/* Satellites */}
            {[
              {t:"pfSense",         s:"DNS forwarder",         x:30,  y:130, col:P.teal,   lx1:240,ly1:160,lx2:170,ly2:160},
              {t:"Todas las VLANs", s:"DHCP opt 6",            x:30,  y:230, col:P.blue,   lx1:240,ly1:175,lx2:170,ly2:255},
              {t:"Prometheus",      s:"scrape :9617",          x:490, y:50,  col:P.amber,  lx1:420,ly1:145,lx2:490,ly2:76},
              {t:"Grafana",         s:"dashboard DNS",         x:490, y:130, col:P.amber,  lx1:420,ly1:160,lx2:490,ly2:160},
              {t:"Traefik Ingress", s:"reverse proxy UI",      x:490, y:210, col:P.purple, lx1:420,ly1:170,lx2:490,ly2:230},
              {t:"CoreDNS K3s",     s:"forward lab.internal",  x:240, y:20,  col:P.blue,   lx1:330,ly1:130,lx2:330,ly2:66},
              {t:"Keycloak",        s:"auth UI (futuro)",      x:490, y:290, col:P.red,    lx1:420,ly1:178,lx2:490,ly2:310},
            ].map(n=>(
              <g key={n.t}>
                <rect x={n.x} y={n.y} width={150} height={44} rx={6} fill={n.col[0]} stroke={n.col[1]} strokeWidth="0.5"/>
                <text x={n.x+75} y={n.y+17} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500" fill={n.col[2]}>{n.t}</text>
                <text x={n.x+75} y={n.y+32} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={n.col[2]}>{n.s}</text>
                <line x1={n.lx1} y1={n.ly1} x2={n.lx2} y2={n.ly2} stroke={P.line} strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#aAGI)"/>
              </g>
            ))}
          </svg>
          <div style={{marginTop:16,padding:16,background:P.bg2,borderRadius:8}}>
            <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:10}}>DNS-over-HTTPS para clientes</div>
            <div style={{fontSize:13,color:P.txts,marginBottom:12}}>Con Traefik como reverse proxy, AdGuard expone DoH accesible dentro del lab sin exponer el puerto 853 directamente:</div>
            <pre style={{fontFamily:"var(--font-mono)",fontSize:12,color:P.txt,lineHeight:1.8,margin:0,background:P.bg,padding:12,borderRadius:6}}>
              {`# En Traefik (K3s) — IngressRoute para AdGuard DoH\n`}
              {`apiVersion: traefik.io/v1alpha1\nkind: IngressRoute\nmetadata:\n  name: adguard-doh\nspec:\n  entryPoints: [websecure]\n  routes:\n  - match: Host(\`dns.lab.internal\`)\n    kind: Rule\n    services:\n    - name: adguard-home\n      port: 3000`}
            </pre>
          </div>
        </div>
      )}

      {activeSection==="monitoring" && (
        <div>
          <p style={{fontSize:14,color:P.txts,margin:"0 0 20px"}}>AdGuard Home expone métricas compatibles con Prometheus via exporter. Dashboard Grafana incluido.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <div style={{padding:16,background:P.bg2,borderRadius:8}}>
              <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:12}}>Métricas disponibles</div>
              {[
                ["dns_queries_total",        "Total de queries procesadas"],
                ["dns_blocked_total",        "Queries bloqueadas (ads/malware)"],
                ["dns_query_duration",       "Latencia de resolución DNS"],
                ["dns_blocked_by_list",      "Bloqueos por blocklist"],
                ["dns_upstream_latency",     "Latencia upstream DoH/DoT"],
                ["adguard_clients_active",   "Clientes DNS activos"],
              ].map(([m,d])=>(
                <div key={m} style={{marginBottom:8}}>
                  <div style={{fontSize:11,fontFamily:"var(--font-mono)",color:P.green[1]}}>{m}</div>
                  <div style={{fontSize:11,color:P.txts}}>{d}</div>
                </div>
              ))}
            </div>
            <div style={{padding:16,background:P.bg2,borderRadius:8}}>
              <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:12}}>Stack de monitoring</div>
              <div style={{fontSize:13,color:P.txts,marginBottom:12}}>El exporter corre como segundo contenedor o proceso dentro del LXC:</div>
              <pre style={{fontFamily:"var(--font-mono)",fontSize:11,color:P.txt,lineHeight:1.8,background:P.bg,padding:12,borderRadius:6,margin:0}}>
                {`# adguard-exporter (dentro del LXC)\ndocker run -d \\\n  -p 9617:9617 \\\n  -e ADGUARD_HOSTNAME=localhost \\\n  -e ADGUARD_PORT=3000 \\\n  -e ADGUARD_USERNAME=admin \\\n  -e ADGUARD_PASSWORD=\${SECRET} \\\n  ebrianne/adguard-exporter\n\n# prometheus.yml scrape config\n- job_name: adguard\n  static_configs:\n  - targets: ['192.168.10.2:9617']`}
              </pre>
            </div>
          </div>
          <div style={{padding:16,background:P.bg2,borderRadius:8}}>
            <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:8}}>Alertas recomendadas (Alertmanager)</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[
                {alert:"AdGuardDown",          cond:"up{job='adguard'} == 0",              sev:"critical"},
                {alert:"HighBlockRate",        cond:"dns_blocked % dns_total > 50",         sev:"warning"},
                {alert:"DNSLatencyHigh",       cond:"dns_query_duration_p99 > 500ms",       sev:"warning"},
                {alert:"UpstreamDNSFailed",    cond:"dns_upstream_failures > 10",           sev:"critical"},
              ].map(a=>{
                const sc=a.sev==="critical"?P.red:P.amber;
                return (
                  <div key={a.alert} style={{padding:10,background:P.bg,borderRadius:6,border:`0.5px solid ${sc[1]}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,fontWeight:500,color:P.txt}}>{a.alert}</span>
                      <span style={{fontSize:11,padding:"1px 6px",borderRadius:3,background:sc[0],color:sc[2]}}>{a.sev}</span>
                    </div>
                    <div style={{fontSize:11,fontFamily:"var(--font-mono)",color:P.txts}}>{a.cond}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── K3s ─────────────────────────────────────────────────────────────────────────
function K3s({P}) {
  const aid="aK2"; const AH=`url(#${aid})`;
  return (
    <div>
      <p style={{fontSize:14,color:P.txts,margin:"0 0 20px"}}>Cluster K3s: T440p (master) + T430 (worker 1) + P52 (worker 2). T440p Parrot OS aislado en VLAN 50.</p>
      <div style={{padding:"10px 16px",background:P.amber[0],border:`0.5px solid ${P.amber[1]}`,borderRadius:8,marginBottom:20,fontSize:13,color:P.amber[2]}}>
        Ver pestaña "⭐ Worker 2" para análisis completo del P52 como tercer nodo.
      </div>
      <svg width="100%" viewBox="0 0 660 510" role="img">
        <title>Arquitectura del cluster K3s</title>
        <Arr id={aid} col={P.line}/>
        <Nd x={170} y={14} w={320} h={72} rx={10} p={P.blue} t="K3s Control Plane" s="T440p · i7-4712MQ · 16GB DDR3L · Fedora Server"/>
        <text x={330} y={104} textAnchor="middle" fontSize="10" fill={P.txts}>GitOps + CI/CD workloads</text>
        {[["ArgoCD",50],["Gitea",158],["Tekton",266],["Harbor",374],["cert-mgr",490]].map(([l,x])=>(
          <g key={l}><rect x={x-46} y={114} width={94} height={24} rx={4} fill={P.blue[0]} stroke={P.blue[1]} strokeWidth="0.5"/>
            <text x={x} y={126} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500" fill={P.blue[2]}>{l}</text>
          </g>
        ))}
        <Nd x={10}  y={178} w={290} h={68} rx={10} p={P.purple} t="Worker Node 1 · T430" s="i7-3xxx · 16GB DDR3 · Fedora Server"/>
        <Nd x={360} y={178} w={290} h={68} rx={10} p={P.amber}  t="Worker Node 2 · P52 ✓" s="i7 6C/12T · 32→64GB DDR4 · Fedora"/>
        <Ln x1={225} y1={86} x2={100} y2={178} col={P.line} dash="5 4" arr={aid}/>
        <Ln x1={435} y1={86} x2={560} y2={178} col={P.line} dash="5 4" arr={aid}/>
        {[["Longhorn",54],["Prometheus",155],["Grafana",256]].map(([l,x])=>(
          <g key={l}><rect x={x-47} y={282} width={96} height={24} rx={4} fill={P.purple[0]} stroke={P.purple[1]} strokeWidth="0.5"/>
            <text x={x} y={294} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500" fill={P.purple[2]}>{l}</text>
          </g>
        ))}
        {[["Keycloak",378],["Vault",479],["Ollama ML",578]].map(([l,x])=>(
          <g key={l}><rect x={x-47} y={282} width={96} height={24} rx={4} fill={P.amber[0]} stroke={P.amber[1]} strokeWidth="0.5"/>
            <text x={x} y={294} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500" fill={P.amber[2]}>{l}</text>
          </g>
        ))}
        <g><rect x={10} y={344} width={160} height={48} rx={8} fill={P.red[0]} stroke={P.red[1]} strokeWidth="0.5" strokeDasharray="5 3"/>
          <text x={90} y={362} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500" fill={P.red[2]}>T440p Parrot OS</text>
          <text x={90} y={380} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.red[2]}>VLAN 50 · NO cluster</text>
        </g>
        <Nd x={190} y={344} w={280} h={40} rx={10} p={P.teal}  t="Traefik Ingress · MetalLB · CoreDNS"/>
        <Ln x1={330} y1={248} x2={330} y2={344} col={P.line} dash="3 3" arr={aid}/>
        <Nd x={190} y={406} w={280} h={40} rx={10} p={P.green} t="Longhorn CSI · Persistent Volumes"/>
        <Ln x1={330} y1={384} x2={330} y2={406} col={P.line} arr={aid}/>
        <Nd x={190} y={464} w={280} h={36} rx={10} p={P.gray}  t="VLAN 20 PROD · 192.168.20.0/24"/>
        <Ln x1={330} y1={446} x2={330} y2={464} col={P.line} arr={aid}/>
      </svg>
      <div style={{marginTop:20,padding:16,background:P.bg2,borderRadius:8}}>
        <div style={{fontSize:13,fontWeight:500,marginBottom:10,color:P.txt}}>Stack del cluster</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8}}>
          {[["Orchestration","K3s (Fedora minimal)"],["GitOps","ArgoCD + Flux"],["Registry","Harbor OCI"],["Ingress","Traefik v3"],["LB","MetalLB (L2 mode)"],["Storage","Longhorn CSI"],["DNS","CoreDNS"],["TLS","cert-manager + ACME"],["Secrets","External Secrets + Vault"],["Monitoring","Prometheus + Grafana"],["Logging","Loki + Promtail"],["Tracing","Tempo / Jaeger"]].map(([k,v])=>(
            <div key={k} style={{fontSize:12}}><span style={{color:P.txts}}>{k}: </span><span style={{color:P.txt,fontFamily:"var(--font-mono)"}}>{v}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── GitOps ──────────────────────────────────────────────────────────────────────
function GitOps({P}) {
  const aid="aGO"; const AH=`url(#${aid})`;
  return (
    <div>
      <p style={{fontSize:14,color:P.txts,margin:"0 0 20px"}}>Pipeline GitOps: desde commit hasta deployment en K3s con pull-based deployments y policy-as-code.</p>
      <svg width="100%" viewBox="0 0 660 430" role="img">
        <title>Pipeline GitOps y CI/CD</title>
        <Arr id={aid} col={P.line}/>
        <Nd x={10}  y={32} w={112} h={48} p={P.gray} t="Developer" s="P53 / P52"/>
        <Nd x={176} y={32} w={120} h={48} p={P.teal} t="Gitea" s="Git + Webhooks"/>
        <Ln x1={122} y1={56} x2={176} y2={56} col={P.line} arr={aid}/>
        <text x={149} y={48} textAnchor="middle" fontSize="10" fill={P.txts}>git push</text>
        <Nd x={358} y={12} w={130} h={88} rx={8} p={P.blue} t="Tekton CI" s="Build · Test · SAST"/>
        <Ln x1={296} y1={56} x2={358} y2={56} col={P.line} arr={aid}/>
        <text x={327} y={48} textAnchor="middle" fontSize="10" fill={P.txts}>webhook</text>
        <Nd x={546} y={32} w={110} h={48} p={P.purple} t="Harbor" s="OCI Registry"/>
        <Ln x1={488} y1={56} x2={546} y2={56} col={P.line} arr={aid}/>
        <text x={517} y={48} textAnchor="middle" fontSize="10" fill={P.txts}>push img</text>
        <Nd x={176} y={144} w={120} h={48} p={P.teal} t="Config Repo" s="Helm · manifests"/>
        <Ln x1={236} y1={80} x2={236} y2={144} col={P.line} dash="5 4" arr={aid}/>
        <Nd x={358} y={134} w={130} h={68} p={P.blue} t="ArgoCD" s="Pull GitOps · Sync"/>
        <Ln x1={296} y1={168} x2={358} y2={168} col={P.line} arr={aid}/>
        <text x={327} y={160} textAnchor="middle" fontSize="10" fill={P.txts}>watches</text>
        <Nd x={176} y={264} w={370} h={72} rx={10} p={P.green} t="K3s Cluster · VLAN 20 PROD" s="T440p (master) · T430 (worker1) · P52 (worker2)"/>
        <Ln x1={423} y1={202} x2={423} y2={264} col={P.line} arr={aid}/>
        <Nd x={10}  y={268} w={142} h={64} rx={8} p={P.amber} t="Policy Engine" s="OPA · Kyverno"/>
        {[["dev",212],["staging",306],["prod",400],["monitoring",508]].map(([env,x])=>(
          <g key={env}><rect x={x-52} y={384} width={106} height={26} rx={4} fill={P.green[0]} stroke={P.green[1]} strokeWidth="0.5"/>
            <text x={x} y={397} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500" fill={P.green[2]}>{env}</text>
          </g>
        ))}
        <Ln x1={361} y1={336} x2={361} y2={384} col={P.line}/>
        <line x1={212} y1={384} x2={560} y2={384} stroke={P.line} strokeWidth="0.8"/>
      </svg>
    </div>
  );
}

// ── IAM ──────────────────────────────────────────────────────────────────────────
function IAM({P}) {
  const aid="aIM"; const AH=`url(#${aid})`;
  const clients=[["ArgoCD",P.blue],["Grafana",P.amber],["Gitea",P.teal],["Harbor",P.purple],["Vault",P.red],["VSCode",P.green]];
  return (
    <div>
      <p style={{fontSize:14,color:P.txts,margin:"0 0 20px"}}>Stack IAM enterprise: Keycloak como IdP central, Vault para secrets, RBAC nativo K3s y mTLS.</p>
      <svg width="100%" viewBox="0 0 660 410" role="img">
        <title>Arquitectura IAM y seguridad</title>
        <Arr id={aid} col={P.line}/>
        <Nd x={200} y={14} w={260} h={68} rx={10} p={P.teal} t="Keycloak IdP" s="OIDC · SAML · realms: lab/dev/ops"/>
        <Nd x={10}  y={32} w={100} h={32} p={P.gray} t="Usuarios"/>
        <Nd x={550} y={32} w={100} h={32} p={P.gray} t="AD / LDAP"/>
        <Ln x1={110} y1={48} x2={200} y2={48} col={P.line} arr={aid}/>
        <Ln x1={550} y1={48} x2={460} y2={48} col={P.line} arr={aid}/>
        {clients.map(([l,cp],i)=>{
          const x=50+i*102;
          return (
            <g key={l}>
              <rect x={x-47} y={140} width={96} height={34} rx={6} fill={cp[0]} stroke={cp[1]} strokeWidth="0.5"/>
              <text x={x} y={151} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500" fill={cp[2]}>{l}</text>
              <text x={x} y={166} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={cp[2]}>OIDC</text>
              <Ln x1={x} y1={140} x2={x<330?x+8:x-8} y2={82} col={P.line} dash="3 3" arr={aid}/>
            </g>
          );
        })}
        <Nd x={10}  y={226} w={178} h={72} rx={10} p={P.amber} t="HashiCorp Vault" s="Secrets · PKI · K8s auth"/>
        <Nd x={232} y={238} w={200} h={48} rx={10} p={P.blue}  t="External Secrets Op." s="Vault → K8s Secrets"/>
        <Ln x1={188} y1={262} x2={232} y2={262} col={P.line} arr={aid}/>
        <Nd x={478} y={226} w={172} h={72} rx={10} p={P.green} t="K3s RBAC" s="ClusterRoles · Bindings"/>
        <Ln x1={432} y1={262} x2={478} y2={262} col={P.line} arr={aid}/>
        <Nd x={160} y={348} w={340} h={48} rx={10} p={P.coral} t="mTLS · Cilium / Linkerd" s="Zero-trust inter-service"/>
        <Ln x1={330} y1={298} x2={330} y2={348} col={P.line} dash="4 4" arr={aid}/>
        <Nd x={10}  y={354} w={130} h={38} rx={8} p={P.purple} t="OPA Gatekeeper"/>
        <Nd x={520} y={354} w={130} h={38} rx={8} p={P.purple} t="Kyverno"/>
      </svg>
    </div>
  );
}

// ── Storage ──────────────────────────────────────────────────────────────────────
function Storage({P}) {
  const aid="aST"; const AH=`url(#${aid})`;
  const nodes=[
    {label:"T440p · Master", cx:110, disks:["512GB SSD (OS)","1TB HDD→SSD*","M.2 2242 256GB*"], note:"etcd · control vols"},
    {label:"T430 · Worker 1", cx:330, disks:["512GB SSD (OS)","500GB HDD→SSD*","500GB HDD→SSD*"], note:"Longhorn replicas"},
    {label:"P52 · Worker 2",  cx:550, disks:["512GB NVMe (OS)","2TB NVMe*","Quadro P1000 ML"],   note:"App vols · builds"},
  ];
  return (
    <div>
      <p style={{fontSize:14,color:P.txts,margin:"0 0 20px"}}>Almacenamiento distribuido con Longhorn CSI. 3 nodos = replicación 2× y tolerancia a fallo de un worker.</p>
      <svg width="100%" viewBox="0 0 660 370" role="img">
        <title>Arquitectura de almacenamiento Longhorn</title>
        <Arr id={aid} col={P.line}/>
        <Nd x={180} y={10} w={300} h={48} rx={10} p={P.amber} t="Longhorn Storage Engine" s="CSI Driver · Volume manager · Replica controller 2×"/>
        {nodes.map(n=>(
          <g key={n.label}>
            <rect x={n.cx-100} y={100} width={200} height={148} rx={10} fill={P.bg2} stroke={P.bdr} strokeWidth="0.5"/>
            <text x={n.cx} y={120} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="500" fill={P.txt}>{n.label}</text>
            {n.disks.map((d,i)=>(
              <g key={i}><rect x={n.cx-84} y={136+i*36} width={168} height={28} rx={4} fill={P.amber[0]} stroke={P.amber[1]} strokeWidth="0.5"/>
                <text x={n.cx} y={150+i*36} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.amber[2]}>{d}</text>
              </g>
            ))}
            <text x={n.cx} y={240} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.txts}>{n.note}</text>
            <Ln x1={n.cx} y1={58} x2={n.cx} y2={100} col={P.line} arr={aid}/>
          </g>
        ))}
        <line x1={210} y1={175} x2={230} y2={175} stroke={P.line} strokeWidth="1" strokeDasharray="4 4" markerEnd={AH}/>
        <line x1={430} y1={175} x2={450} y2={175} stroke={P.line} strokeWidth="1" strokeDasharray="4 4" markerEnd={AH}/>
        <text x={330} y={265} textAnchor="middle" fontSize="11" fill={P.txts}>Replicación 2× vía VLAN 40 · STORAGE dedicada</text>
        <text x={330} y={285} textAnchor="middle" fontSize="12" fontWeight="500" fill={P.txt}>Storage Classes</text>
        {[["longhorn (default)","RWO · 2 replicas",120,P.amber],["longhorn-single","RWO · 1 replica · dev",330,P.green],["longhorn-rwx","RWX · NFS · shared",540,P.blue]].map(([nm,desc,x,cp])=>(
          <g key={nm}><rect x={x-112} y={298} width={226} height={40} rx={6} fill={cp[0]} stroke={cp[1]} strokeWidth="0.5"/>
            <text x={x} y={312} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500" fill={cp[2]}>{nm}</text>
            <text x={x} y={328} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={cp[2]}>{desc}</text>
          </g>
        ))}
        <text x={330} y={355} textAnchor="middle" fontSize="10" fill={P.red[1]}>* Upgrades pendientes — ver pestaña Upgrades</text>
      </svg>
      <div style={{marginTop:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{padding:16,background:P.bg2,borderRadius:8}}>
          <div style={{fontSize:13,fontWeight:500,marginBottom:8,color:P.txt}}>Inventario de almacenamiento</div>
          {[["M720q","512GB NVMe — sin expansión disponible"],["T440p","512GB SSD + 1TB HDD + 1TB HDD + M.2 vacío"],["T430","512GB SSD + 500GB HDD + 500GB HDD"],["P52","512GB NVMe + 2.5\" libre + M.2 secundario"],["Dell 3501","256GB NVMe + 120GB SATA"],["T440p Parrot","512GB SSD + Ultrabay libre"]].map(([m,s])=>(
            <div key={m} style={{display:"flex",gap:8,marginBottom:6,alignItems:"baseline"}}>
              <span style={{fontSize:11,fontWeight:500,padding:"2px 6px",borderRadius:3,background:P.blue[0],color:P.blue[2],minWidth:80,flexShrink:0}}>{m}</span>
              <span style={{fontSize:12,color:P.txts}}>{s}</span>
            </div>
          ))}
        </div>
        <div style={{padding:16,background:P.bg2,borderRadius:8}}>
          <div style={{fontSize:13,fontWeight:500,marginBottom:8,color:P.txt}}>Canibalizaciones recomendadas</div>
          {["HDD 500GB T430 Ultrabay → P52 para datasets ML y build artifacts","GTX 730M del T440p server → retirar para reducir calor y consumo","120GB SATA del Dell 3501 → P52 como caché de build vía enclosure USB","Ultrabay T440p Parrot → almacenamiento capturas y evidencias pentesting"].map((tip,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:8,fontSize:13}}>
              <span style={{color:P.green[1],flexShrink:0}}>→</span>
              <span style={{color:P.txt}}>{tip}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
