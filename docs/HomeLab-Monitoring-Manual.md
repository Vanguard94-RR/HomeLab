# Enterprise HomeLab — Monitoring Stack Manual

**Version:** 2.0
**Date:** June 2026
**Status:** DEPLOYED & OPERATIONAL ✅
**Scope:** T430 dedicated monitoring server · Podman Compose · Prometheus · Grafana · Loki · Tempo · Alertmanager
**Node:** T430 · i7-3630QM · 16GB DDR3 · 512GB SSD (WWAN) + 2×500GB HDD · VLAN 10 MGMT · 10.10.10.10

---

## Estado Operacional (Junio 2026)

| Servicio | Puerto | Estado | Storage |
|---|---|---|---|
| Prometheus | 9091 (9090=Cockpit) | ✅ UP | SSD /opt/monitoring/prometheus/data |
| Grafana | 3000 | ✅ UP | SSD /opt/monitoring/grafana/data |
| Loki | 3100 | ✅ UP | HDD /srv/storage (500GB) |
| Tempo | 3200, 4317, 4318 | ✅ UP | SSD /opt/monitoring/tempo/data |
| Alertmanager | 9093 | ✅ UP | SSD /opt/monitoring/alertmanager/data |
| node-exporter | 9100 | ✅ UP | systemd service |

**Acceso:**
- Grafana: `http://grafana.mgmt:3000` · `http://10.10.10.10:3000`
- Prometheus: `http://prometheus.mgmt:9091` · `http://10.10.10.10:9091`
- Alertmanager: `http://alertmanager.mgmt:9093`
- Credenciales Grafana: `admin / <REDACTED>`

**Dashboards importados:**
- Node Exporter Full (ID: 1860) ✅
- Prometheus 2.0 Overview (ID: 3662) ✅
- Alertmanager (ID: 9578) ✅
- Loki Kubernetes Logs (ID: 15141) ✅
- Docker and system monitoring (ID: 14282) ✅

---

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [T430 Storage Setup](#2-t430-storage-setup)
3. [Network Configuration](#3-network-configuration)
4. [Fedora 42 Pre-configuration](#4-fedora-42-pre-configuration)
5. [Podman & Compose Setup](#5-podman--compose-setup)
6. [Monitoring Stack Deployment](#6-monitoring-stack-deployment)
7. [Prometheus Configuration](#7-prometheus-configuration)
8. [Loki Configuration](#8-loki-configuration)
9. [Tempo Configuration](#9-tempo-configuration)
10. [Alertmanager Configuration](#10-alertmanager-configuration)
11. [Grafana Configuration](#11-grafana-configuration)
12. [External Exporters](#12-external-exporters)
13. [K3s Integration](#13-k3s-integration)
14. [Alerting Rules](#14-alerting-rules)
15. [Validation](#15-validation)
16. [Maintenance](#16-maintenance)

---

## 1. Architecture Overview

### Why monitoring outside K3s

Running the monitoring stack on a dedicated server (T430) instead of inside K3s is the correct enterprise pattern:

```
K3s cluster fails
      │
      ├── Monitoring IN cluster → Grafana goes down → blind
      └── Monitoring OUT cluster → Grafana stays up → root cause visible
```

The T430 survives cluster failures and provides full observability of the incident.

### Full stack diagram

```
┌─────────────────── T430 · 10.10.10.10 (VLAN 10 MGMT) ──────────────────┐
│                                                                           │
│  Prometheus :9091  ←── scrapes ──→  K3s nodes (10.10.20.x)             │
│  (9090=Cockpit — no usar)                                                │
│  Grafana    :3000  ←── queries ──→  AdGuard (10.10.10.3)               │
│  Loki       :3100  ←── receives ─→  pfSense (10.10.10.1)               │
│  Alertmanager:9093 ←── rules   ──→  Proxmox (192.168.1.65)             │
│  Tempo      :4317/4318/3200         Switch  (10.10.10.2)                │
│  node-exporter:9100 (T430 itself)                                        │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  Alertmanager → Email / Slack / Telegram / Webhook
```

> **⚠️ Puerto 9090 ocupado por Cockpit** en Fedora 42. Prometheus usa el puerto **9091** externamente. Internamente en la red Podman usa 9090 — Grafana apunta a `http://prometheus:9090` (interno).

### What gets monitored

| Layer | Source | Exporter | Metrics |
|---|---|---|---|
| Hypervisor | Proxmox VE | pve_exporter | VMs, RAM, CPU, storage |
| Firewall | pfSense | node_exporter | interfaces, states, rules |
| DNS | AdGuard Home | adguard_exporter | queries, blocks, latency |
| Switch | TL-SG108E | SNMP exporter | port stats, errors |
| K3s nodes | All 5 nodes | node_exporter | CPU, RAM, disk, net |
| K3s cluster | kube-state-metrics | in-cluster | pods, deployments, PVCs |
| Storage | Longhorn | built-in | volume health, replica |
| Network | Cilium/Hubble | built-in | flows, drops, latency |
| Service mesh | Istio | built-in | request rate, errors |
| Logs | All pods | Promtail → Loki | all container logs |
| Traces | Instrumented apps | OTel → Tempo | distributed traces |
| T430 itself | localhost | node_exporter | monitoring server health |

---

## 2. T430 Storage Setup

### Physical disk layout

| Bay | Device | Type | Size | Purpose |
|---|---|---|---|---|
| WWAN M.2 | `/dev/sda` | SSD | 512GB | OS + Prometheus + Tempo + Grafana |
| SATA | `/dev/sdb` | HDD | 500GB | Loki logs |
| Ultrabay caddy | `/dev/sdc` | HDD | 500GB | Backups + snapshots |

### 2.1 Verify disks

```bash
lsblk
# Expected:
# sda  512G  (SSD — root already mounted here)
# sdb  500G  (HDD — to be formatted)
# sdc  500G  (HDD — to be formatted)

# Confirm SSD is root
df -h /
# /dev/sda3  or /dev/mapper/... mounted on /
```

### 2.2 Format and mount HDD disks

```bash
# Partition sdb (Loki logs)
sudo parted /dev/sdb --script mklabel gpt mkpart primary ext4 0% 100%
sudo mkfs.ext4 -L loki-data /dev/sdb1
sudo mkdir -p /opt/monitoring/loki

# Partition sdc (backups)
sudo parted /dev/sdc --script mklabel gpt mkpart primary ext4 0% 100%
sudo mkfs.ext4 -L monitoring-backup /dev/sdc1
sudo mkdir -p /opt/monitoring/backup

# Get UUIDs
sudo blkid /dev/sdb1
sudo blkid /dev/sdc1

# Add to /etc/fstab (replace UUIDs)
echo "UUID=<sdb1-uuid>  /opt/monitoring/loki    ext4  defaults,noatime  0 2" | sudo tee -a /etc/fstab
echo "UUID=<sdc1-uuid>  /opt/monitoring/backup  ext4  defaults,noatime  0 2" | sudo tee -a /etc/fstab

# Mount all
sudo systemctl daemon-reload
sudo mount -a

# Verify
df -h | grep monitoring
```

### 2.3 Create monitoring directory structure

```bash
sudo mkdir -p \
  /opt/monitoring/prometheus/data \
  /opt/monitoring/prometheus/config \
  /opt/monitoring/grafana/data \
  /opt/monitoring/grafana/provisioning/datasources \
  /opt/monitoring/grafana/provisioning/dashboards \
  /opt/monitoring/alertmanager/data \
  /opt/monitoring/alertmanager/config \
  /opt/monitoring/tempo/data \
  /opt/monitoring/tempo/config \
  /opt/monitoring/loki/data \
  /opt/monitoring/loki/config \
  /opt/monitoring/exporters \
  /opt/monitoring/backup/prometheus \
  /opt/monitoring/backup/grafana \
  /opt/monitoring/backup/configs

# Ownership for Podman rootless
sudo chown -R $USER:$USER /opt/monitoring
chmod -R 755 /opt/monitoring
```

### 2.4 Storage allocation summary

| Path | Disk | Allocated | Retention |
|---|---|---|---|
| `/opt/monitoring/prometheus/data` | SSD | 150GB | 30 days |
| `/opt/monitoring/tempo/data` | SSD | 80GB | 7 days |
| `/opt/monitoring/grafana/data` | SSD | 10GB | persistent |
| `/opt/monitoring/alertmanager/data` | SSD | 5GB | persistent |
| `/opt/monitoring/loki/data` | HDD sdb | 450GB | 30 days |
| `/opt/monitoring/backup` | HDD sdc | 450GB | 90 days |

---

## 3. Network Configuration

### 3.1 T430 en VLAN 10 MGMT

El servidor de monitoreo pertenece a VLAN 10 (gestión), junto con pfSense, AdGuard y el switch. NO va en VLAN 20 (K3s PROD) aunque anteriormente el T430 era un nodo del cluster.

**Motivo:** El monitoreo es infraestructura de gestión, no producción. Prometheus raspa los nodos K3s en VLAN 20 a través del routing de pfSense, que ya permite el acceso controlado entre VLANs.

### 3.2 Migración física T430 — de VLAN 20 a VLAN 10

El T430 estaba conectado al **puerto 3** del switch (PVID 20, K3s worker1). Hay que moverlo al **puerto 7** (PVID 10, MGMT).

**Paso 1 — Switch TL-SG108E:**

`http://10.10.10.2 → VLAN → 802.1Q VLAN`

El puerto 7 ya tiene PVID 10 configurado (ver HomeLab-Switch-VLAN.md). Verificar:

| Puerto | PVID | Rol |
|---|---|---|
| Puerto 3 | 20 | Ahora libre → conectar Dell 5480 |
| Puerto 7 | 10 | T430 monitoring |

**Paso 2 — Desconectar y reconectar físicamente:**
```
T430: desconectar de puerto 3 → conectar a puerto 7
Dell 5480: conectar a puerto 3 (o al TL-SG108 unmanaged)
```

**Paso 3 — Cambiar IP del T430 (de VLAN 20 a VLAN 10):**

```bash
# En T430 — cambiar de 10.10.20.x a 10.10.10.10
nmcli connection modify "Wired connection 1" \
  ipv4.method manual \
  ipv4.addresses "10.10.10.10/24" \
  ipv4.gateway "10.10.10.1" \
  ipv4.dns "10.10.10.3" \
  ipv4.ignore-auto-dns yes

nmcli connection up "Wired connection 1"

# Verificar
ip addr show enp0s25
# Expected: inet 10.10.10.10/24

ping -c 3 10.10.10.1    # pfSense
ping -c 3 10.10.10.3    # AdGuard
ping -c 3 10.10.20.100  # K3s master (a través de pfSense)
```

### 3.3 T430 en VLAN 10 MGMT

```
VLAN 10 MGMT (10.10.10.0/24)
  10.10.10.1  → pfSense LAN
  10.10.10.2  → TL-SG108E switch
  10.10.10.3  → AdGuard Home LXC
  10.10.10.10 → T430 monitoring server  ← aquí
```

**Configuración de red en T430:**

```bash
# Static IP on VLAN 10
nmcli connection modify "Wired connection 1" \
  ipv4.method manual \
  ipv4.addresses "10.10.10.10/24" \
  ipv4.gateway "10.10.10.1" \
  ipv4.dns "10.10.10.3" \
  ipv4.ignore-auto-dns yes
nmcli connection up "Wired connection 1"

# Verify
ip addr show enp0s25
# Expected: inet 10.10.10.10/24
```

### 3.2 pfSense firewall rules for scraping

The monitoring server (10.10.10.10) needs to reach K3s nodes on VLAN 20.

Navigate to `pfSense → Firewall → Rules → VLAN10`

Add rule:

| Field | Value |
|---|---|
| Action | Pass |
| Source | `10.10.10.10` |
| Destination | `10.10.20.0/24` |
| Destination port | `9100, 9090, 9091, 8080` |
| Description | Allow monitoring scrape VLAN20 |

### 3.3 AdGuard DNS rewrites for monitoring

Add to `Filters → DNS Rewrites`:

| Domain | IP |
|---|---|
| `monitoring.mgmt` | `10.10.10.10` |
| `grafana.mgmt` | `10.10.10.10` |
| `prometheus.mgmt` | `10.10.10.10` |
| `alertmanager.mgmt` | `10.10.10.10` |
| `loki.mgmt` | `10.10.10.10` |

### 3.4 Firewalld on T430

```bash
# Open monitoring ports
sudo firewall-cmd --permanent --add-port=9090/tcp   # Prometheus
sudo firewall-cmd --permanent --add-port=3000/tcp   # Grafana
sudo firewall-cmd --permanent --add-port=3100/tcp   # Loki
sudo firewall-cmd --permanent --add-port=9093/tcp   # Alertmanager
sudo firewall-cmd --permanent --add-port=4317/tcp   # Tempo OTLP gRPC
sudo firewall-cmd --permanent --add-port=4318/tcp   # Tempo OTLP HTTP
sudo firewall-cmd --permanent --add-port=9100/tcp   # node-exporter (T430 itself)
sudo firewall-cmd --reload
```

---

## 4. Fedora 42 Pre-configuration

### 4.1 System update

```bash
sudo dnf update -y
sudo dnf install -y curl wget git vim htop iotop
```

### 4.2 Hostname

```bash
sudo hostnamectl set-hostname monitoring
grep -q "monitoring" /etc/hosts || \
  echo "10.10.10.10 monitoring" | sudo tee -a /etc/hosts
```

### 4.3 Time sync

```bash
sudo timedatectl set-ntp true
timedatectl status | grep synchronized
```

### 4.4 node-exporter for T430 itself

Install node-exporter to monitor the monitoring server:

```bash
# Download
curl -fsSL -o /tmp/node_exporter.tar.gz \
  https://github.com/prometheus/node_exporter/releases/download/v1.8.2/node_exporter-1.8.2.linux-amd64.tar.gz

tar xzf /tmp/node_exporter.tar.gz -C /tmp
sudo cp /tmp/node_exporter-1.8.2.linux-amd64/node_exporter /usr/local/bin/
sudo chmod +x /usr/local/bin/node_exporter

# Create systemd service
sudo tee /etc/systemd/system/node_exporter.service << 'EOF'
[Unit]
Description=Node Exporter
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/node_exporter \
  --collector.diskstats \
  --collector.filesystem \
  --collector.meminfo \
  --collector.netdev \
  --collector.stat \
  --web.listen-address=:9100
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now node_exporter
curl -s http://localhost:9100/metrics | head -5
```

---

## 5. Podman & Compose Setup

### 5.1 Install Podman and compose plugin

```bash
sudo dnf install -y podman podman-compose podman-plugins
podman --version
podman-compose --version
```

### 5.2 Enable Podman socket (for Grafana)

```bash
systemctl --user enable --now podman.socket
loginctl enable-linger $USER
```

### 5.3 Create pod network

```bash
podman network create monitoring \
  --subnet 172.20.0.0/24 \
  --driver bridge

podman network ls | grep monitoring
```

---

## 6. Monitoring Stack Deployment

### 6.1 Main compose file

```bash
cat > /opt/monitoring/docker-compose.yml << 'EOF'
version: "3.8"

networks:
  monitoring:
    external: true

volumes:
  prometheus_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/monitoring/prometheus/data
  grafana_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/monitoring/grafana/data
  loki_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/monitoring/loki/data
  tempo_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/monitoring/tempo/data
  alertmanager_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/monitoring/alertmanager/data

services:

  prometheus:
    image: prom/prometheus:v2.53.0
    container_name: prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - /opt/monitoring/prometheus/config:/etc/prometheus:ro
      - prometheus_data:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=30d"
      - "--storage.tsdb.wal-compression"
      - "--web.enable-lifecycle"
      - "--web.enable-admin-api"
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:11.1.0
    container_name: grafana
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-changeme}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_SERVER_ROOT_URL=http://grafana.mgmt:3000
      - GF_FEATURE_TOGGLES_ENABLE=traceqlEditor
    volumes:
      - grafana_data:/var/lib/grafana
      - /opt/monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
    networks:
      - monitoring
    depends_on:
      - prometheus
      - loki
      - tempo

  loki:
    image: grafana/loki:3.1.0
    container_name: loki
    restart: unless-stopped
    ports:
      - "3100:3100"
    volumes:
      - /opt/monitoring/loki/config:/etc/loki:ro
      - loki_data:/loki
    command: -config.file=/etc/loki/loki.yml
    networks:
      - monitoring

  tempo:
    image: grafana/tempo:2.5.0
    container_name: tempo
    restart: unless-stopped
    ports:
      - "4317:4317"
      - "4318:4318"
      - "9411:9411"
      - "3200:3200"
    volumes:
      - /opt/monitoring/tempo/config:/etc/tempo:ro
      - tempo_data:/var/tempo
    command: -config.file=/etc/tempo/tempo.yml
    networks:
      - monitoring

  alertmanager:
    image: prom/alertmanager:v0.27.0
    container_name: alertmanager
    restart: unless-stopped
    ports:
      - "9093:9093"
    volumes:
      - /opt/monitoring/alertmanager/config:/etc/alertmanager:ro
      - alertmanager_data:/alertmanager
    command:
      - "--config.file=/etc/alertmanager/alertmanager.yml"
      - "--storage.path=/alertmanager"
    networks:
      - monitoring
    depends_on:
      - prometheus

EOF
```

### 6.2 Environment file

```bash
cat > /opt/monitoring/.env << 'EOF'
GRAFANA_PASSWORD=YourSecurePassword123!
EOF
chmod 600 /opt/monitoring/.env
```

---

## 7. Prometheus Configuration

### 7.1 Main config

```bash
cat > /opt/monitoring/prometheus/config/prometheus.yml << 'EOF'
global:
  scrape_interval: 30s
  evaluation_interval: 30s
  external_labels:
    cluster: homelab
    environment: production

rule_files:
  - /etc/prometheus/rules/*.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]

scrape_configs:

  # ── T430 monitoring server itself ──────────────────────────────────────
  - job_name: monitoring-server
    static_configs:
      - targets: ["10.10.10.10:9100"]
        labels:
          instance: t430
          role: monitoring

  # ── Proxmox VE ────────────────────────────────────────────────────────
  - job_name: proxmox
    static_configs:
      - targets: ["192.168.1.65:9221"]
        labels:
          instance: proxmox
          role: hypervisor
    metrics_path: /pve
    params:
      module: [default]

  # ── AdGuard Home ───────────────────────────────────────────────────────
  - job_name: adguard
    static_configs:
      - targets: ["10.10.10.3:9617"]
        labels:
          instance: adguard
          role: dns

  # ── K3s nodes (node_exporter DaemonSet) ───────────────────────────────
  - job_name: k3s-nodes
    static_configs:
      - targets:
          - "10.10.20.100:9100"
          - "10.10.20.101:9100"
          - "10.10.20.102:9100"
          - "10.10.20.103:9100"
          - "10.10.20.104:9100"
        labels:
          cluster: k3s-homelab
    relabel_configs:
      - source_labels: [__address__]
        regex: "10.10.20.100:.*"
        target_label: node
        replacement: dell-7490-1
      - source_labels: [__address__]
        regex: "10.10.20.101:.*"
        target_label: node
        replacement: dell-7490-2
      - source_labels: [__address__]
        regex: "10.10.20.102:.*"
        target_label: node
        replacement: dell-5480
      - source_labels: [__address__]
        regex: "10.10.20.103:.*"
        target_label: node
        replacement: p52
      - source_labels: [__address__]
        regex: "10.10.20.104:.*"
        target_label: node
        replacement: t440p-storage

  # ── K3s kube-state-metrics ────────────────────────────────────────────
  - job_name: kube-state-metrics
    static_configs:
      - targets: ["10.10.20.100:8080"]
        labels:
          cluster: k3s-homelab

  # ── K3s API server ────────────────────────────────────────────────────
  - job_name: k3s-api
    scheme: https
    tls_config:
      insecure_skip_verify: true
    bearer_token_file: /etc/prometheus/k3s-token
    static_configs:
      - targets: ["10.10.20.100:6443"]
        labels:
          cluster: k3s-homelab

  # ── Longhorn ──────────────────────────────────────────────────────────
  - job_name: longhorn
    static_configs:
      - targets: ["10.10.20.100:9500"]
        labels:
          cluster: k3s-homelab

  # ── Cilium / Hubble ───────────────────────────────────────────────────
  - job_name: cilium-agent
    kubernetes_sd_configs:
      - role: pod
        api_server: https://10.10.20.100:6443
        tls_config:
          insecure_skip_verify: true
        bearer_token_file: /etc/prometheus/k3s-token
        namespaces:
          names: [kube-system]
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_k8s_app]
        regex: cilium
        action: keep

  # ── Istio control plane ────────────────────────────────────────────────
  - job_name: istio-pilot
    static_configs:
      - targets: ["10.10.20.100:15014"]
        labels:
          cluster: k3s-homelab

  # ── Grafana itself ────────────────────────────────────────────────────
  - job_name: grafana
    static_configs:
      - targets: ["grafana:3000"]

  # ── Prometheus itself ─────────────────────────────────────────────────
  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]

EOF
```

### 7.2 Create rules directory

```bash
mkdir -p /opt/monitoring/prometheus/config/rules
```

---

## 8. Loki Configuration

```bash
cat > /opt/monitoring/loki/config/loki.yml << 'EOF'
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 720h
  ingestion_rate_mb: 16
  ingestion_burst_size_mb: 32
  max_streams_per_user: 10000

compactor:
  working_directory: /loki/compactor
  compaction_interval: 10m
  retention_enabled: true
  retention_delete_delay: 2h

query_range:
  results_cache:
    cache:
      embedded_cache:
        enabled: true
        max_size_mb: 256

EOF
```

---

## 9. Tempo Configuration

```bash
cat > /opt/monitoring/tempo/config/tempo.yml << 'EOF'
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317
        http:
          endpoint: 0.0.0.0:4318
    zipkin:
      endpoint: 0.0.0.0:9411

ingester:
  max_block_duration: 5m

compactor:
  compaction:
    block_retention: 168h

storage:
  trace:
    backend: local
    local:
      path: /var/tempo/blocks
    wal:
      path: /var/tempo/wal

metrics_generator:
  registry:
    external_labels:
      source: tempo
      cluster: homelab
  storage:
    path: /var/tempo/generator/wal

overrides:
  defaults:
    metrics_generator:
      processors: [service-graphs, span-metrics]

EOF
```

---

## 10. Alertmanager Configuration

```bash
cat > /opt/monitoring/alertmanager/config/alertmanager.yml << 'EOF'
global:
  smtp_smarthost: "smtp.gmail.com:587"
  smtp_from: "homelab-alerts@gmail.com"
  smtp_auth_username: "homelab-alerts@gmail.com"
  smtp_auth_password: "YOUR_APP_PASSWORD"
  resolve_timeout: 5m

route:
  group_by: ["alertname", "cluster", "severity"]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: default

  routes:
    - match:
        severity: critical
      receiver: critical
      repeat_interval: 1h

    - match:
        severity: warning
      receiver: default
      repeat_interval: 4h

receivers:
  - name: default
    email_configs:
      - to: "admin@yourdomain.com"
        subject: "[HomeLab] {{ .GroupLabels.alertname }} - {{ .Status | toUpper }}"
        body: |
          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Labels: {{ .Labels }}
          {{ end }}

  - name: critical
    email_configs:
      - to: "admin@yourdomain.com"
        subject: "[CRITICAL] HomeLab: {{ .GroupLabels.alertname }}"
        body: |
          CRITICAL ALERT
          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          {{ end }}

inhibit_rules:
  - source_match:
      severity: critical
    target_match:
      severity: warning
    equal: ["alertname", "cluster"]

EOF
```

---

## 11. Grafana Configuration

### 11.1 Datasources provisioning

```bash
cat > /opt/monitoring/grafana/provisioning/datasources/datasources.yml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    jsonData:
      timeInterval: 30s

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      maxLines: 1000

  - name: Tempo
    type: tempo
    access: proxy
    url: http://tempo:3200
    jsonData:
      tracesToLogsV2:
        datasourceUid: loki
        spanStartTimeShift: -5m
        spanEndTimeShift: 5m
      serviceMap:
        datasourceUid: prometheus
      nodeGraph:
        enabled: true
      lokiSearch:
        datasourceUid: loki

  - name: Alertmanager
    type: alertmanager
    access: proxy
    url: http://alertmanager:9093
    jsonData:
      implementation: prometheus

EOF
```

### 11.2 Dashboard provisioning config

```bash
cat > /opt/monitoring/grafana/provisioning/dashboards/dashboards.yml << 'EOF'
apiVersion: 1

providers:
  - name: HomeLab Dashboards
    type: file
    disableDeletion: false
    updateIntervalSeconds: 60
    options:
      path: /etc/grafana/provisioning/dashboards
      foldersFromFilesStructure: true

EOF
```

### 11.3 Pre-built dashboards to import

Import these dashboard IDs from Grafana.com (`Dashboards → Import`):

| Dashboard | ID | Covers |
|---|---|---|
| Node Exporter Full | `1860` | CPU, RAM, disk, network per node |
| Kubernetes cluster | `15661` | K3s cluster overview |
| Longhorn | `13032` | Volume health, replicas |
| Cilium v1.12 | `16611` | Network flows, Hubble |
| Istio Control Plane | `7645` | Istio metrics |
| Istio Workload | `7630` | Per-service traffic |
| Loki & Promtail | `14127` | Log volume, errors |
| Tempo / Tracing | `16310` | Trace overview |
| AdGuard Home | `13659` | DNS queries, blocks |
| Proxmox pve_exporter | `10347` | Hypervisor metrics |
| Alertmanager | `9578` | Alert state |

---

## 12. External Exporters

### 12.1 pve_exporter (on Proxmox host)

```bash
# On Proxmox host shell
pip3 install prometheus-pve-exporter --break-system-packages

# Create config
cat > /etc/pve_exporter.yml << 'EOF'
default:
  user: prometheus@pve
  password: YOUR_PASSWORD
  verify_ssl: false
EOF

# Create Proxmox API user (in Proxmox UI)
# Datacenter → Users → Add: prometheus@pve
# Permissions → Add: / → prometheus@pve → PVEAuditor

# Create systemd service
cat > /etc/systemd/system/pve_exporter.service << 'SVCEOF'
[Unit]
Description=Proxmox VE Prometheus Exporter
After=network-online.target

[Service]
ExecStart=/usr/local/bin/pve_exporter /etc/pve_exporter.yml 9221 0.0.0.0
Restart=always

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable --now pve_exporter
curl http://192.168.1.65:9221/pve?module=default | head -5
```

### 12.2 adguard-exporter (on T430 — scrapes AdGuard remotely)

```bash
# Add to compose file or run standalone
podman run -d \
  --name adguard-exporter \
  --network monitoring \
  --restart unless-stopped \
  -p 9617:9617 \
  -e ADGUARD_HOSTNAME=10.10.10.3 \
  -e ADGUARD_PORT=3000 \
  -e ADGUARD_USERNAME=admin \
  -e ADGUARD_PASSWORD=YOUR_ADGUARD_PASSWORD \
  ebrianne/adguard-exporter:latest

curl http://localhost:9617/metrics | head -5
```

### 12.3 node-exporter on K3s nodes

Deploy as DaemonSet in K3s (from Dell 7490 #1):

```yaml
# /opt/k8s/monitoring/node-exporter-daemonset.yml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      hostNetwork: true
      hostPID: true
      containers:
        - name: node-exporter
          image: prom/node-exporter:v1.8.2
          args:
            - "--path.sysfs=/host/sys"
            - "--path.rootfs=/host/root"
            - "--collector.filesystem.ignored-mount-points=^/(dev|proc|sys|run)($|/)"
          ports:
            - containerPort: 9100
              hostPort: 9100
          volumeMounts:
            - name: sys
              mountPath: /host/sys
              readOnly: true
            - name: root
              mountPath: /host/root
              readOnly: true
      volumes:
        - name: sys
          hostPath:
            path: /sys
        - name: root
          hostPath:
            path: /
      tolerations:
        - operator: Exists
```

```bash
kubectl create namespace monitoring
kubectl apply -f /opt/k8s/monitoring/node-exporter-daemonset.yml
kubectl get pods -n monitoring
```

---

## 13. K3s Integration

### 13.1 Get K3s token for Prometheus

```bash
# On Dell 7490 #1 (K3s master)
sudo cat /var/lib/rancher/k3s/server/node-token

# On T430 — save token
mkdir -p /opt/monitoring/prometheus/config
echo "YOUR_TOKEN_VALUE" > /opt/monitoring/prometheus/config/k3s-token
chmod 600 /opt/monitoring/prometheus/config/k3s-token
```

### 13.2 Promtail for K3s log collection

Deploy Promtail as DaemonSet to ship logs to Loki on T430:

```yaml
# /opt/k8s/monitoring/promtail-daemonset.yml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: promtail
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: promtail
  template:
    metadata:
      labels:
        app: promtail
    spec:
      serviceAccountName: promtail
      containers:
        - name: promtail
          image: grafana/promtail:3.1.0
          args:
            - "-config.file=/etc/promtail/config.yml"
          env:
            - name: HOSTNAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
          volumeMounts:
            - name: config
              mountPath: /etc/promtail
            - name: varlog
              mountPath: /var/log
              readOnly: true
            - name: varlibdockercontainers
              mountPath: /var/lib/docker/containers
              readOnly: true
      volumes:
        - name: config
          configMap:
            name: promtail-config
        - name: varlog
          hostPath:
            path: /var/log
        - name: varlibdockercontainers
          hostPath:
            path: /var/lib/docker/containers
      tolerations:
        - operator: Exists
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: promtail-config
  namespace: monitoring
data:
  config.yml: |
    server:
      http_listen_port: 9080

    clients:
      - url: http://10.10.10.10:3100/loki/api/v1/push

    scrape_configs:
      - job_name: kubernetes-pods
        kubernetes_sd_configs:
          - role: pod
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_node_name]
            target_label: node
          - source_labels: [__meta_kubernetes_namespace]
            target_label: namespace
          - source_labels: [__meta_kubernetes_pod_name]
            target_label: pod
          - source_labels: [__meta_kubernetes_pod_container_name]
            target_label: container
```

```bash
kubectl apply -f /opt/k8s/monitoring/promtail-daemonset.yml
```

---

## 14. Alerting Rules

```bash
mkdir -p /opt/monitoring/prometheus/config/rules

cat > /opt/monitoring/prometheus/config/rules/infrastructure.yml << 'EOF'
groups:

  - name: infrastructure
    rules:

      - alert: NodeDown
        expr: up{job="k3s-nodes"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "K3s node {{ $labels.node }} is down"
          description: "Node {{ $labels.node }} ({{ $labels.instance }}) has been unreachable for 2 minutes."

      - alert: HighCPU
        expr: 100 - (avg by(instance,node) (rate(node_cpu_seconds_total{mode="idle",job="k3s-nodes"}[5m])) * 100) > 90
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High CPU on {{ $labels.node }}"
          description: "CPU usage is {{ $value | printf \"%.1f\" }}% on {{ $labels.node }}."

      - alert: HighMemory
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory on {{ $labels.instance }}"
          description: "Memory usage is {{ $value | printf \"%.1f\" }}%."

      - alert: DiskSpaceLow
        expr: (1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|fuse.lxcfs"} / node_filesystem_size_bytes)) * 100 > 85
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Disk space low on {{ $labels.instance }}"
          description: "Disk {{ $labels.mountpoint }} is {{ $value | printf \"%.1f\" }}% full."

      - alert: ProxmoxDown
        expr: up{job="proxmox"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Proxmox hypervisor unreachable"
          description: "Cannot scrape Proxmox metrics. Hypervisor may be down."

      - alert: AdGuardDown
        expr: up{job="adguard"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "AdGuard Home is down"
          description: "DNS filtering is unavailable — all clients using fallback DNS."

  - name: kubernetes
    rules:

      - alert: PodCrashLooping
        expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} is crash-looping"
          description: "Container {{ $labels.container }} has restarted {{ $value | printf \"%.0f\" }} times."

      - alert: PodNotReady
        expr: kube_pod_status_ready{condition="true"} == 0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} not ready"

      - alert: K3sNodeNotReady
        expr: kube_node_status_condition{condition="Ready",status="true"} == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "K3s node {{ $labels.node }} is NotReady"

  - name: storage
    rules:

      - alert: LonghornVolumeRobot
        expr: longhorn_volume_robustness == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Longhorn volume {{ $labels.volume }} is faulted"

      - alert: LonghornNodeStorageFull
        expr: (longhorn_node_storage_usage_bytes / longhorn_node_storage_capacity_bytes) * 100 > 85
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Longhorn storage on {{ $labels.node }} is {{ $value | printf \"%.1f\" }}% full"

  - name: monitoring-server
    rules:

      - alert: MonitoringDiskLow
        expr: (1 - (node_filesystem_avail_bytes{instance="10.10.10.10:9100"} / node_filesystem_size_bytes)) * 100 > 80
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "Monitoring server disk {{ $labels.mountpoint }} is {{ $value | printf \"%.1f\" }}% full"
          description: "Reduce retention or expand storage on T430."

EOF
```

---

## 15. Start the Stack

```bash
cd /opt/monitoring
podman-compose up -d

# Verify all containers are running
podman-compose ps

# Check logs
podman-compose logs -f prometheus
podman-compose logs -f grafana
podman-compose logs -f loki
```

---

## 16. Validation

### 16.1 Health checks

```bash
# Prometheus
curl -s http://localhost:9090/-/healthy && echo "Prometheus OK"
curl -s http://10.10.10.10:9090/api/v1/targets | python3 -m json.tool | grep -c '"health":"up"'

# Grafana
curl -s http://localhost:3000/api/health | python3 -m json.tool

# Loki
curl -s http://localhost:3100/ready && echo "Loki OK"

# Alertmanager
curl -s http://localhost:9093/-/healthy && echo "Alertmanager OK"

# Tempo
curl -s http://localhost:3200/ready && echo "Tempo OK"
```

### 16.2 Verify scrape targets

```bash
# All targets should be UP
curl -s http://localhost:9090/api/v1/targets | \
  python3 -c "import sys,json; t=json.load(sys.stdin)['data']['activeTargets']; \
  [print(f\"{x['labels']['job']:30s} {x['health']}\") for x in t]"
```

### 16.3 Grafana access

```
http://10.10.10.10:3000
http://grafana.mgmt:3000   (via AdGuard DNS rewrite)
```

Login: `admin` / value from `.env`

### 16.4 Test alert

```bash
# Trigger a test alert
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{"labels":{"alertname":"TestAlert","severity":"warning"},"annotations":{"summary":"Test from HomeLab"}}]'
```

---

## 17. Maintenance

### Backup

```bash
# Prometheus snapshot
curl -X POST http://localhost:9090/api/v1/admin/tsdb/snapshot
ls /opt/monitoring/prometheus/data/snapshots/

# Copy to backup disk
rsync -av /opt/monitoring/prometheus/data/snapshots/ /opt/monitoring/backup/prometheus/
rsync -av /opt/monitoring/grafana/data/ /opt/monitoring/backup/grafana/
rsync -av /opt/monitoring/prometheus/config/ /opt/monitoring/backup/configs/prometheus/
rsync -av /opt/monitoring/alertmanager/config/ /opt/monitoring/backup/configs/alertmanager/
```

### Scheduled backup (cron)

```bash
crontab -e
# Add:
0 3 * * * rsync -av /opt/monitoring/prometheus/data/snapshots/ /opt/monitoring/backup/prometheus/ >> /var/log/monitoring-backup.log 2>&1
0 3 * * * rsync -av /opt/monitoring/grafana/data/ /opt/monitoring/backup/grafana/ >> /var/log/monitoring-backup.log 2>&1
```

### Update stack

```bash
cd /opt/monitoring
podman-compose pull
podman-compose up -d
```

### Disk usage check

```bash
du -sh /opt/monitoring/*/data
df -h /opt/monitoring/prometheus/data
df -h /opt/monitoring/loki
```

---

## Appendix A — Quick Reference

### Service URLs

| Service | URL | Port |
|---|---|---|
| Grafana | `http://grafana.mgmt:3000` | 3000 |
| Prometheus | `http://prometheus.mgmt:9090` | 9090 |
| Alertmanager | `http://alertmanager.mgmt:9093` | 9093 |
| Loki | `http://loki.mgmt:3100` | 3100 |
| Tempo | `http://10.10.10.10:3200` | 3200 |

### Common commands

```bash
# Siempre usar sudo — Podman corre como root en el T430
sudo podman-compose -f /opt/monitoring/docker-compose.yml ps
sudo podman ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Restart single service
sudo bash -c "cd /opt/monitoring && podman-compose restart prometheus"

# View logs
sudo podman logs prometheus 2>&1 | tail -30
sudo podman logs grafana 2>&1 | tail -30
sudo podman logs loki 2>&1 | tail -30

# Reload Prometheus config (no restart)
curl -X POST http://localhost:9091/-/reload

# Check Prometheus targets
curl -s http://localhost:9091/api/v1/targets | \
  python3 -c "import sys,json; t=json.load(sys.stdin)['data']['activeTargets']; \
  [print(f\"{x['labels'].get('job','?'):25s} {x['health']}\") for x in t]"

# Import dashboard via API (evita problemas con ! en contraseña)
sudo grafana cli admin reset-admin-password NEWPASSWORD

# Disk usage
sudo du -sh /opt/monitoring/prometheus/data
sudo df -h /srv/storage /srv/storage2
```

### T430 storage summary — Estado real (lsblk)

| Device | Bay | Mount | Size | Used for |
|---|---|---|---|---|
| `/dev/sdc` | WWAN SSD | `/` (LVM vg_t430-lv_root) | 476GB | OS + Prometheus + Tempo + Grafana + Alertmanager |
| `/dev/sda` | SATA HDD | `/srv/storage` → symlink `/opt/monitoring/loki/data` | 465GB | Loki logs (30d) |
| `/dev/sdb` | Ultrabay caddy | `/srv/storage2` → symlink `/opt/monitoring/backup` | 465GB | Backups + snapshots |

### Lecciones aprendidas — Problemas encontrados en deployment

| Problema | Causa | Solución |
|---|---|---|
| Containers exited (permission denied) | SELinux Enforcing bloqueaba acceso a volúmenes | Agregar `:z` a todos los volume mounts en docker-compose.yml |
| Loki: `delete-request-store` error | Retención habilitada sin configurar el store | Agregar `delete_request_store: filesystem` al compactor config |
| Prometheus: `permission denied /prometheus` | UID 65534 no aplicó correctamente | `chown -R 65534:65534` + permisos 775 en data dir |
| Grafana: `not writable` | UID 472 no aplicó | `chown -R 472:472 /opt/monitoring/grafana/data` |
| Tempo: `mkdir /var/tempo/blocks: permission denied` | UID 10001 no aplicó | `chown -R 10001:10001 /opt/monitoring/tempo/data` |
| `short-name resolution` error | Fedora requiere nombre completo de imagen | Usar `docker.io/prom/prometheus:v2.53.0` en lugar de `prom/prometheus:v2.53.0` |
| Prometheus puerto 9090 ocupado | Cockpit usa 9090 en Fedora | Mapear `9091:9090` en docker-compose, usar `:9091` externamente |
| Grafana API: `Invalid username or password` | El `!` en la contraseña rompía base64 en bash | Usar `grafana cli admin reset-admin-password` para cambiar password |
| Grafana dashboard vacío | Se importó sin seleccionar datasource | Re-importar vía API con payload JSON especificando `DS_PROMETHEUS` |
| T430 no llegaba a pfSense | LAN en `vtnet1` (untagged), T430 en puerto 7 VLAN 10 (tagged) | Crear `vtnet1.10` en pfSense y migrar LAN |
| pfSense WebUI no accesible | Regla WAN faltante | `pfctl -d` temporal + agregar regla WAN para 192.168.1.0/24 |

### Credenciales activas

| Servicio | Usuario | Contraseña | Notas |
|---|---|---|---|
| Grafana | admin | <REDACTED> | Cambiado de <REDACTED> — el `!` causa problemas en bash |
| Prometheus | — | — | Sin autenticación |
| Alertmanager | — | — | Sin autenticación |
| Loki | — | — | Sin autenticación |

---

## Appendix B — Troubleshooting del stack

### Contenedor no arranca — permission denied

```bash
# Verificar contexto SELinux del directorio
ls -laZ /opt/monitoring/prometheus/data/

# Si el contexto no es container_file_t, el :z en el compose lo corrige al reiniciar
sudo bash -c "cd /opt/monitoring && podman-compose down && podman-compose up -d"

# Verificar UIDs correctos
stat -c '%u:%g' /opt/monitoring/prometheus/data   # → 65534:65534
stat -c '%u:%g' /opt/monitoring/grafana/data      # → 472:472
stat -c '%u:%g' /opt/monitoring/tempo/data        # → 10001:10001
stat -c '%u:%g' /srv/storage                      # → 10001:10001
```

### Stack completo down — reinicio limpio

```bash
sudo bash << 'EOF'
cd /opt/monitoring
podman-compose down
podman rm -f prometheus grafana loki tempo alertmanager 2>/dev/null || true
podman-compose up -d
sleep 25
podman ps -a --format "table {{.Names}}\t{{.Status}}"
curl -sf http://localhost:9091/-/healthy && echo "Prometheus OK"
curl -sf http://localhost:3000/api/health && echo "Grafana OK"
curl -sf http://localhost:3100/ready && echo "Loki OK"
curl -sf http://localhost:3200/ready && echo "Tempo OK"
curl -sf http://localhost:9093/-/healthy && echo "Alertmanager OK"
EOF
```

### Autostart en boot

Los contenedores tienen `restart: unless-stopped` en docker-compose pero como corren como root, systemd no los gestiona automáticamente. Para autostart:

```bash
sudo bash << 'EOF'
cat > /etc/systemd/system/monitoring-stack.service << 'SVC'
[Unit]
Description=HomeLab Monitoring Stack (Podman Compose)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/monitoring
ExecStart=/usr/bin/podman-compose up -d
ExecStop=/usr/bin/podman-compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable monitoring-stack
echo "Autostart configurado"
EOF
```

---

*Document v2.0 — T430 Dedicated Monitoring Server DEPLOYED · Enterprise HomeLab · June 2026*
