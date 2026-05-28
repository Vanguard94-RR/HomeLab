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
    storage:"512GB SSD NGFF M.2 2242 (slot WAN — OS) + 1TB HDD (bahía SATA) + 1TB HDD (Ultrabay)", net:"Intel Gigabit", gpu:"GTX 730M (sin uso)", os:"Fedora Server 42",
    roleDetail:"K3s control-plane · GitOps ArgoCD/Flux · CI/CD pipelines",
    limits:["Slot M.2 2242 SATA (WAN) ocupado por SSD de OS — sin slot adicional disponible","RAM maxeada 16GB DDR3L (Haswell)","CPU 4th Gen — alto consumo","GTX 730M sin utilidad en modo server"],
    upgrades:[{text:"Reemplazar HDD Ultrabay por SSD 1TB SATA",priority:"HIGH",cost:"~$40"},{text:"Reemplazar HDD bahía SATA por SSD 1TB SATA",priority:"HIGH",cost:"~$40"}],
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
    roleDetail:"Red team · pentesting · auditorías seguridad del lab — VLAN 90 aislada",
    limits:["Aislado en VLAN 90 (PENTEST) — sin acceso a otras VLANs","NO conectar al cluster K3s bajo ninguna circunstancia"],
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
  { n:1, title:"Switch managed ✓ TL-SG108E configurado", mach:["TL-SG108E v6.0"], pal:"teal",
    reason:"COMPLETADO — TL-SG108E v6.0 instalado con 802.1Q, 6 VLANs configuradas (10/20/30/40/50/90), PVIDs asignados, vmbr1 VLAN-aware activo.", cost:"✓ hecho",
    items:["IP switch: 10.10.10.2","VLANs: 10 MGMT, 20 PROD, 30 DEV, 40 STORAGE, 50 DMZ, 90 PENTEST","Trunk en puerto 1 (M720q), Parrot aislado en puerto 8 (VLAN 90)"] },
  { n:2, title:"pfSense ✓ inter-VLAN router configurado", mach:["VM 100 · M720q"], pal:"teal",
    reason:"COMPLETADO — pfSense CE 2.7.2 con 7 interfaces activas, DHCP por VLAN, reglas de firewall enterprise, PENTEST completamente aislado.", cost:"✓ hecho",
    items:["WAN: 192.168.1.131 · LAN: 10.10.10.1","Interfaces PROD/DEV/STORAGE/DMZ/PENTEST configuradas","DHCP activo en VLAN 20/30/90","Firewall: PENTEST bloqueado de redes internas"] },
  { n:3, title:"VLANs Persistence ✓ bridge-vlan-aware persistente", mach:["M720q · Proxmox"], pal:"teal",
    reason:"COMPLETADO — /etc/network/interfaces contiene bridge-vlan-aware yes y bridge-vids 2-4094 en vmbr1. VLANs sobreviven reboot. Verificado: tap199i0 VLAN 10, veth101i0 VLAN 10.", cost:"✓ hecho",
    items:["bridge-vlan-aware yes en vmbr1","bridge-vids 2-4094 — acepta cualquier VLAN sin cambios","VM 199 tag=10 ✓ · LXC 101 eth0 tag=10 ✓ · pfSense trunk sin tag ✓"] },
  { n:4, title:"Nodos K3s conectados ✓ T440p + T430 en VLAN 20", mach:["T440p","T430"], pal:"teal",
    reason:"COMPLETADO — T440p (t440p-server) en puerto 2 y T430 (t430) en puerto 3 del switch. Ambos en VLAN 20 PROD. Pre-check: 26 passed / 0 warnings / 0 failed en ambos nodos.", cost:"✓ hecho",
    items:["t440p-server: 10.10.20.100 · master · Fedora 42 · 26/0/0 [PASS]","t430: 10.10.20.101 · worker · Fedora 42 · 26/0/0 [PASS]","Fixes aplicados: hostname, swap, SELinux, firewalld, módulos, sysctl, NTP"] },
  { n:5, title:"SSDs para nodos K3s (HDDs → SSDs)", mach:["T430","T440p Master"], pal:"red",
    reason:"etcd requiere latencia <10ms. HDDs mecánicos causan timeouts y corrompen Longhorn.", cost:"~$80–120",
    items:["2× SSD SATA 1TB para Ultrabays","1× SSD SATA 1TB para bahía principal del T440p"] },
  { n:6, title:"Definir Worker Node 2 (P52 recomendado)", mach:["P52"], pal:"amber",
    reason:"Sin tercer nodo, Longhorn no puede replicar 2× y no hay tolerancia a fallos real.", cost:"$0 (hardware existente)",
    items:["Instalar Fedora Server minimal en P52","Unir como K3s agent","Configurar taints build/prod"] },
  { n:7, title:"RAM expansión ThinkPad P52", mach:["P52"], pal:"amber",
    reason:"32GB no permiten build + ML + K3s agent simultáneamente. 64GB = nodo más potente.", cost:"~$80",
    items:["2× SO-DIMM DDR4-2666 32GB en los 2 slots libres"] },
  { n:8, title:"NVMe secundario para P52", mach:["P52"], pal:"blue",
    reason:"Slot M.2 secundario vacío — ideal para Longhorn volumes, imágenes OCI y datasets ML.", cost:"~$60–80",
    items:["1× NVMe M.2 2280 2TB (Samsung 990 EVO o similar)"] },
  { n:9, title:"UPS para M720q + switch", mach:["M720q","Switch"], pal:"blue",
    reason:"Caída de luz sin UPS corrompe etcd y tumba el cluster sin shutdown graceful.", cost:"~$80–120",
    items:["UPS 650VA con AVR (APC Back-UPS ES 650)"] },
];

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const dark = useDark();
  const P = palette(dark);
  const [tab, setTab] = useState("worker2");
  const [sel, setSel] = useState(null);
  const tabs=[{id:"worker2",l:"⭐ Worker 2"},{id:"hw",l:"Hardware"},{id:"up",l:"Upgrades"},{id:"net",l:"Red"},{id:"switch",l:"🔀 Switch & VLANs"},{id:"pfsense",l:"🔥 pfSense"},{id:"adguard",l:"🛡 AdGuard Home"},{id:"k3s",l:"Cluster K3s"},{id:"git",l:"GitOps"},{id:"iam",l:"IAM"},{id:"stor",l:"Storage"}];
  return (
    <div style={{fontFamily:"var(--font-sans)",background:P.bg,minHeight:"100vh"}}>
      <div style={{background:P.bg2,borderBottom:`0.5px solid ${P.bdr}`,padding:"20px 24px 0"}}>
        <div style={{fontSize:11,fontWeight:500,letterSpacing:"0.08em",color:P.txts,marginBottom:4}}>ENTERPRISE HOMELAB DESIGN · V2</div>
        <h1 style={{fontSize:22,fontWeight:500,margin:"0 0 4px",color:P.txt}}>HomeLab Architecture</h1>
        <p style={{fontSize:13,color:P.txts,margin:"0 0 20px"}}>
          Production-ready · K3s · GitOps · IAM · DevOps · Networking
          <span style={{marginLeft:10,padding:"2px 8px",borderRadius:4,background:P.teal[0],color:P.teal[2],fontSize:11,fontWeight:500}}>Corregido: 2 T440p</span>
          <span style={{marginLeft:6,padding:"2px 8px",borderRadius:4,background:P.green[0],color:P.green[2],fontSize:11,fontWeight:500}}>Switch ✓ VLANs ✓</span>
          <span style={{marginLeft:6,padding:"2px 8px",borderRadius:4,background:P.teal[0],color:P.teal[2],fontSize:11,fontWeight:500}}>pfSense ✓</span>
          <span style={{marginLeft:6,padding:"2px 8px",borderRadius:4,background:P.green[0],color:P.green[2],fontSize:11,fontWeight:500}}>AdGuard ✓</span>
          <span style={{marginLeft:6,padding:"2px 8px",borderRadius:4,background:P.teal[0],color:P.teal[2],fontSize:11,fontWeight:500}}>VLANs Persistent ✓</span>
          <span style={{marginLeft:6,padding:"2px 8px",borderRadius:4,background:P.blue[0],color:P.blue[2],fontSize:11,fontWeight:500}}>K3s Pre-check ✓</span>
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
        {tab==="switch"&&<SwitchVlan P={P}/>}
        {tab==="pfsense"&&<PfSense P={P}/>}
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
        <div style={{fontSize:13,color:P.blue[2]}}>El lab tiene <strong>2 T440p</strong>: uno como K3s master (Fedora Server) y uno como pentesting (Parrot OS, <strong>VLAN 90</strong> aislada). Cluster actual: <strong>T440p (master) + T430 (worker 1)</strong>. Falta Worker Node 2.</div>
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
          const label=u.pal==="teal"?"✓ COMPLETADO":u.pal==="red"?"CRÍTICO":u.pal==="amber"?"ALTO":"MEDIO";
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
    {l:"VLAN 10 MGMT", s:"10.10.10.0/24", x:14,  pal:"teal"},
    {l:"VLAN 20 PROD", s:"10.10.20.0/24", x:144, pal:"blue"},
    {l:"VLAN 30 DEV",  s:"10.10.30.0/24", x:274, pal:"purple"},
    {l:"VLAN 40 STOR", s:"10.10.40.0/24", x:404, pal:"amber"},
    {l:"VLAN 90 PEN",  s:"10.10.90.0/24", x:534, pal:"red"},
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
        <Nd x={374} y={150} w={160} h={48} rx={8} p={P.blue} t="TL-SG108E" s="802.1Q · 10.10.10.2 · ✓"/>
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
        <text x={60} y={370} textAnchor="middle" fontSize="9" fill={P.green[1]}>192.168.1.100</text>
        <text x={60} y={380} textAnchor="middle" fontSize="9" fill={P.green[1]}>(→ 10.10.10.3)</text>
      </svg>
      <div style={{marginTop:16,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
        {[
          {v:"VLAN 10 · MGMT",    d:"10.10.10.0/24 · Proxmox, switch, AdGuard", pal:"teal"},
          {v:"VLAN 20 · PROD",    d:"10.10.20.0/24 · K3s nodes, Longhorn",       pal:"blue"},
          {v:"VLAN 30 · DEV",     d:"10.10.30.0/24 · Builds, staging, CI/CD",    pal:"purple"},
          {v:"VLAN 40 · STORAGE", d:"10.10.40.0/24 · Longhorn replication",      pal:"amber"},
          {v:"VLAN 50 · DMZ",     d:"10.10.50.0/24 · Ingress / servicios",       pal:"green"},
          {v:"VLAN 90 · PENTEST", d:"10.10.90.0/24 · T440p Parrot — aislado",   pal:"red"},
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

// ── Switch & VLANs ─────────────────────────────────────────────────────────────
function SwitchVlan({P}) {
  const [activeTab, setActiveTab] = useState("overview");
  const subTabs=[{id:"overview",l:"Overview"},{id:"ports",l:"Port Layout"},{id:"vlans",l:"VLAN Table"},{id:"pvid",l:"PVID Config"},{id:"proxmox",l:"Proxmox Bridge"},{id:"persist",l:"✅ Persistence"}];

  const vlans=[
    {id:1,  name:"Default",  tagged:"—",    untagged:"1-8", subnet:"—",             pal:"gray"},
    {id:10, name:"MGMT",     tagged:"1",    untagged:"—",   subnet:"10.10.10.0/24", pal:"teal"},
    {id:20, name:"PROD",     tagged:"1",    untagged:"2-3", subnet:"10.10.20.0/24", pal:"blue"},
    {id:30, name:"DEV",      tagged:"1",    untagged:"—",   subnet:"10.10.30.0/24", pal:"purple"},
    {id:40, name:"STORAGE",  tagged:"1",    untagged:"—",   subnet:"10.10.40.0/24", pal:"amber"},
    {id:50, name:"DMZ",      tagged:"1",    untagged:"—",   subnet:"10.10.50.0/24", pal:"green"},
    {id:90, name:"PENTEST",  tagged:"1",    untagged:"8",   subnet:"10.10.90.0/24", pal:"red"},
  ];

  const ports=[
    {port:1, device:"M720q (enp1s0f0)", role:"TRUNK",          vlan:"10,20,30,40,50,90", mode:"Tagged",   pvid:1,  pal:"teal"},
    {port:2, device:"T440p (K3s master)", role:"K3s PROD",     vlan:"20",               mode:"Untagged", pvid:20, pal:"blue"},
    {port:3, device:"T430 (K3s worker1)", role:"K3s PROD",     vlan:"20",               mode:"Untagged", pvid:20, pal:"blue"},
    {port:4, device:"— libre",            role:"—",            vlan:"—",                mode:"—",        pvid:1,  pal:"gray"},
    {port:5, device:"— libre",            role:"—",            vlan:"—",                mode:"—",        pvid:1,  pal:"gray"},
    {port:6, device:"— libre",            role:"—",            vlan:"—",                mode:"—",        pvid:1,  pal:"gray"},
    {port:7, device:"— libre",            role:"—",            vlan:"—",                mode:"—",        pvid:1,  pal:"gray"},
    {port:8, device:"T440p Parrot OS",    role:"PENTEST",      vlan:"90",               mode:"Untagged", pvid:90, pal:"red"},
  ];

  return (
    <div>
      {/* Header */}
      <div style={{padding:"16px 20px",background:P.blue[0],border:`0.5px solid ${P.blue[1]}`,borderRadius:12,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:15,fontWeight:500,color:P.blue[2],marginBottom:4}}>🔀 TP-Link TL-SG108E · 802.1Q VLANs</div>
            <div style={{fontSize:13,color:P.blue[2]}}>Hardware v6.0 · Firmware 1.0.0 Build 20250710 · IP: 10.10.10.2 · MAC: AC:A7:F1:36:55:96</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,fontWeight:500,padding:"3px 8px",borderRadius:4,background:P.bg,color:P.green[1],marginBottom:4}}>✓ CONFIGURADO</div>
            <div style={{fontSize:11,color:P.blue[2]}}>vmbr1 · enp1s0f0</div>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:`0.5px solid ${P.bdr}`}}>
        {subTabs.map(s=>(
          <button key={s.id} onClick={()=>setActiveTab(s.id)} style={{padding:"7px 14px",fontSize:13,border:"none",cursor:"pointer",borderRadius:"6px 6px 0 0",background:activeTab===s.id?P.bg:"transparent",color:activeTab===s.id?P.txt:P.txts,fontWeight:activeTab===s.id?500:400,borderBottom:activeTab===s.id?`2px solid ${P.blue[1]}`:"2px solid transparent"}}>{s.l}</button>
        ))}
      </div>

      {activeTab==="overview" && (
        <div>
          <svg width="100%" viewBox="0 0 660 420" role="img">
            <title>Arquitectura física del switch TL-SG108E</title>
            <defs><marker id="aSW" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke={P.line} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></marker></defs>
            {/* ISP */}
            <Nd x={260} y={10} w={140} h={34} p={P.gray} t="Internet / ISP"/>
            {/* Proxmox */}
            <rect x={80} y={66} width={500} height={110} rx={10} fill={P.bg2} stroke={P.bdr} strokeWidth="1" strokeDasharray="5 3"/>
            <text x={100} y={85} fontSize="11" fontWeight="500" fill={P.txts}>Proxmox VE — M720q · 192.168.1.65</text>
            <Nd x={100} y={92}  w={160} h={70} rx={8} p={P.gray}  t="vmbr0 (nic0)" s="192.168.1.65 · WAN"/>
            <Nd x={280} y={92}  w={160} h={70} rx={8} p={P.teal}  t="vmbr1 (enp1s0f0)" s="VLAN-aware · trunk"/>
            <Nd x={460} y={92}  w={100} h={70} rx={8} p={P.gray}  t="AdGuard LXC" s="192.168.1.100"/>
            <Ln x1={330} y1={44} x2={180} y2={92} col={P.line} arr="aSW"/>
            <Ln x1={330} y1={44} x2={360} y2={92} col={P.line} arr="aSW"/>
            {/* Switch */}
            <Nd x={200} y={200} w={260} h={50} rx={8} p={P.blue} t="TL-SG108E · 10.10.10.2" s="8-port Gigabit · 802.1Q · v6.0"/>
            <Ln x1={360} y1={162} x2={330} y2={200} col={P.line} arr="aSW"/>
            <text x={350} y={183} fontSize="9" fill={P.blue[1]}>trunk 802.1Q</text>
            {/* Port labels */}
            {[
              {label:"P1\nTRUNK", x:160, col:P.teal},
              {label:"P2\nT440p", x:230, col:P.blue},
              {label:"P3\nT430",  x:300, col:P.blue},
              {label:"P4-7\nlibre",x:380, col:P.gray},
              {label:"P8\nParrot", x:470, col:P.red},
            ].map(n=>(
              <g key={n.label}>
                <rect x={n.x-34} y={272} width={70} height={50} rx={6} fill={n.col[0]} stroke={n.col[1]} strokeWidth="0.5"/>
                {n.label.split("\n").map((line,i)=>(
                  <text key={i} x={n.x} y={292+i*16} textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight={i===0?"500":"400"} fill={n.col[2]}>{line}</text>
                ))}
                <line x1={n.x} y1={250} x2={n.x} y2={272} stroke={n.col[1]} strokeWidth="0.8" markerEnd="url(#aSW)"/>
              </g>
            ))}
            {/* IP addresses */}
            <text x={230} y={345} textAnchor="middle" fontSize="9" fill={P.blue[1]}>VLAN 20</text>
            <text x={300} y={345} textAnchor="middle" fontSize="9" fill={P.blue[1]}>VLAN 20</text>
            <text x={470} y={345} textAnchor="middle" fontSize="9" fill={P.red[1]}>VLAN 90</text>
            {/* PVID note */}
            <text x={330} y={375} textAnchor="middle" fontSize="11" fill={P.txts}>Addressing: 10.10.{"{VLAN}"}.0/24 per VLAN · Gateway: 10.10.{"{VLAN}"}.1 (pfSense)</text>
          </svg>
          <div style={{marginTop:16,padding:16,background:P.bg2,borderRadius:8,fontSize:13,color:P.txts}}>
            <div style={{fontWeight:500,color:P.txt,marginBottom:8}}>Estado actual del lab</div>
            {[
              ["Switch IP","10.10.10.2 (VLAN 10 MGMT)"],
              ["Firmware","1.0.0 Build 20250710 — más reciente disponible"],
              ["802.1Q","Habilitado — Port-based y MTU VLAN deshabilitados"],
              ["VLANs configuradas","10, 20, 30, 40, 50, 90"],
              ["Proxmox bridge","vmbr1 — bridge-vlan-aware yes — bridge-vids 2-4094"],
              ["pfSense","Pendiente de configuración como inter-VLAN router"],
              ["AdGuard","192.168.1.100 (temporal) → migrará a 10.10.10.3 post-pfSense"],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",gap:8,marginBottom:6,fontSize:13}}>
                <span style={{color:P.txts,minWidth:160,flexShrink:0}}>{k}</span>
                <span style={{color:P.txt}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab==="ports" && (
        <div>
          <p style={{fontSize:14,color:P.txts,margin:"0 0 16px"}}>Layout físico de puertos del switch. Puerto 1 = trunk hacia Proxmox. Puerto 8 = Parrot OS aislado.</p>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:P.bg2}}>
                  {["Puerto","Dispositivo","Rol","VLAN(s)","Modo","PVID"].map(h=>(
                    <th key={h} style={{padding:"10px 12px",textAlign:"left",color:P.txts,fontWeight:500,borderBottom:`1px solid ${P.bdr}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ports.map(p=>{
                  const cp=P[p.pal];
                  return (
                    <tr key={p.port} style={{borderBottom:`0.5px solid ${P.bdr}`}}>
                      <td style={{padding:"10px 12px"}}>
                        <span style={{fontWeight:600,padding:"2px 8px",borderRadius:4,background:cp[0],color:cp[2]}}>P{p.port}</span>
                      </td>
                      <td style={{padding:"10px 12px",color:P.txt}}>{p.device}</td>
                      <td style={{padding:"10px 12px"}}>
                        <span style={{fontSize:11,padding:"2px 7px",borderRadius:4,background:cp[0],color:cp[2]}}>{p.role}</span>
                      </td>
                      <td style={{padding:"10px 12px",color:P.txt,fontFamily:"var(--font-mono)",fontSize:12}}>{p.vlan}</td>
                      <td style={{padding:"10px 12px",color:p.mode==="Tagged"?P.blue[1]:p.mode==="Untagged"?P.green[1]:P.txts}}>{p.mode}</td>
                      <td style={{padding:"10px 12px",fontFamily:"var(--font-mono)",fontSize:12,color:P.txt}}>{p.pvid}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:16,padding:14,background:P.bg2,borderRadius:8,fontSize:13,color:P.txts}}>
            <strong style={{color:P.txt}}>Puertos libres 4-7:</strong> disponibles para P52 (VLAN 20), Dell 3501 (VLAN 10), y expansión futura.
          </div>
        </div>
      )}

      {activeTab==="vlans" && (
        <div>
          <p style={{fontSize:14,color:P.txts,margin:"0 0 16px"}}>Tabla completa de VLANs 802.1Q configuradas en el switch.</p>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:P.bg2}}>
                  {["VLAN ID","Nombre","Subred","Gateway (pfSense)","Tagged","Untagged"].map(h=>(
                    <th key={h} style={{padding:"10px 12px",textAlign:"left",color:P.txts,fontWeight:500,borderBottom:`1px solid ${P.bdr}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vlans.map(v=>{
                  const cp=P[v.pal];
                  return (
                    <tr key={v.id} style={{borderBottom:`0.5px solid ${P.bdr}`}}>
                      <td style={{padding:"10px 12px"}}>
                        <span style={{fontWeight:600,padding:"2px 8px",borderRadius:4,background:cp[0],color:cp[2]}}>{v.id}</span>
                      </td>
                      <td style={{padding:"10px 12px",fontWeight:500,color:cp[2]}}>{v.name}</td>
                      <td style={{padding:"10px 12px",fontFamily:"var(--font-mono)",fontSize:12,color:P.txt}}>{v.subnet}</td>
                      <td style={{padding:"10px 12px",fontFamily:"var(--font-mono)",fontSize:12,color:P.txts}}>
                        {v.subnet!=="—" ? v.subnet.replace("0/24","1") : "—"}
                      </td>
                      <td style={{padding:"10px 12px",color:P.txt}}>{v.tagged}</td>
                      <td style={{padding:"10px 12px",color:P.txt}}>{v.untagged}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:16,padding:14,background:P.red[0],border:`0.5px solid ${P.red[1]}`,borderRadius:8,fontSize:13,color:P.red[2]}}>
            <strong>VLAN 90 PENTEST:</strong> completamente aislada. pfSense tendrá reglas que bloqueen cualquier tráfico hacia/desde otras VLANs. El T440p Parrot OS no tiene ruta a 10.10.x.x excepto 10.10.90.0/24.
          </div>
        </div>
      )}

      {activeTab==="pvid" && (
        <div>
          <p style={{fontSize:14,color:P.txts,margin:"0 0 16px"}}>El PVID define a qué VLAN se asigna el tráfico no etiquetado que entra por cada puerto.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12,marginBottom:20}}>
            {ports.map(p=>{
              const cp=P[p.pal];
              return (
                <div key={p.port} style={{padding:14,background:P.bg,border:`0.5px solid ${P.bdr}`,borderRadius:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:14,fontWeight:600,padding:"2px 10px",borderRadius:4,background:cp[0],color:cp[2]}}>Puerto {p.port}</span>
                    <span style={{fontSize:13,fontFamily:"var(--font-mono)",fontWeight:500,color:P.txt}}>PVID {p.pvid}</span>
                  </div>
                  <div style={{fontSize:12,color:P.txt,marginBottom:4}}>{p.device}</div>
                  <div style={{fontSize:11,color:P.txts}}>{p.mode==="Tagged"?"Trunk — envía tráfico pre-etiquetado":p.mode==="Untagged"?`Tráfico sin tag → VLAN ${p.pvid}`:"Sin dispositivo"}</div>
                </div>
              );
            })}
          </div>
          <div style={{padding:14,background:P.bg2,borderRadius:8}}>
            <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:8}}>Lógica del PVID</div>
            <div style={{fontSize:13,color:P.txts,lineHeight:1.8}}>
              Cuando un frame llega al <strong style={{color:P.txt}}>puerto 2 (T440p)</strong> sin etiqueta VLAN, el switch le asigna <strong style={{color:P.txt}}>PVID 20</strong> y lo trata como tráfico de VLAN 20. Al salir por el puerto 1 (trunk), el switch agrega la etiqueta <strong style={{color:P.txt}}>VLAN 20</strong>. En dirección inversa: el frame llega al puerto 1 etiquetado como VLAN 20, el switch elimina la etiqueta y lo entrega al puerto 2 como frame Ethernet normal.
            </div>
          </div>
        </div>
      )}

      {activeTab==="proxmox" && (
        <div>
          <p style={{fontSize:14,color:P.txts,margin:"0 0 16px"}}>Configuración del bridge vmbr1 en Proxmox que actúa como el trunk hacia el switch.</p>
          <div style={{padding:"14px 18px",background:P.bg2,border:`0.5px solid ${P.bdr}`,borderRadius:8,marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:10}}>/etc/network/interfaces — vmbr1</div>
            <pre style={{fontFamily:"var(--font-mono)",fontSize:12,color:P.txt,lineHeight:1.9,margin:0}}>
              {`auto vmbr1\niface vmbr1 inet manual\n        bridge-ports enp1s0f0\n        bridge-stp off\n        bridge-fd 0\n        bridge-vlan-aware yes\n        bridge-vids 2-4094\n#LAN trunk 802.1Q → TL-SG108E`}
            </pre>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:10}}>Asignar VMs/LXCs a VLANs</div>
            <pre style={{fontFamily:"var(--font-mono)",fontSize:12,color:P.txt,lineHeight:1.9,padding:"14px 18px",background:P.bg2,borderRadius:8,margin:0}}>
              {`# VM en VLAN 20 (PROD)\nqm set <VMID> --net0 virtio,bridge=vmbr1,tag=20\n\n# LXC en VLAN 10 (MGMT)\npct set <CTID> --net0 name=eth0,bridge=vmbr1,tag=10,ip=10.10.10.x/24,gw=10.10.10.1\n\n# Verificar bridge\nbridge vlan show\nip link show vmbr1`}
            </pre>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[
              {label:"vmbr0",sub:"nic0 · 192.168.1.65 · ISP/WAN",pal:"gray"},
              {label:"vmbr1",sub:"enp1s0f0 · VLAN-aware · trunk switch",pal:"blue"},
              {label:"vmbr2",sub:"enp1s0f1 · VPN uplink (futuro)",pal:"gray"},
              {label:"vmbr3",sub:"enp1s0f2 · OPT2 reservado",pal:"gray"},
              {label:"vmbr4",sub:"enp1s0f3 · Storage/backup",pal:"gray"},
            ].map(b=>{
              const cp=P[b.pal];
              return (
                <div key={b.label} style={{padding:12,background:cp[0],borderRadius:8,border:`0.5px solid ${cp[1]}`}}>
                  <div style={{fontSize:13,fontWeight:600,color:cp[2],fontFamily:"var(--font-mono)",marginBottom:4}}>{b.label}</div>
                  <div style={{fontSize:12,color:cp[2]}}>{b.sub}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab==="persist" && (
        <div>
          <div style={{padding:"14px 18px",background:P.teal[0],border:`0.5px solid ${P.teal[1]}`,borderRadius:12,marginBottom:20}}>
            <div style={{fontSize:14,fontWeight:500,color:P.teal[2],marginBottom:4}}>✅ VLAN Persistence — Verified & Active</div>
            <div style={{fontSize:13,color:P.teal[2]}}>vmbr1 has <code>bridge-vlan-aware yes</code> and <code>bridge-vids 2-4094</code> in <code>/etc/network/interfaces</code>. VLANs survive reboots without manual intervention.</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <div style={{padding:16,background:P.bg2,borderRadius:8}}>
              <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:12}}>Key parameters in /etc/network/interfaces</div>
              {[
                {param:"bridge-vlan-aware yes",effect:"Enables 802.1Q mode — without this, all VLAN tags are stripped"},
                {param:"bridge-vids 2-4094",  effect:"Physical port accepts any VLAN tag — no changes needed when adding new VLANs"},
                {param:"tag=10 on VM/LXC",    effect:"Bridge port assigned to VLAN 10 — frames tagged/untagged at the bridge"},
                {param:"no tag on pfSense",   effect:"Trunk mode — pfSense receives all tagged frames and handles 802.1Q internally"},
              ].map(p=>(
                <div key={p.param} style={{marginBottom:10,padding:"8px 10px",background:P.bg,borderRadius:6,border:`0.5px solid ${P.bdr}`}}>
                  <div style={{fontSize:11,fontFamily:"var(--font-mono)",color:P.blue[1],marginBottom:3}}>{p.param}</div>
                  <div style={{fontSize:11,color:P.txts}}>{p.effect}</div>
                </div>
              ))}
            </div>
            <div style={{padding:16,background:P.bg2,borderRadius:8}}>
              <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:12}}>Active bridge VLAN table (verified)</div>
              {[
                {port:"enp1s0f0",  vlan:"1 + 2-4094",  role:"Physical trunk → TL-SG108E",    ok:true},
                {port:"tap100i1",  vlan:"1 (trunk)",    role:"pfSense LAN — no tag",          ok:true},
                {port:"tap199i0",  vlan:"10 PVID",      role:"Windows VM — VLAN 10 MGMT",     ok:true},
                {port:"veth101i0", vlan:"10 PVID",      role:"AdGuard eth0 — VLAN 10 MGMT",   ok:true},
                {port:"veth101i1", vlan:"1 PVID",       role:"AdGuard eth1 — vmbr0 Telmex",   ok:true},
              ].map(r=>(
                <div key={r.port} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,fontSize:12}}>
                  <span style={{color:P.green[1],flexShrink:0}}>✓</span>
                  <span style={{fontFamily:"var(--font-mono)",color:P.txt,minWidth:100,flexShrink:0}}>{r.port}</span>
                  <span style={{padding:"1px 6px",borderRadius:3,background:P.blue[0],color:P.blue[2],fontSize:11,flexShrink:0}}>{r.vlan}</span>
                  <span style={{color:P.txts}}>{r.role}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{padding:16,background:P.bg2,borderRadius:8,marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:10}}>Verification commands</div>
            <pre style={{fontFamily:"var(--font-mono)",fontSize:12,color:P.txt,lineHeight:1.9,margin:0,whiteSpace:"pre-wrap"}}>
              {`# Verify VLAN-aware mode is active\ncat /sys/class/net/vmbr1/bridge/vlan_filtering\n# Expected: 1\n\n# Show active port VLAN assignments\nbridge vlan show | grep -E "^(tap|veth)" | grep -v "^\\s"\n\n# Verify config survives reboot\ngrep -A6 "auto vmbr1" /etc/network/interfaces`}
            </pre>
          </div>
          <div style={{padding:14,background:P.amber[0],border:`0.5px solid ${P.amber[1]}`,borderRadius:8,fontSize:13,color:P.amber[2]}}>
            <strong>Adding new VLANs:</strong> No changes to <code>/etc/network/interfaces</code> needed. Add VLAN to TL-SG108E switch → add interface in pfSense → assign <code>tag=N</code> to VM/LXC. The <code>bridge-vids 2-4094</code> range handles it automatically.
          </div>
        </div>
      )}
    </div>
  );
}

// ── pfSense ─────────────────────────────────────────────────────────────────────
function PfSense({P}) {
  const [activeTab, setActiveTab] = useState("overview");
  const subTabs=[{id:"overview",l:"Overview"},{id:"interfaces",l:"Interfaces"},{id:"dhcp",l:"DHCP"},{id:"firewall",l:"Firewall Rules"},{id:"routing",l:"Routing Diagram"}];

  const interfaces=[
    {name:"WAN",      iface:"vtnet0",    vlan:"—",  ip:"192.168.1.131", mask:"/24", role:"ISP uplink",       pal:"gray",   status:"UP"},
    {name:"LAN",      iface:"vtnet1",    vlan:"10", ip:"10.10.10.1",    mask:"/24", role:"MGMT gateway",     pal:"teal",   status:"UP"},
    {name:"PROD",     iface:"vtnet1.20", vlan:"20", ip:"10.10.20.1",    mask:"/24", role:"K3s cluster",      pal:"blue",   status:"UP"},
    {name:"DEV",      iface:"vtnet1.30", vlan:"30", ip:"10.10.30.1",    mask:"/24", role:"Development",      pal:"purple", status:"UP"},
    {name:"STORAGE",  iface:"vtnet1.40", vlan:"40", ip:"10.10.40.1",    mask:"/24", role:"Longhorn traffic",  pal:"amber",  status:"UP"},
    {name:"DMZ",      iface:"vtnet1.50", vlan:"50", ip:"10.10.50.1",    mask:"/24", role:"Ingress services",  pal:"green",  status:"UP"},
    {name:"PENTEST",  iface:"vtnet1.90", vlan:"90", ip:"10.10.90.1",    mask:"/24", role:"Red team isolated", pal:"red",    status:"UP"},
  ];

  const dhcpPools=[
    {vlan:"VLAN 20 PROD",    from:"10.10.20.100", to:"10.10.20.200", dns:"10.10.10.3", domain:"lab.internal", pal:"blue"},
    {vlan:"VLAN 30 DEV",     from:"10.10.30.100", to:"10.10.30.200", dns:"10.10.10.3", domain:"lab.internal", pal:"purple"},
    {vlan:"VLAN 90 PENTEST", from:"10.10.90.100", to:"10.10.90.150", dns:"10.10.90.1", domain:"—",            pal:"red"},
  ];

  const fwRules=[
    {iface:"LAN",     action:"pass",  src:"LAN subnets",     dst:"any",             desc:"Default allow LAN to any",              pal:"teal"},
    {iface:"PROD",    action:"pass",  src:"PROD subnets",    dst:"any",             desc:"Allow PROD to internet",                pal:"blue"},
    {iface:"PROD",    action:"pass",  src:"PROD subnets",    dst:"STORAGE subnets", desc:"Allow PROD to STORAGE (Longhorn)",      pal:"blue"},
    {iface:"DEV",     action:"pass",  src:"DEV subnets",     dst:"any",             desc:"Allow DEV to internet",                 pal:"purple"},
    {iface:"DEV",     action:"pass",  src:"DEV subnets",     dst:"PROD subnets",    desc:"Allow DEV to PROD (K3s deploy)",        pal:"purple"},
    {iface:"STORAGE", action:"pass",  src:"STORAGE subnets", dst:"STORAGE subnets", desc:"Allow STORAGE intra-VLAN (Longhorn)",   pal:"amber"},
    {iface:"PENTEST", action:"block", src:"PENTEST subnets", dst:"10.10.0.0/8",     desc:"Block PENTEST to all internal",         pal:"red"},
    {iface:"PENTEST", action:"pass",  src:"PENTEST subnets", dst:"any",             desc:"Allow PENTEST to internet",             pal:"red"},
  ];

  return (
    <div>
      {/* Header */}
      <div style={{padding:"16px 20px",background:P.teal[0],border:`0.5px solid ${P.teal[1]}`,borderRadius:12,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:15,fontWeight:500,color:P.teal[2],marginBottom:4}}>🔥 pfSense CE 2.7.2</div>
            <div style={{fontSize:13,color:P.teal[2]}}>VM 100 · 2 vCPU · 2GB RAM · 32GB disk · FreeBSD 14 · WAN: 192.168.1.131 · LAN: 10.10.10.1</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,fontWeight:500,padding:"3px 8px",borderRadius:4,background:P.bg,color:P.green[1],marginBottom:4}}>✓ CONFIGURADO</div>
            <div style={{fontSize:11,color:P.teal[2]}}>7 interfaces · 6 VLANs · Firewall active</div>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:`0.5px solid ${P.bdr}`}}>
        {subTabs.map(s=>(
          <button key={s.id} onClick={()=>setActiveTab(s.id)} style={{padding:"7px 14px",fontSize:13,border:"none",cursor:"pointer",borderRadius:"6px 6px 0 0",background:activeTab===s.id?P.bg:"transparent",color:activeTab===s.id?P.txt:P.txts,fontWeight:activeTab===s.id?500:400,borderBottom:activeTab===s.id?`2px solid ${P.teal[1]}`:"2px solid transparent"}}>{s.l}</button>
        ))}
      </div>

      {activeTab==="overview" && (
        <div>
          <svg width="100%" viewBox="0 0 660 440" role="img">
            <title>pfSense architecture overview</title>
            <defs><marker id="aPF" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke={P.line} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></marker></defs>
            {/* ISP */}
            <Nd x={260} y={10} w={140} h={34} p={P.gray} t="Internet / ISP"/>
            {/* Proxmox box */}
            <rect x={60} y={60} width={540} height={130} rx={10} fill={P.bg2} stroke={P.bdr} strokeWidth="1" strokeDasharray="5 3"/>
            <text x={80} y={78} fontSize="11" fontWeight="500" fill={P.txts}>Proxmox VE — M720q · VM 100</text>
            {/* pfSense VM */}
            <rect x={80} y={86} width={500} height={92} rx={8} fill={P.teal[0]} stroke={P.teal[1]} strokeWidth="1"/>
            <text x={330} y={110} textAnchor="middle" fontSize="13" fontWeight="500" fill={P.teal[2]}>pfSense CE 2.7.2</text>
            <text x={330} y={128} textAnchor="middle" fontSize="10" fill={P.teal[2]}>2 vCPU · 2GB RAM · FreeBSD 14 · domain: lab.internal</text>
            {/* vtnet0 WAN */}
            <rect x={100} y={142} width={140} height={28} rx={4} fill={P.gray[0]} stroke={P.gray[1]} strokeWidth="0.5"/>
            <text x={170} y={156} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.gray[2]}>vtnet0 WAN · 192.168.1.131</text>
            {/* vtnet1 LAN */}
            <rect x={420} y={142} width={140} height={28} rx={4} fill={P.blue[0]} stroke={P.blue[1]} strokeWidth="0.5"/>
            <text x={490} y={156} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.blue[2]}>vtnet1 LAN trunk · 10.10.10.1</text>
            <line x1={330} y1={44} x2={170} y2={86} stroke={P.line} strokeWidth="1" markerEnd="url(#aPF)"/>
            <line x1={330} y1={44} x2={490} y2={86} stroke={P.line} strokeWidth="1" markerEnd="url(#aPF)"/>
            {/* VLAN sub-interfaces */}
            {[
              {l:"vtnet1.20\nPROD · 10.10.20.1",  x:60,  pal:P.blue},
              {l:"vtnet1.30\nDEV · 10.10.30.1",   x:180, pal:P.purple},
              {l:"vtnet1.40\nSTOR · 10.10.40.1",  x:300, pal:P.amber},
              {l:"vtnet1.50\nDMZ · 10.10.50.1",   x:420, pal:P.green},
              {l:"vtnet1.90\nPEN · 10.10.90.1",   x:540, pal:P.red},
            ].map(n=>(
              <g key={n.l}>
                <rect x={n.x} y={214} width={110} height={44} rx={6} fill={n.pal[0]} stroke={n.pal[1]} strokeWidth="0.5"/>
                {n.l.split("\n").map((line,i)=>(
                  <text key={i} x={n.x+55} y={230+i*14} textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight={i===0?"500":"400"} fill={n.pal[2]}>{line}</text>
                ))}
                <line x1={490} y1={196} x2={n.x+55} y2={214} stroke={n.pal[1]} strokeWidth="0.7" strokeDasharray="3 2" markerEnd="url(#aPF)"/>
              </g>
            ))}
            {/* Switch */}
            <Nd x={190} y={282} w={280} h={38} rx={8} p={P.blue} t="TL-SG108E · 10.10.10.2" s="802.1Q trunk ← port 1"/>
            <line x1={330} y1={258} x2={330} y2={282} stroke={P.line} strokeWidth="1.2" markerEnd="url(#aPF)"/>
            {/* End nodes */}
            {[
              {l:"T440p\nP2·V20",   x:110, pal:P.blue},
              {l:"T430\nP3·V20",    x:230, pal:P.blue},
              {l:"libre\nP4-7",     x:350, pal:P.gray},
              {l:"Parrot\nP8·V90",  x:470, pal:P.red},
            ].map(n=>(
              <g key={n.l}>
                <rect x={n.x-44} y={348} width={90} height={42} rx={6} fill={n.pal[0]} stroke={n.pal[1]} strokeWidth="0.5"/>
                {n.l.split("\n").map((line,i)=>(
                  <text key={i} x={n.x} y={363+i*14} textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight={i===0?"500":"400"} fill={n.pal[2]}>{line}</text>
                ))}
                <line x1={n.x} y1={320} x2={n.x} y2={348} stroke={n.pal[1]} strokeWidth="0.7" markerEnd="url(#aPF)"/>
              </g>
            ))}
          </svg>
          <div style={{marginTop:16,padding:16,background:P.bg2,borderRadius:8}}>
            <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:10}}>Estado actual del lab</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
              {[
                ["pfSense version","CE 2.7.2-RELEASE (amd64)"],
                ["WAN IP","192.168.1.131 (DHCP)"],
                ["LAN IP","10.10.10.1/24 (MGMT)"],
                ["Interfaces activas","7 (WAN + LAN + 5 VLAN)"],
                ["DHCP activo","VLAN 20, 30, 90"],
                ["Firewall rules","8 reglas configuradas"],
                ["NAT","Auto outbound masquerade"],
                ["RAM asignada","2GB (optimizado de 4.5GB)"],
                ["Domain","lab.internal"],
                ["DNS primario","10.10.10.3 (AdGuard)"],
              ].map(([k,v])=>(
                <div key={k} style={{fontSize:12}}>
                  <span style={{color:P.txts}}>{k}: </span>
                  <span style={{color:P.txt,fontWeight:500}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab==="interfaces" && (
        <div>
          <p style={{fontSize:14,color:P.txts,margin:"0 0 16px"}}>7 interfaces activas. vtnet1 actúa como trunk 802.1Q hacia el switch. Las sub-interfaces VLAN son ruteadas por pfSense.</p>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:P.bg2}}>
                  {["Interface","pfSense Name","VLAN","IP Address","Subnet","Role","Status"].map(h=>(
                    <th key={h} style={{padding:"10px 12px",textAlign:"left",color:P.txts,fontWeight:500,borderBottom:`1px solid ${P.bdr}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {interfaces.map(i=>{
                  const cp=P[i.pal];
                  return (
                    <tr key={i.name} style={{borderBottom:`0.5px solid ${P.bdr}`}}>
                      <td style={{padding:"10px 12px"}}>
                        <span style={{fontWeight:600,padding:"2px 8px",borderRadius:4,background:cp[0],color:cp[2]}}>{i.name}</span>
                      </td>
                      <td style={{padding:"10px 12px",fontFamily:"var(--font-mono)",fontSize:11,color:P.txts}}>{i.iface}</td>
                      <td style={{padding:"10px 12px",color:P.txt}}>{i.vlan}</td>
                      <td style={{padding:"10px 12px",fontFamily:"var(--font-mono)",fontSize:12,color:P.txt,fontWeight:500}}>{i.ip}</td>
                      <td style={{padding:"10px 12px",color:P.txts}}>{i.mask}</td>
                      <td style={{padding:"10px 12px",color:P.txt}}>{i.role}</td>
                      <td style={{padding:"10px 12px"}}><span style={{color:P.green[1],fontWeight:500}}>↑ {i.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:16,padding:14,background:P.blue[0],border:`0.5px solid ${P.blue[1]}`,borderRadius:8,fontSize:13,color:P.blue[2]}}>
            <strong>Nota VLAN 10:</strong> La interfaz LAN (vtnet1) <em>es</em> VLAN 10. No se crea como sub-interfaz — el trunk físico actúa directamente como gateway `10.10.10.1` para VLAN 10 MGMT.
          </div>
        </div>
      )}

      {activeTab==="dhcp" && (
        <div>
          <p style={{fontSize:14,color:P.txts,margin:"0 0 16px"}}>DHCP activo en VLANs con clientes dinámicos. STORAGE y DMZ usan IPs estáticas.</p>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
            {dhcpPools.map(d=>{
              const cp=P[d.pal];
              return (
                <div key={d.vlan} style={{padding:16,background:P.bg,border:`0.5px solid ${P.bdr}`,borderRadius:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <span style={{fontSize:14,fontWeight:500,padding:"3px 10px",borderRadius:4,background:cp[0],color:cp[2]}}>{d.vlan}</span>
                    <span style={{fontSize:11,color:P.txts,fontFamily:"var(--font-mono)"}}>{d.from} – {d.to}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,fontSize:12}}>
                    {[["Pool From",d.from],["Pool To",d.to],["DNS Server",d.dns],["Domain",d.domain]].map(([k,v])=>(
                      <div key={k}>
                        <div style={{color:P.txts,marginBottom:2}}>{k}</div>
                        <div style={{color:P.txt,fontFamily:"var(--font-mono)",fontWeight:500}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {d.pal==="red"&&(
                    <div style={{marginTop:10,padding:"6px 10px",background:P.red[0],borderRadius:4,fontSize:11,color:P.red[2]}}>
                      ⚠ DNS apunta a 10.10.90.1 (pfSense local) — NO a AdGuard. Previene visibilidad de servicios internos lab.internal desde PENTEST.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{padding:14,background:P.bg2,borderRadius:8,fontSize:13}}>
            <div style={{fontWeight:500,color:P.txt,marginBottom:8}}>VLANs sin DHCP — IPs estáticas</div>
            {[
              ["VLAN 10 MGMT","Proxmox (192.168.1.65→10.10.10.x), switch (10.10.10.2), AdGuard (10.10.10.3)"],
              ["VLAN 40 STORAGE","K3s nodes con IPs estáticas asignadas por Longhorn/MetalLB"],
              ["VLAN 50 DMZ","Traefik Ingress con IP estática vía K3s MetalLB"],
            ].map(([v,d])=>(
              <div key={v} style={{display:"flex",gap:8,marginBottom:6,fontSize:12}}>
                <span style={{color:P.txt,fontWeight:500,minWidth:120,flexShrink:0}}>{v}</span>
                <span style={{color:P.txts}}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab==="firewall" && (
        <div>
          <p style={{fontSize:14,color:P.txts,margin:"0 0 16px"}}>Política: <strong style={{color:P.txt}}>Default DENY</strong> — solo tráfico explícitamente permitido pasa. Reglas evaluadas top-to-bottom por interfaz.</p>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:P.bg2}}>
                  {["Interface","Action","Source","Destination","Description"].map(h=>(
                    <th key={h} style={{padding:"10px 12px",textAlign:"left",color:P.txts,fontWeight:500,borderBottom:`1px solid ${P.bdr}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fwRules.map((r,i)=>{
                  const cp=P[r.pal];
                  const isBlock=r.action==="block";
                  return (
                    <tr key={i} style={{borderBottom:`0.5px solid ${P.bdr}`,background:isBlock?P.red[0]:"transparent"}}>
                      <td style={{padding:"9px 12px"}}>
                        <span style={{fontSize:11,fontWeight:500,padding:"2px 7px",borderRadius:3,background:cp[0],color:cp[2]}}>{r.iface}</span>
                      </td>
                      <td style={{padding:"9px 12px"}}>
                        <span style={{fontSize:11,fontWeight:600,color:isBlock?P.red[1]:P.green[1]}}>{isBlock?"✗ BLOCK":"✓ PASS"}</span>
                      </td>
                      <td style={{padding:"9px 12px",fontFamily:"var(--font-mono)",fontSize:11,color:P.txt}}>{r.src}</td>
                      <td style={{padding:"9px 12px",fontFamily:"var(--font-mono)",fontSize:11,color:P.txt}}>{r.dst}</td>
                      <td style={{padding:"9px 12px",color:P.txts}}>{r.desc}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:16,padding:14,background:P.red[0],border:`0.5px solid ${P.red[1]}`,borderRadius:8,fontSize:13,color:P.red[2]}}>
            <strong>PENTEST isolation:</strong> La regla BLOCK de PENTEST→10.10.0.0/8 debe estar ANTES de la regla PASS. pfSense evalúa top-to-bottom y se detiene en el primer match. El orden es crítico.
          </div>
          <div style={{marginTop:12,padding:14,background:P.amber[0],border:`0.5px solid ${P.amber[1]}`,borderRadius:8,fontSize:13,color:P.amber[2]}}>
            <strong>DMZ pendiente:</strong> Las reglas de DMZ se configurarán cuando Traefik Ingress esté desplegado en K3s. Permitirá HTTPS entrante del WAN hacia K3s services.
          </div>
        </div>
      )}

      {activeTab==="routing" && (
        <div>
          <p style={{fontSize:14,color:P.txts,margin:"0 0 16px"}}>Diagrama de routing inter-VLAN. pfSense como router central con política de acceso enterprise.</p>
          <svg width="100%" viewBox="0 0 660 460" role="img">
            <title>pfSense inter-VLAN routing diagram</title>
            <defs><marker id="aPFR" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke={P.line} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></marker></defs>
            {/* Internet */}
            <Nd x={260} y={10} w={140} h={34} p={P.gray} t="Internet"/>
            {/* pfSense center */}
            <rect x={210} y={68} width={240} height={60} rx={10} fill={P.teal[0]} stroke={P.teal[1]} strokeWidth="1.5"/>
            <text x={330} y={92} textAnchor="middle" fontSize="13" fontWeight="500" fill={P.teal[2]}>pfSense Firewall</text>
            <text x={330} y={110} textAnchor="middle" fontSize="10" fill={P.teal[2]}>NAT · Routing · Firewall Rules</text>
            <line x1={330} y1={44} x2={330} y2={68} stroke={P.line} strokeWidth="1.2" markerEnd="url(#aPFR)"/>
            {/* VLANs around pfSense */}
            {[
              {l:"MGMT\n10.10.10.0/24",    x:50,  y:180, pal:P.teal,   allow:"→ any",              color:"teal"},
              {l:"PROD\n10.10.20.0/24",    x:50,  y:270, pal:P.blue,   allow:"→ internet\n→ STOR", color:"blue"},
              {l:"DEV\n10.10.30.0/24",     x:50,  y:360, pal:P.purple, allow:"→ internet\n→ PROD", color:"purple"},
              {l:"STORAGE\n10.10.40.0/24", x:500, y:180, pal:P.amber,  allow:"→ self only",         color:"amber"},
              {l:"DMZ\n10.10.50.0/24",     x:500, y:270, pal:P.green,  allow:"pending",             color:"green"},
              {l:"PENTEST\n10.10.90.0/24", x:500, y:360, pal:P.red,    allow:"✗ internal\n→ internet", color:"red"},
            ].map(n=>(
              <g key={n.l}>
                <rect x={n.x} y={n.y} width={140} height={52} rx={8} fill={n.pal[0]} stroke={n.pal[1]} strokeWidth="0.5"/>
                {n.l.split("\n").map((line,i)=>(
                  <text key={i} x={n.x+70} y={n.y+18+i*16} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight={i===0?"500":"400"} fill={n.pal[2]}>{line}</text>
                ))}
                <text x={n.x+70} y={n.y+52+10} textAnchor="middle" fontSize="9" fill={n.pal[1]}>{n.allow.split("\n")[0]}</text>
                {n.allow.split("\n")[1]&&<text x={n.x+70} y={n.y+52+22} textAnchor="middle" fontSize="9" fill={n.pal[1]}>{n.allow.split("\n")[1]}</text>}
                <line x1={n.x>300?n.x:n.x+140} y1={n.y+26} x2={n.x>300?450:210} y2={98+Math.min(n.y-180,60)} stroke={n.pal[1]} strokeWidth="0.8" strokeDasharray="4 3" markerEnd="url(#aPFR)"/>
              </g>
            ))}
            {/* Legend */}
            <text x={330} y={430} textAnchor="middle" fontSize="11" fill={P.txts}>Default DENY between VLANs unless explicitly allowed · NAT masquerade on WAN for all internal subnets</text>
          </svg>
        </div>
      )}
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
            <text x={170} y={100} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.teal[2]}>WAN: eth0 (ISP) · LAN: vmbr1 VLAN trunk</text>
            <text x={170} y={116} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.teal[2]}>DNS forwarder → 10.10.10.3</text>
            <text x={170} y={132} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.teal[2]}>DHCP option 6 → 10.10.10.3 por VLAN</text>

            {/* AdGuard LXC */}
            <rect x={350} y={44} width={280} height={100} rx={8} fill={P.green[0]} stroke={P.green[1]} strokeWidth="1"/>
            <text x={490} y={68} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="500" fill={P.green[2]}>AdGuard Home LXC ✓</text>
            <text x={490} y={84} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.green[2]}>1 vCPU · 256MB RAM · 512MB disk</text>
            <text x={490} y={100} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.green[2]}>eth0: 10.10.10.3 (VLAN 10)</text>
            <text x={490} y={116} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.green[2]}>eth1: 192.168.1.100 (Telmex LAN)</text>
            <text x={490} y={132} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.green[2]}>Dual-homed · Unprivileged · nesting=1</text>

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

          <div style={{marginTop:20,padding:"14px 18px",background:P.bg2,border:`0.5px solid ${P.bdr}`,borderRadius:8}}>
            <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:10}}>Creación del contenedor LXC (configuración real usada)</div>
            <pre style={{fontFamily:"var(--font-mono)",fontSize:12,color:P.txts,lineHeight:2,margin:0,whiteSpace:"pre-wrap"}}>
              <span style={{color:P.txts}}>{`# Original creation (flat network — pre-VLAN)\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`pct create 101 local:vztmpl/alpine-3.22-default_20250617_amd64.tar.xz \\\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`  --hostname adguard-home \\\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`  --cores 1 --memory 256 --swap 128 \\\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`  --rootfs local-lvm:512 \\\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`  --net0 name=eth0,bridge=vmbr0,ip=192.168.1.100/24,gw=192.168.1.254 \\\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`  --unprivileged 1 --features nesting=1 \\\n`}</span>
              <span style={{color:P.green[2]||P.txt}}>{`  --start 1 --onboot 1\n\n`}</span>
              <span style={{color:P.txts}}>{`# Migration to VLAN 10 (eth0)\n`}</span>
              <span style={{color:P.txt}}>{`pct stop 101\npct set 101 --net0 name=eth0,bridge=vmbr1,tag=10,ip=10.10.10.3/24,gw=10.10.10.1\npct start 101\n\n`}</span>
              <span style={{color:P.txts}}>{`# Add dual-homed eth1 (Telmex LAN — keeps 192.168.1.100)\n`}</span>
              <span style={{color:P.txt}}>{`pct stop 101\npct set 101 --net1 name=eth1,bridge=vmbr0,ip=192.168.1.100/24,gw=192.168.1.254\npct start 101`}</span>
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
                {provider:"Quad9",      url:"https://dns10.quad9.net/dns-query",  note:"DoH · malware blocking · ✓ active"},
                {provider:"Cloudflare", url:"https://dns.cloudflare.com/dns-query",note:"DoH · DNSSEC · privacy-first · ✓ active"},
                {provider:"Google",     url:"https://dns.google/dns-query",        note:"DoH · global fallback · ✓ active"},
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
                {name:"AdGuard DNS filter",       url:"adguard — pre-installed",  domains:"164,088 ✓"},
                {name:"OISD Big",                 url:"big.oisd.nl",              domains:"441,906 ✓"},
                {name:"Steven Black Unified",     url:"StevenBlack/hosts",        domains:"83,081 ✓"},
                {name:"URLhaus Malware",          url:"urlhaus-filter/agh",       domains:"32,507 ✓"},
                {name:"Hagezi Pro",               url:"hagezi/dns-blocklists",    domains:"209,827 ✓"},
              ].map(b=>(
                <div key={b.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,fontSize:12}}>
                  <span style={{color:P.txt}}>{b.name}</span>
                  <span style={{padding:"2px 6px",borderRadius:3,background:P.green[0],color:P.green[2],fontSize:11}}>{b.domains}</span>
                </div>
              ))}
            </div>
            {/* Split-horizon DNS */}
            <div style={{padding:16,background:P.bg2,borderRadius:8}}>
              <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:12}}>DNS Rewrites — Split-horizon ✓</div>
              <div style={{fontSize:12,color:P.txts,marginBottom:10}}>Configured and active — internal zones resolved locally:</div>
              {[
                {zone:"proxmox.mgmt",    res:"192.168.1.65", status:"✓ active"},
                {zone:"pfsense.mgmt",    res:"10.10.10.1",   status:"✓ active"},
                {zone:"adguard.mgmt",    res:"192.168.1.100",status:"✓ active"},
                {zone:"*.lab.internal",  res:"10.10.20.x (K3s MetalLB)", status:"⏳ pending K3s"},
                {zone:"*.cluster.local", res:"CoreDNS K3s cluster",       status:"⏳ pending K3s"},
              ].map(z=>(
                <div key={z.zone} style={{display:"flex",gap:8,marginBottom:7,alignItems:"baseline"}}>
                  <span style={{fontSize:11,fontFamily:"var(--font-mono)",color:P.blue[2]||P.txt,minWidth:160,flexShrink:0}}>{z.zone}</span>
                  <span style={{fontSize:11,color:P.txts}}>→ {z.res}</span>
                  <span style={{fontSize:10,color:z.status.startsWith("✓")?P.green[1]:P.amber[1],marginLeft:"auto"}}>{z.status}</span>
                </div>
              ))}
            </div>
            {/* pfSense integration */}
            <div style={{padding:16,background:P.bg2,borderRadius:8}}>
              <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:12}}>pfSense DHCP — DNS Distribution ✓</div>
              {[
                {setting:"VLAN 20 PROD — DNS Server",  action:"10.10.10.3 ✓ configured"},
                {setting:"VLAN 30 DEV — DNS Server",   action:"10.10.10.3 ✓ configured"},
                {setting:"VLAN 90 PENTEST — DNS Server",action:"10.10.90.1 (pfSense local — intentional isolation)"},
                {setting:"VLAN 10 MGMT — DNS",         action:"Static IPs only — no DHCP"},
                {setting:"Bootstrap DNS (AdGuard)",    action:"9.9.9.9 · 1.1.1.1 · 8.8.8.8 ✓"},
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
            <text x={330} y={172} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.green[2]}>10.10.10.3 (VLAN10) · 192.168.1.100 (Telmex) · LXC</text>
            {/* Satellites */}
            {[
              {t:"pfSense",         s:"DNS forwarder",         x:30,  y:130, col:P.teal,   lx1:240,ly1:160,lx2:170,ly2:160},
              {t:"Todas las VLANs", s:"DHCP opt 6",            x:30,  y:230, col:P.blue,   lx1:240,ly1:175,lx2:170,ly2:255},
              {t:"P53 Daily Driver",s:"WiFi + dock ✓",         x:30,  y:30,  col:P.gray,   lx1:240,ly1:145,lx2:170,ly2:56},
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
            <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:10}}>Clients configured — DNS override ✓</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
              {[
                {device:"ThinkPad P53 (daily)",  iface:"WiFi — INFINITUMC241",      dns:"192.168.1.100 ✓", method:"nmcli ignore-auto-dns"},
                {device:"ThinkPad P53 (daily)",  iface:"USB-C dock — Wired conn 1", dns:"192.168.1.100 ✓", method:"nmcli ignore-auto-dns"},
                {device:"Windows VM (ID 199)",   iface:"e1000 vmbr1 tag=10",        dns:"10.10.10.3 ✓",   method:"Static IP 10.10.10.50"},
              ].map((c,i)=>(
                <div key={i} style={{padding:12,background:P.bg,borderRadius:6,border:`0.5px solid ${P.bdr}`}}>
                  <div style={{fontSize:12,fontWeight:500,color:P.txt,marginBottom:4}}>{c.device}</div>
                  <div style={{fontSize:11,color:P.txts,marginBottom:2}}>{c.iface}</div>
                  <div style={{fontSize:11,color:P.green[1],marginBottom:2}}>{c.dns}</div>
                  <div style={{fontSize:10,color:P.txts}}>{c.method}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{marginTop:12,padding:16,background:P.bg2,borderRadius:8}}>
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
                {`# adguard-exporter (dentro del LXC)\ndocker run -d \\\n  -p 9617:9617 \\\n  -e ADGUARD_HOSTNAME=localhost \\\n  -e ADGUARD_PORT=3000 \\\n  -e ADGUARD_USERNAME=admin \\\n  -e ADGUARD_PASSWORD=\${SECRET} \\\n  ebrianne/adguard-exporter\n\n# prometheus.yml scrape config\n- job_name: adguard\n  static_configs:\n  - targets: ['10.10.10.3:9617']`}
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
      <p style={{fontSize:14,color:P.txts,margin:"0 0 16px"}}>Cluster K3s: t440p-server (master) + t430 (worker1) + P52 (worker2 pendiente). T440p Parrot OS aislado en VLAN 90.</p>

      {/* Node status cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
        {[
          {label:"t440p-server",role:"control-plane",ip:"10.10.20.100",status:"✅ READY",pal:"blue",
           specs:"i7-4712MQ · 16GB · 465GB",detail:"26 passed · 0 warnings · 0 failed"},
          {label:"t430",role:"worker1",ip:"10.10.20.101",status:"✅ READY",pal:"purple",
           specs:"i7-3630QM · 16GB · 464GB",detail:"26 passed · 0 warnings · 0 failed"},
          {label:"P52",role:"worker2",ip:"pending",status:"⏳ PENDING",pal:"amber",
           specs:"i7 6C/12T · 32GB · NVMe",detail:"Pre-check not yet run"},
        ].map(n=>{
          const cp=P[n.pal];
          return (
            <div key={n.label} style={{padding:14,background:cp[0],borderRadius:10,border:`0.5px solid ${cp[1]}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:13,fontWeight:600,color:cp[2],fontFamily:"var(--font-mono)"}}>{n.label}</span>
                <span style={{fontSize:11,color:cp[2]}}>{n.status}</span>
              </div>
              <div style={{fontSize:11,color:cp[2],marginBottom:2}}>{n.role} · {n.ip}</div>
              <div style={{fontSize:11,color:cp[2],opacity:0.8,marginBottom:4}}>{n.specs}</div>
              <div style={{fontSize:10,color:cp[2],opacity:0.7}}>{n.detail}</div>
            </div>
          );
        })}
      </div>

      {/* Install status */}
      <div style={{padding:"12px 16px",background:P.blue[0],border:`0.5px solid ${P.blue[1]}`,borderRadius:8,marginBottom:20,fontSize:13,color:P.blue[2]}}>
        <strong>Pre-installation complete.</strong> Both nodes passed all 26 checks. Next: install K3s server on t440p-server, then join t430 as agent.
      </div>

      <svg width="100%" viewBox="0 0 660 510" role="img">
        <title>Arquitectura del cluster K3s</title>
        <Arr id={aid} col={P.line}/>
        <Nd x={170} y={14} w={320} h={72} rx={10} p={P.blue} t="K3s Control Plane — t440p-server" s="10.10.20.100 · i7-4712MQ · 16GB · Fedora 42 · ✅ READY"/>
        <text x={330} y={104} textAnchor="middle" fontSize="10" fill={P.txts}>GitOps + CI/CD workloads</text>
        {[["ArgoCD",50],["Gitea",158],["Tekton",266],["Harbor",374],["cert-mgr",490]].map(([l,x])=>(
          <g key={l}><rect x={x-46} y={114} width={94} height={24} rx={4} fill={P.blue[0]} stroke={P.blue[1]} strokeWidth="0.5"/>
            <text x={x} y={126} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500" fill={P.blue[2]}>{l}</text>
          </g>
        ))}
        <Nd x={10}  y={178} w={290} h={68} rx={10} p={P.purple} t="Worker Node 1 · t430" s="10.10.20.101 · i7-3630QM · 16GB · Fedora 42 · ✅ READY"/>
        <Nd x={360} y={178} w={290} h={68} rx={10} p={P.amber}  t="Worker Node 2 · P52 ⏳" s="i7 6C/12T · 32→64GB DDR4 · pending setup"/>
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
          <text x={90} y={380} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.red[2]}>VLAN 90 · NO cluster</text>
        </g>
        <Nd x={190} y={344} w={280} h={40} rx={10} p={P.teal}  t="Traefik v3 (int) · Nginx (ext) · CoreDNS"/>
        <Ln x1={330} y1={248} x2={330} y2={344} col={P.line} dash="3 3" arr={aid}/>
        <Nd x={190} y={406} w={280} h={40} rx={10} p={P.green} t="Longhorn CSI · Persistent Volumes"/>
        <Ln x1={330} y1={384} x2={330} y2={406} col={P.line} arr={aid}/>
        <Nd x={190} y={464} w={280} h={36} rx={10} p={P.gray}  t="VLAN 20 PROD · 10.10.20.0/24 · Cilium eBPF"/>
        <Ln x1={330} y1={446} x2={330} y2={464} col={P.line} arr={aid}/>
      </svg>

      <div style={{marginTop:20,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{padding:16,background:P.bg2,borderRadius:8}}>
          <div style={{fontSize:13,fontWeight:500,marginBottom:10,color:P.txt}}>Install commands — Cilium stack</div>
          <pre style={{fontFamily:"var(--font-mono)",fontSize:11,color:P.txt,lineHeight:1.9,margin:0,whiteSpace:"pre-wrap"}}>
            {`# Master — sin Flannel ni Traefik (Cilium los reemplaza)\ncurl -sfL https://get.k3s.io | \\\n  INSTALL_K3S_EXEC="--selinux \\\n    --write-kubeconfig-mode 644 \\\n    --tls-san 10.10.20.100 \\\n    --flannel-backend=none \\\n    --disable-network-policy \\\n    --disable=traefik" sh -\n\n# Instalar Cilium CNI\nhelm repo add cilium https://helm.cilium.io\nhelm install cilium cilium/cilium \\\n  -n kube-system \\\n  --set l2announcements.enabled=true \\\n  --set hubble.relay.enabled=true \\\n  --set hubble.ui.enabled=true\n\n# Worker (t430)\ncurl -sfL https://get.k3s.io | \\\n  K3S_URL=https://10.10.20.100:6443 \\\n  K3S_TOKEN=<TOKEN> \\\n  INSTALL_K3S_EXEC="--selinux" sh -`}
          </pre>
        </div>
        <div style={{padding:16,background:P.bg2,borderRadius:8,overflowY:"auto",maxHeight:500}}>
          <div style={{fontSize:13,fontWeight:500,marginBottom:12,color:P.txt}}>Enterprise Stack</div>
          {[
            {cat:"Orchestration",     items:[["K3s","control-plane + agents (Fedora 42)"],["Helm v3","package manager"]]},
            {cat:"CNI & Networking",  items:[["Cilium","eBPF CNI · L2 LB · NetworkPolicy"],["Hubble","flow observability · L7 visibility"]]},
            {cat:"Service Mesh",      items:[["Istio","mTLS · traffic mgmt · canary releases"],["Kiali","service mesh topology dashboard"]]},
            {cat:"Ingress",           items:[["Traefik v3","internal services · lab admin UIs"],["Nginx Ingress","external · production-exposed services"]]},
            {cat:"Storage & TLS",     items:[["Longhorn CSI","distributed block storage 2× replica"],["cert-manager","TLS · ACME · Let's Encrypt"]]},
            {cat:"GitOps & CI/CD",    items:[["ArgoCD","pull-based GitOps deployments"],["Tekton","CI pipelines · SAST"],["Gitea","self-hosted Git + webhooks"],["Harbor","OCI registry + vulnerability scan"]]},
            {cat:"IAM & Secrets",     items:[["Keycloak","OIDC IdP · SAML · realms"],["Vault","secrets management · PKI"],["External Secrets","Vault → K8s secrets sync"]]},
            {cat:"Observability",     items:[["Prometheus","metrics scraping + storage"],["Grafana","dashboards + alerting UI"],["Loki","log aggregation · LogQL"],["Tempo","distributed tracing · OTLP"],["Alertmanager","alert routing + silencing"]]},
          ].map(({cat,items})=>(
            <div key={cat} style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:P.txts,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em"}}>{cat}</div>
              {items.map(([name,desc])=>(
                <div key={name} style={{display:"flex",gap:6,marginBottom:3,fontSize:12}}>
                  <span style={{fontFamily:"var(--font-mono)",color:P.txt,minWidth:110,flexShrink:0}}>{name}</span>
                  <span style={{color:P.txts,fontSize:11}}>{desc}</span>
                </div>
              ))}
            </div>
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
        <Nd x={176} y={264} w={370} h={72} rx={10} p={P.green} t="K3s Cluster · VLAN 20 PROD · 10.10.20.0/24" s="T440p (master) · T430 (worker1) · P52 (worker2)"/>
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
    {label:"T440p · Master", cx:110, disks:["512GB SSD NGFF (OS)", "1TB HDD→SSD*", "1TB HDD→SSD*"], note:"etcd · control vols"},
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
          {[["M720q","512GB NVMe — sin expansión disponible"],["T440p","512GB SSD NGFF (slot WAN/OS) + 1TB HDD (SATA) + 1TB HDD (Ultrabay)"],["T430","512GB SSD (WAN) + 500GB HDD + 500GB HDD"],["P52","512GB NVMe + 2.5\" libre + M.2 secundario"],["Dell 3501","256GB NVMe + 120GB SATA"],["T440p Parrot","512GB SSD NGFF (slot WAN/OS) + Ultrabay libre"]].map(([m,s])=>(
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
