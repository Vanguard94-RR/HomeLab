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
  { id:"m720q",  name:"Lenovo M720q",          role:"Proxmox Hypervisor",              badge:"HYPERVISOR", pal:"teal",
    cpu:"Intel Core i5-8500T (6C/6T, 2.1–3.5GHz, 8th Gen)", ram:"32GB DDR4 SO-DIMM (2×16GB) — MAXED",
    storage:"512GB NVMe M.2 (OS + VMs/LXCs)", net:"NIC PCIe 4-puertos Intel I350-T4", gpu:"Intel UHD 630", os:"Proxmox VE 9.1.1",
    roleDetail:"Proxmox hypervisor · pfSense CE VM (VM 100) · AdGuard Home LXC (101) · vmbr1 VLAN-aware trunk",
    limits:["Solo 1 slot NVMe M.2 2280 — sin expansión interna","NIC PCIe I350-T4 ocupa slot PCIe","Sin GPU dedicada para ML"],
    upgrades:[], workloads:["pfSense CE 2.7.2 (VM 100)","AdGuard Home LXC (LXC 101)","Windows Desktop VM (VM 199)","vmbr0 WAN · vmbr1 LAN trunk"] },
  { id:"dell7490-1", name:"Dell Latitude 7490 #1", role:"K3s control-plane",           badge:"K3s MASTER",  pal:"blue",
    cpu:"Intel Core i5-8xxx (4C/8T, 8th Gen, 15W)", ram:"32GB DDR4",
    storage:"256GB SSD (OS + etcd)", net:"Intel Gigabit", gpu:"Intel UHD 620", os:"Fedora 42 Server",
    roleDetail:"K3s server (control-plane) · etcd · kube-apiserver · Cilium · Helm · 10.10.20.100",
    limits:["256GB SSD — espacio limitado para workloads grandes","i5 U-series — 15W TDP, menor rendimiento que H-series"],
    upgrades:[], workloads:["K3s API server","etcd","CoreDNS","kube-scheduler","kube-controller"] },
  { id:"dell7490-2", name:"Dell Latitude 7490 #2", role:"K3s worker1",                 badge:"WORKER 1",    pal:"blue",
    cpu:"Intel Core i5-8xxx (4C/8T, 8th Gen, 15W)", ram:"32GB DDR4",
    storage:"256GB SSD", net:"Intel Gigabit", gpu:"Intel UHD 620", os:"Fedora 42 Server",
    roleDetail:"K3s agent worker1 · workloads generales · 10.10.20.101",
    limits:["256GB SSD — espacio Longhorn limitado"],
    upgrades:[], workloads:["ArgoCD","Gitea","Harbor","cert-manager","Traefik v3"] },
  { id:"dell5480",   name:"Dell Latitude 5480",    role:"K3s worker2",                 badge:"WORKER 2",    pal:"blue",
    cpu:"Intel Core i5-8xxx (4C/8T, 8th Gen, 15W)", ram:"32GB DDR4",
    storage:"256GB SSD", net:"Intel Gigabit", gpu:"Intel UHD 620", os:"Fedora 42 Server",
    roleDetail:"K3s agent worker2 · workloads generales · 10.10.20.102",
    limits:["256GB SSD — espacio Longhorn limitado"],
    upgrades:[], workloads:["Tekton","Vault","Keycloak","Nginx Ingress","Alertmanager"] },
  { id:"p52",    name:"ThinkPad P52",           role:"K3s worker3 ML/GPU",             badge:"WORKER ML",   pal:"amber",
    cpu:"Intel Core i7 6C/12T (8th Gen Coffee Lake-H)", ram:"32GB DDR4 (2 slots libres → max 64GB)",
    storage:"NVMe primary (OS) + 1TB NVMe M.2 2280 (slot secundario) → Longhorn NVMe tier + modelos ML", net:"Intel Gigabit + Thunderbolt 3", gpu:"Quadro P1000 4GB GDDR5", os:"Fedora 42 Server",
    roleDetail:"K3s worker3 · GPU workloads · Ollama ML inference · Longhorn NVMe tier · 10.10.20.103",
    limits:["Quadro P1000 limitado para LLMs grandes (4GB VRAM)","Ruido ventilación bajo carga sostenida"],
    upgrades:[{text:"Expandir RAM a 64GB (2×32GB en slots libres)",priority:"MED",cost:"~$80"}],
    workloads:["Ollama LLM inference","Jupyter notebooks","Longhorn NVMe tier","GPU workloads (taint gpu=true)"] },
  { id:"t440p",  name:"ThinkPad T440p",         role:"K3s worker4 storage",            badge:"WORKER STOR", pal:"purple",
    cpu:"Intel Core i7-4712MQ (4C/8T, 2.3GHz, 4th Gen)", ram:"16GB DDR3L SO-DIMM — MAXED",
    storage:"512GB SSD NGFF (OS + pods) + 1TB HDD (SATA) + 1TB HDD (Ultrabay) → 2TB Longhorn HDD tier", net:"Intel Gigabit", gpu:"GTX 730M (sin uso)", os:"Fedora 42 Server",
    roleDetail:"K3s worker4 storage · 2TB HDD = mayor pool Longhorn del cluster · 10.10.20.104",
    limits:["16GB DDR3L — menor RAM del cluster","4th Gen Intel — mayor consumo y más antiguo","Slot secundario M.2 es 2242 — NVMe 2280 no cabe"],
    upgrades:[], workloads:["Longhorn HDD tier (2TB)","Workloads generales (SSD OS)","Taint: storage=preferred:PreferNoSchedule"] },
  { id:"t430",   name:"ThinkPad T430",          role:"Monitoring server dedicado",      badge:"MONITORING",  pal:"green",
    cpu:"Intel Core i7-3630QM (4C/8T, 2.4GHz, 3rd Gen)", ram:"16GB DDR3 SO-DIMM — MAXED",
    storage:"512GB SSD (WWAN) → OS + Prometheus + Tempo + Grafana | 500GB HDD (SATA) → Loki logs | 500GB HDD (Caddy) → backups", net:"Intel Gigabit", gpu:"Intel HD 4000", os:"Fedora 42 Server",
    roleDetail:"Monitoring server fuera del cluster · Prometheus + Grafana + Loki + Tempo + Alertmanager · VLAN 10 MGMT · 10.10.10.10",
    limits:["3rd Gen Intel — más antiguo del lab","Fuera del cluster K3s — sin acceso a ServiceMonitors nativos","Scraping manual vía IPs externas"],
    upgrades:[], workloads:["Prometheus (30d retención)","Grafana (dashboards unificados)","Loki (logs 30d · HDD)","Tempo (trazas 7d)","Alertmanager (email/Slack)"] },
  { id:"parrot", name:"Parrot OS machine",      role:"Red Team / Pentesting — AISLADO", badge:"RED TEAM",    pal:"red",
    cpu:"—", ram:"—",
    storage:"—", net:"Intel Gigabit + WiFi", gpu:"—", os:"Parrot OS Security",
    roleDetail:"Red team · pentesting · auditorías seguridad del lab — VLAN 90 aislada · switch puerto 8",
    limits:["Aislado en VLAN 90 (PENTEST) — sin acceso a otras VLANs","NO conectar al cluster K3s"],
    upgrades:[], workloads:["Metasploit","Nmap / Nessus","Burp Suite","Aircrack-ng"] },
  { id:"p53",    name:"Lenovo P53 (Daily)",     role:"Daily Driver / Admin",            badge:"DAILY",       pal:"gray",
    cpu:"Intel Core i9-9880H (8C/16T, 9th Gen)", ram:"64GB DDR4",
    storage:"480GB NVMe + 1TB NVMe", net:"Intel Gigabit + WiFi 6 AX200 + TB3", gpu:"Quadro RTX 4000 8GB GDDR6", os:"Fedora 42",
    roleDetail:"Trabajo diario · kubectl / k9s / Lens · acceso lab vía VLAN 10 MGMT · DNS: AdGuard 192.168.1.100",
    limits:["Máquina personal — no servidor permanente"],
    upgrades:[], workloads:["kubectl / Lens / k9s","VS Code + Continue (Ollama local)","Acceso remoto lab","Ollama local (Quadro RTX 4000)"] },
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
  { n:4, title:"Pre-check K3s ✓ scripts verificados en T440p + T430", mach:["T440p","T430"], pal:"teal",
    reason:"COMPLETADO — Scripts precheck v1.3 y prefix v1.2 verificados. 26 passed / 0 warnings / 0 failed en ambos nodos. Base validada para nueva arquitectura.", cost:"✓ hecho",
    items:["homelab-k3s-precheck.sh v1.3 — 26 checks · exit codes 0/1/2","homelab-k3s-prefix.sh v1.2 — 7 fixes idempotentes · SELinux · firewalld · sysctl","Verificado: Fedora 42 · SELinux Enforcing + k3s-selinux · Cilium-ready"] },
  { n:5, title:"Nueva arquitectura 6 nodos — incorporar Dell + redefinir T440p", mach:["Dell 7490","Dell 5480","T440p"], pal:"blue",
    reason:"T430 retirado. Dell 7490 #1 → control-plane (32GB DDR4 + SSD). Dell 7490 #2 + Dell 5480 → workers 1 y 2. T440p → worker4 storage híbrido (512GB SSD + 2TB HDD). P52 → worker3 ML/GPU.", cost:"hardware disponible",
    items:["Dell 7490 #1: control-plane · 32GB DDR4 · 256GB SSD · 10.10.20.100","Dell 7490 #2: worker1 · 32GB DDR4 · 256GB SSD · 10.10.20.101","Dell 5480: worker2 · 32GB DDR4 · 256GB SSD · 10.10.20.102","T440p: worker4 storage · 16GB · 512GB SSD + 2TB HDD · 10.10.20.104","T430: retirar (3rd gen · 16GB · sin SSD)"] },
  { n:6, title:"Incorporar P52 como worker3 ML/GPU", mach:["P52"], pal:"amber",
    reason:"Quadro P1000 es único en el lab. Insustituible para Ollama, ML workloads. 32GB DDR4 suficiente. NVMe 1TB 2280 instalado en slot secundario — no cabe en T440p (slot 2242).", cost:"$0 (hardware existente + NVMe disponible)",
    items:["Instalar Fedora Server minimal en P52","homelab-k3s-precheck.sh --role worker","homelab-k3s-prefix.sh --role worker --hostname p52","NVMe 1TB M.2 2280 en slot secundario → Longhorn SSD tier + ML models","Taint: gpu=true:NoSchedule en worker3 · 10.10.20.103"] },
  { n:7, title:"T440p — run precheck + prefix como worker4", mach:["T440p"], pal:"amber",
    reason:"T440p ya tiene 512GB NGFF SSD + 2TB HDD. Mayor capacidad storage del cluster. Necesita pre-check con rol worker.", cost:"$0",
    items:["homelab-k3s-precheck.sh --role worker en T440p","homelab-k3s-prefix.sh --role worker --hostname t440p-storage","Taint: storage=preferred:PreferNoSchedule","Longhorn usará los 2TB HDD para replicas grandes · 10.10.20.104"] },
  { n:8, title:"T430 — servidor de monitoreo dedicado", mach:["T430"], pal:"blue",
    reason:"Patrón enterprise: monitoreo fuera del cluster que monitorea. Si K3s cae, Grafana sigue vivo. T430: 16GB RAM · SSD 512GB (WWAN) + 2×500GB HDD · VLAN 10 MGMT · 10.10.10.10", cost:"2× HDD 500GB",
    items:["SSD 512GB (WWAN) → OS + Prometheus + Tempo + Grafana","HDD 500GB (SATA) → Loki logs 30d","HDD 500GB (Caddy) → backups + snapshots","Stack: Prometheus · Grafana · Loki · Tempo · Alertmanager · Podman Compose","Monitorea: Proxmox · pfSense · AdGuard · K3s 5 nodos · Longhorn · Cilium · Istio"] },
  { n:10, title:"UPS para M720q + switch", mach:["M720q","Switch"], pal:"blue",
    reason:"Caída de luz sin UPS corrompe etcd y tumba el cluster sin shutdown graceful.", cost:"~$80–120",
    items:["UPS 650VA con AVR (APC Back-UPS ES 650)","Protege: M720q + TL-SG108E + acceso a red"] },
  { n:11, title:"RAM expansión ThinkPad P52", mach:["P52"], pal:"blue",
    reason:"32GB actuales suficientes para worker ML inicial. 64GB recomendado para modelos LLM grandes y build concurrente.", cost:"~$80",
    items:["2× SO-DIMM DDR4-2666 32GB en los 2 slots libres","Upgrade opcional — no bloqueante para cluster inicial"] },
];

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const dark = useDark();
  const P = palette(dark);
  const [tab, setTab] = useState("monitoring");
  const [sel, setSel] = useState(null);
  const tabs=[{id:"monitoring",l:"📊 Monitoring"},{id:"hw",l:"Hardware"},{id:"up",l:"Upgrades"},{id:"net",l:"Red"},{id:"switch",l:"🔀 Switch & VLANs"},{id:"pfsense",l:"🔥 pfSense"},{id:"adguard",l:"🛡 AdGuard Home"},{id:"k3s",l:"Cluster K3s"},{id:"git",l:"GitOps"},{id:"iam",l:"IAM"},{id:"stor",l:"Storage"}];
  return (
    <div style={{fontFamily:"var(--font-sans)",background:P.bg,minHeight:"100vh"}}>
      <div style={{background:P.bg2,borderBottom:`0.5px solid ${P.bdr}`,padding:"20px 24px 0"}}>
        <div style={{fontSize:11,fontWeight:500,letterSpacing:"0.08em",color:P.txts,marginBottom:4}}>ENTERPRISE HOMELAB DESIGN · V2</div>
        <h1 style={{fontSize:22,fontWeight:500,margin:"0 0 4px",color:P.txt}}>HomeLab Architecture</h1>
        <p style={{fontSize:13,color:P.txts,margin:"0 0 20px"}}>
          Production-ready · K3s · GitOps · IAM · DevOps · Networking
          <span style={{marginLeft:10,padding:"2px 8px",borderRadius:4,background:P.teal[0],color:P.teal[2],fontSize:11,fontWeight:500}}>Switch ✓</span>
          <span style={{marginLeft:6,padding:"2px 8px",borderRadius:4,background:P.teal[0],color:P.teal[2],fontSize:11,fontWeight:500}}>pfSense ✓</span>
          <span style={{marginLeft:6,padding:"2px 8px",borderRadius:4,background:P.green[0],color:P.green[2],fontSize:11,fontWeight:500}}>AdGuard ✓</span>
          <span style={{marginLeft:6,padding:"2px 8px",borderRadius:4,background:P.teal[0],color:P.teal[2],fontSize:11,fontWeight:500}}>VLANs Persistent ✓</span>
          <span style={{marginLeft:6,padding:"2px 8px",borderRadius:4,background:P.blue[0],color:P.blue[2],fontSize:11,fontWeight:500}}>K3s Pre-check ✓</span>
          <span style={{marginLeft:6,padding:"2px 8px",borderRadius:4,background:P.green[0],color:P.green[2],fontSize:11,fontWeight:500}}>Monitoring ✓ T430</span>
        </p>
        <div style={{display:"flex",gap:2,overflowX:"auto"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 14px",fontSize:13,border:"none",cursor:"pointer",borderRadius:"6px 6px 0 0",background:tab===t.id?P.bg:"transparent",color:tab===t.id?P.txt:P.txts,fontWeight:tab===t.id?500:400,borderBottom:tab===t.id?`2px solid ${P.txt}`:"2px solid transparent",whiteSpace:"nowrap"}}>{t.l}</button>
          ))}
        </div>
      </div>
      <div style={{padding:24}}>
        {tab==="monitoring"&&<Monitoring P={P}/>}
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

// ── Monitoring ─────────────────────────────────────────────────────────────────
function Monitoring({P}) {
  const services=[
    {name:"Prometheus",port:9090,url:"prometheus.mgmt",desc:"Métricas · 30d retención · TSDB",disk:"SSD 150GB",pal:"blue"},
    {name:"Grafana",port:3000,url:"grafana.mgmt",desc:"Dashboards unificados · 11 pre-built",disk:"SSD 10GB",pal:"blue"},
    {name:"Loki",port:3100,url:"loki.mgmt",desc:"Logs agregados · 30d · LogQL",disk:"HDD 400GB",pal:"teal"},
    {name:"Tempo",port:3200,url:"tempo.mgmt",desc:"Trazas distribuidas · 7d · OTLP",disk:"SSD 80GB",pal:"purple"},
    {name:"Alertmanager",port:9093,url:"alertmanager.mgmt",desc:"Alertas · email · Slack",disk:"SSD 5GB",pal:"amber"},
  ];
  const targets=[
    {name:"Proxmox VE",ip:"192.168.1.65",port:9221,exporter:"pve_exporter",status:"pending"},
    {name:"pfSense",ip:"10.10.10.1",port:9100,exporter:"node_exporter",status:"pending"},
    {name:"AdGuard Home",ip:"10.10.10.3",port:9617,exporter:"adguard_exporter",status:"pending"},
    {name:"dell-7490-1",ip:"10.10.20.100",port:9100,exporter:"node_exporter DaemonSet",status:"pending"},
    {name:"dell-7490-2",ip:"10.10.20.101",port:9100,exporter:"node_exporter DaemonSet",status:"pending"},
    {name:"dell-5480",ip:"10.10.20.102",port:9100,exporter:"node_exporter DaemonSet",status:"pending"},
    {name:"p52",ip:"10.10.20.103",port:9100,exporter:"node_exporter DaemonSet",status:"pending"},
    {name:"t440p-storage",ip:"10.10.20.104",port:9100,exporter:"node_exporter DaemonSet",status:"pending"},
    {name:"Longhorn",ip:"10.10.20.100",port:9500,exporter:"built-in",status:"pending"},
    {name:"Cilium/Hubble",ip:"kube-system",port:9962,exporter:"built-in",status:"pending"},
    {name:"Istio",ip:"10.10.20.100",port:15014,exporter:"built-in",status:"pending"},
    {name:"T430 (self)",ip:"10.10.10.10",port:9100,exporter:"node_exporter",status:"pending"},
  ];
  return (
    <div>
      <div style={{padding:"14px 18px",background:P.green[0],border:`0.5px solid ${P.green[1]}`,borderRadius:12,marginBottom:20}}>
        <div style={{fontSize:14,fontWeight:500,color:P.green[2],marginBottom:4}}>T430 — Servidor de monitoreo dedicado</div>
        <div style={{fontSize:13,color:P.green[2]}}>10.10.10.10 · VLAN 10 MGMT · Podman Compose · Fedora 42 · 16GB RAM · SSD 512GB + 2×HDD 500GB</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
        <div>
          <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:10}}>Stack de servicios</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {services.map(s=>{
              const cp=P[s.pal];
              return (
                <div key={s.name} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:cp[0],borderRadius:8,border:`0.5px solid ${cp[1]}`}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500,color:cp[2]}}>{s.name}</div>
                    <div style={{fontSize:11,color:cp[2],opacity:.85}}>{s.desc}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,fontFamily:"var(--font-mono)",color:cp[2]}}>:{s.port}</div>
                    <div style={{fontSize:10,color:cp[2],opacity:.8}}>{s.disk}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:10}}>Storage layout</div>
          {[
            {disk:"SSD 512GB (WWAN)",mount:"/",use:"OS + Prometheus + Tempo + Grafana + Alertmanager",col:P.blue},
            {disk:"HDD 500GB (SATA)",mount:"/opt/monitoring/loki",use:"Loki logs — 30d retención",col:P.teal},
            {disk:"HDD 500GB (Caddy)",mount:"/opt/monitoring/backup",use:"Prometheus snapshots · config backups",col:P.amber},
          ].map(d=>(
            <div key={d.disk} style={{padding:12,background:d.col[0],borderRadius:8,border:`0.5px solid ${d.col[1]}`,marginBottom:8}}>
              <div style={{fontSize:12,fontWeight:500,color:d.col[2]}}>{d.disk}</div>
              <div style={{fontSize:11,fontFamily:"var(--font-mono)",color:d.col[2],marginBottom:2}}>{d.mount}</div>
              <div style={{fontSize:11,color:d.col[2],opacity:.85}}>{d.use}</div>
            </div>
          ))}
          <div style={{padding:12,background:P.bg2,borderRadius:8,border:`0.5px solid ${P.bdr}`,marginTop:4}}>
            <div style={{fontSize:12,fontWeight:500,color:P.txt,marginBottom:4}}>DNS rewrites (AdGuard)</div>
            {["grafana.mgmt → 10.10.10.10","prometheus.mgmt → 10.10.10.10","alertmanager.mgmt → 10.10.10.10","loki.mgmt → 10.10.10.10"].map(r=>(
              <div key={r} style={{fontSize:11,fontFamily:"var(--font-mono)",color:P.txts,marginBottom:2}}>{r}</div>
            ))}
          </div>
        </div>
      </div>
      <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:10}}>Scrape targets — {targets.length} fuentes monitoreadas</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8,marginBottom:20}}>
        {targets.map(t=>(
          <div key={t.name} style={{padding:10,background:P.bg,borderRadius:8,border:`0.5px solid ${P.bdr}`}}>
            <div style={{fontSize:12,fontWeight:500,color:P.txt}}>{t.name}</div>
            <div style={{fontSize:11,fontFamily:"var(--font-mono)",color:P.txts,marginBottom:2}}>{t.ip}:{t.port}</div>
            <div style={{fontSize:10,color:P.txts}}>{t.exporter}</div>
          </div>
        ))}
      </div>
      <div style={{padding:14,background:P.bg2,borderRadius:8}}>
        <div style={{fontSize:13,fontWeight:500,color:P.txt,marginBottom:8}}>Quick start</div>
        <pre style={{fontFamily:"var(--font-mono)",fontSize:11,color:P.txt,lineHeight:1.9,margin:0,whiteSpace:"pre-wrap"}}>
          {`cd /opt/monitoring\npodman-compose up -d\n\n# Health check\ncurl -s http://localhost:9090/-/healthy && echo "Prometheus OK"\ncurl -s http://localhost:3000/api/health\ncurl -s http://localhost:3100/ready && echo "Loki OK"\n\n# Grafana UI\nopen http://grafana.mgmt:3000`}
        </pre>
      </div>
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
        <strong style={{color:P.txt}}>Estado actual:</strong> Switch managed ✓ · pfSense ✓ · AdGuard ✓ · VLANs Persistent ✓ · K3s Pre-check ✓. Próximo paso: instalar Fedora en Dell 7490 #1/2 y Dell 5480, luego K3s con Cilium.
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
    {l:"pfSense·AdGuard·T430", cx:74, pal:"teal"},
    {l:"K3s: Dell+T440p+P52",  cx:204,pal:"blue"},
    {l:"DEV builds",            cx:334,pal:"purple"},
    {l:"Longhorn traffic",      cx:464,pal:"amber"},
    {l:"Parrot OS",             cx:594,pal:"red"},
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
          {v:"VLAN 10 · MGMT",    d:"10.10.10.0/24 · pfSense · AdGuard · switch · T430 monitoring", pal:"teal"},
          {v:"VLAN 20 · PROD",    d:"10.10.20.0/24 · K3s: Dell 7490 #1/2 · Dell 5480 · P52 · T440p", pal:"blue"},
          {v:"VLAN 30 · DEV",     d:"10.10.30.0/24 · Builds, staging, CI/CD",    pal:"purple"},
          {v:"VLAN 40 · STORAGE", d:"10.10.40.0/24 · Longhorn replication",      pal:"amber"},
          {v:"VLAN 50 · DMZ",     d:"10.10.50.0/24 · Ingress / servicios expuestos", pal:"green"},
          {v:"VLAN 90 · PENTEST", d:"10.10.90.0/24 · Parrot OS — aislado total", pal:"red"},
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
    {id:10, name:"MGMT",     tagged:"1",    untagged:"7",   subnet:"10.10.10.0/24", pal:"teal"},
    {id:20, name:"PROD",     tagged:"1",    untagged:"2-6", subnet:"10.10.20.0/24", pal:"blue"},
    {id:30, name:"DEV",      tagged:"1",    untagged:"—",   subnet:"10.10.30.0/24", pal:"purple"},
    {id:40, name:"STORAGE",  tagged:"1",    untagged:"—",   subnet:"10.10.40.0/24", pal:"amber"},
    {id:50, name:"DMZ",      tagged:"1",    untagged:"—",   subnet:"10.10.50.0/24", pal:"green"},
    {id:90, name:"PENTEST",  tagged:"1",    untagged:"8",   subnet:"10.10.90.0/24", pal:"red"},
  ];

  const ports=[
    {port:1, device:"M720q (enp1s0f0)",      role:"TRUNK",     vlan:"10,20,30,40,50,90", mode:"Tagged",   pvid:1,  pal:"teal"},
    {port:2, device:"Dell 7490 #1 (master)",  role:"K3s PROD",  vlan:"20",               mode:"Untagged", pvid:20, pal:"blue"},
    {port:3, device:"Dell 5480 (worker2)",    role:"K3s PROD",  vlan:"20",               mode:"Untagged", pvid:20, pal:"blue"},
    {port:4, device:"Dell 7490 #2 (worker1)", role:"K3s PROD",  vlan:"20",               mode:"Untagged", pvid:20, pal:"blue"},
    {port:5, device:"T440p (worker4 stor)",   role:"K3s PROD",  vlan:"20",               mode:"Untagged", pvid:20, pal:"purple"},
    {port:6, device:"P52 (worker3 ML/GPU)",   role:"K3s PROD",  vlan:"20",               mode:"Untagged", pvid:20, pal:"amber"},
    {port:7, device:"T430 (monitoring)",      role:"MGMT",      vlan:"10",               mode:"Untagged", pvid:10, pal:"green"},
    {port:8, device:"Parrot OS",              role:"PENTEST",   vlan:"90",               mode:"Untagged", pvid:90, pal:"red"},
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
              Cuando un frame llega al <strong style={{color:P.txt}}>puerto 2 (Dell 7490 #1)</strong> sin etiqueta VLAN, el switch le asigna <strong style={{color:P.txt}}>PVID 20</strong> y lo trata como tráfico de VLAN 20. Al salir por el puerto 1 (trunk), el switch agrega la etiqueta <strong style={{color:P.txt}}>VLAN 20</strong>. En dirección inversa: el frame llega al puerto 1 etiquetado como VLAN 20, el switch elimina la etiqueta y lo entrega al puerto 2 como frame Ethernet normal.
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
            {/* End nodes — arquitectura final */}
            {[
              {l:"7490#1\nP2·V20",  x:60,  pal:P.blue},
              {l:"Dell5480\nP3·V20",x:170, pal:P.blue},
              {l:"7490#2\nP4·V20",  x:280, pal:P.blue},
              {l:"T440p\nP5·V20",   x:390, pal:P.purple},
              {l:"P52 ML\nP6·V20",  x:480, pal:P.amber},
              {l:"T430 mon\nP7·V10",x:570, pal:P.green},
              {l:"Parrot\nP8·V90",  x:640, pal:P.red},
            ].map(n=>(
              <g key={n.l}>
                <rect x={n.x-36} y={348} width={74} height={42} rx={6} fill={n.pal[0]} stroke={n.pal[1]} strokeWidth="0.5"/>
                {n.l.split("\n").map((line,i)=>(
                  <text key={i} x={n.x} y={363+i*14} textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight={i===0?"500":"400"} fill={n.pal[2]}>{line}</text>
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
      <p style={{fontSize:14,color:P.txts,margin:"0 0 16px"}}>Cluster K3s: 1 control-plane (Dell 7490 #1) + 4 workers (Dell 7490 #2, Dell 5480, P52 ML/GPU, T440p storage). T430 dedicado a monitoreo (VLAN 10). Parrot OS aislado en VLAN 90.</p>

      {/* Node status cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
        {[
          {label:"Dell 7490 #1",role:"control-plane",ip:"10.10.20.100",status:"⏳ Pending",pal:"blue",
           specs:"i5-8xxx · 32GB DDR4 · 256GB SSD",detail:"Pre-check not yet run"},
          {label:"Dell 7490 #2",role:"worker1",ip:"10.10.20.101",status:"⏳ Pending",pal:"purple",
           specs:"i5-8xxx · 32GB DDR4 · 256GB SSD",detail:"Pre-check not yet run"},
          {label:"Dell 5480",role:"worker2",ip:"10.10.20.102",status:"⏳ Pending",pal:"purple",
           specs:"i5-8xxx · 32GB DDR4 · 256GB SSD",detail:"Pre-check not yet run"},
          {label:"ThinkPad P52",role:"worker3 ML/GPU",ip:"10.10.20.103",status:"⏳ Pending",pal:"teal",
           specs:"i7 6C/12T · 32GB DDR4 · Quadro P1000 · +1TB NVMe 2280",detail:"NVMe 1TB secundario instalado"},
          {label:"ThinkPad T440p",role:"worker4 storage",ip:"10.10.20.104",status:"⏳ Pending",pal:"amber",
           specs:"i7-4712MQ · 16GB · 512GB SSD + 2TB HDD",detail:"Pre-check not yet run"},
          {label:"ThinkPad T430",role:"RETIRE",ip:"—",status:"🗑 Retire",pal:"gray",
           specs:"i7-3630QM · 16GB DDR3 · HDD",detail:"3rd gen · replaced by Dell 7490"},
        ].map(n=>{
          const cp=P[n.pal]||P.gray;
          return (
            <div key={n.label} style={{padding:12,background:cp[0],borderRadius:10,border:`0.5px solid ${cp[1]}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12,fontWeight:600,color:cp[2],fontFamily:"var(--font-mono)"}}>{n.label}</span>
                <span style={{fontSize:10,color:cp[2]}}>{n.status}</span>
              </div>
              <div style={{fontSize:11,color:cp[2],marginBottom:2}}>{n.role} · {n.ip}</div>
              <div style={{fontSize:11,color:cp[2],opacity:0.8,marginBottom:3}}>{n.specs}</div>
              <div style={{fontSize:10,color:cp[2],opacity:0.7}}>{n.detail}</div>
            </div>
          );
        })}
      </div>

      {/* Install status */}
      <div style={{padding:"12px 16px",background:P.blue[0],border:`0.5px solid ${P.blue[1]}`,borderRadius:8,marginBottom:16,fontSize:13,color:P.blue[2]}}>
        <strong>Arquitectura final: 1 control-plane + 4 workers.</strong> Dell 7490 #1 como master (SSD para etcd). T440p como worker4 storage híbrido (512GB SSD + 2TB HDD → mayor capacidad Longhorn). T430 retirado. Total: 176GB RAM · ~2.75TB storage raw.
      </div>

      <svg width="100%" viewBox="0 0 700 560" role="img">
        <title>Arquitectura del cluster K3s — 6 nodos enterprise</title>
        <Arr id={aid} col={P.line}/>
        {/* Control plane */}
        <Nd x={200} y={10} w={300} h={60} rx={10} p={P.blue} t="Dell 7490 #1 — control-plane" s="10.10.20.100 · i5-8xxx · 32GB DDR4 · 256GB SSD"/>
        {/* Workers row 1 */}
        <Nd x={10}  y={110} w={210} h={60} rx={10} p={P.purple} t="Dell 7490 #2 — worker1" s="10.10.20.101 · 32GB · SSD"/>
        <Nd x={245} y={110} w={210} h={60} rx={10} p={P.purple} t="Dell 5480 — worker2" s="10.10.20.102 · 32GB · SSD"/>
        <Nd x={480} y={110} w={210} h={60} rx={10} p={P.purple} t="P52 — worker3 ML/GPU" s="10.10.20.103 · 32GB · Quadro P1000"/>
        {/* Worker storage */}
        <Nd x={200} y={210} w={300} h={60} rx={10} p={P.amber} t="T440p — worker4 storage" s="10.10.20.104 · 16GB · 512GB SSD + 2TB HDD"/>
        {/* Arrows */}
        <Ln x1={350} y1={70}  x2={115} y2={110} col={P.line} arr={aid}/>
        <Ln x1={350} y1={70}  x2={350} y2={110} col={P.line} arr={aid}/>
        <Ln x1={350} y1={70}  x2={585} y2={110} col={P.line} arr={aid}/>
        <Ln x1={350} y1={70}  x2={350} y2={210} col={P.line} dash="5 4" arr={aid}/>
        {/* GitOps workloads */}
        <text x={350} y={292} textAnchor="middle" fontSize="10" fill={P.txts}>GitOps + CI/CD workloads (master + worker1/2)</text>
        {[["ArgoCD",60],["Gitea",175],["Tekton",290],["Harbor",405],["cert-mgr",530]].map(([l,x])=>(
          <g key={l}><rect x={x-44} y={300} width={90} height={22} rx={4} fill={P.blue[0]} stroke={P.blue[1]} strokeWidth="0.5"/>
            <text x={x} y={311} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500" fill={P.blue[2]}>{l}</text>
          </g>
        ))}
        {/* ML workloads */}
        <text x={350} y={340} textAnchor="middle" fontSize="10" fill={P.txts}>ML workloads (worker3 · Quadro P1000)</text>
        {[["Ollama",155],["LLM serve",280],["Jupyter",405]].map(([l,x])=>(
          <g key={l}><rect x={x-50} y={348} width={102} height={22} rx={4} fill={P.teal[0]} stroke={P.teal[1]} strokeWidth="0.5"/>
            <text x={x} y={359} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500" fill={P.teal[2]}>{l}</text>
          </g>
        ))}
        {/* Storage */}
        <text x={350} y={388} textAnchor="middle" fontSize="10" fill={P.txts}>Storage layer (worker4 T440p · 2TB HDD Longhorn)</text>
        {[["Longhorn",130],["2TB replicas",280],["PVC pool",430]].map(([l,x])=>(
          <g key={l}><rect x={x-54} y={396} width={108} height={22} rx={4} fill={P.amber[0]} stroke={P.amber[1]} strokeWidth="0.5"/>
            <text x={x} y={407} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="500" fill={P.amber[2]}>{l}</text>
          </g>
        ))}
        {/* Network */}
        <Nd x={150} y={436} w={400} h={36} rx={10} p={P.teal}  t="Traefik v3 (int) · Nginx (ext) · Cilium eBPF · Istio mTLS"/>
        <Nd x={150} y={488} w={400} h={36} rx={10} p={P.gray}  t="VLAN 20 PROD · 10.10.20.0/24 · pfSense 10.10.20.1"/>
        <Ln x1={350} y1={418} x2={350} y2={436} col={P.line} arr={aid}/>
        <Ln x1={350} y1={472} x2={350} y2={488} col={P.line} arr={aid}/>
        {/* Retired */}
        <g opacity="0.45">
          <rect x={10} y={488} width={120} height={36} rx={8} fill={P.red[0]} stroke={P.red[1]} strokeWidth="0.5" strokeDasharray="4 3"/>
          <text x={70} y={503} textAnchor="middle" dominantBaseline="central" fontSize="11" fill={P.red[2]}>T430</text>
          <text x={70} y={517} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={P.red[2]}>RETIRED</text>
        </g>
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
        <Nd x={176} y={264} w={370} h={72} rx={10} p={P.green} t="K3s Cluster · VLAN 20 PROD · 10.10.20.0/24" s="Dell 7490 #1 (master) · 7490#2 · 5480 · P52 · T440p"/>
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
