# Manual de Ingeniería: Despliegue y Optimización Avanzada de Suite de IA Local

**Entorno de Producción:** Lenovo ThinkPad P53 (Intel i7 - 6 Cores | 32 GB RAM | Nvidia Quadro T1000 4GB VRAM)  
**Perfil Tecnológico:** Cloud Engineer / SysAdmin / DevOps  
**Última Actualización:** Mayo 2026  

---

## 1. Arquitectura y Topología del Entorno

Para garantizar la portabilidad y evitar la saturación de las particiones del sistema, se ha aislado por completo el entorno de Inteligencia Artificial dentro de un directorio de desarrollo exclusivo.

* **Binarios del Sistema:** `/home/admin/Dev/IA/bin/`
* **Almacenamiento de Modelos (Pesos):** `/home/admin/Dev/IA/models/`
* **Librerías de Cómputo Gráfico (CUDA):** `/home/admin/Dev/IA/lib/ollama/`
* **Motor de Servicio:** `systemd` (Orquestado con privilegios de Kernel y variables aisladas)

---

## 2. Instalación Desacoplada del Motor

Para mitigar fallos por interrupciones en la tubería (*pipe*) de red, la instalación se realizó extrayendo directamente el empaquetado plano oficial:

```bash
# 1. Crear el árbol estructural de directorios
mkdir -p /home/admin/Dev/IA/bin
mkdir -p /home/admin/Dev/IA/models
mkdir -p /home/admin/Dev/IA/lib/ollama

# 2. Descargar e inyectar el binario plano en caliente
curl -L https://ollama.com | sudo tar --zstd -x -C /usr

# 3. Reubicar el binario al entorno de desarrollo
sudo mv /usr/bin/ollama /home/admin/Dev/IA/bin/

# 4. Saneamiento de propiedad del directorio local
sudo chown -R admin:admin /home/admin/Dev/IA
```

### Configuración del Shell del Usuario (`PATH`)

Para exponer el comando globalmente en la sesión activa:

```bash
echo 'export PATH="$PATH:/home/admin/Dev/IA/bin"' >> ~/.bashrc
source ~/.bashrc
```

---

## 3. Optimización Híbrida del Sistema Operativo (GPU Dedicada)

Se aisló el servidor gráfico (X11/Wayland), las interfaces visuales y VS Code para que se ejecuten **exclusivamente en la tarjeta integrada Intel**, liberando el 100% de la VRAM de la Nvidia Quadro T1000 para cómputo de tensores.

```bash
# Forzar el renderizado de la interfaz sobre la GPU Intel (Modo Offload)
sudo prime-select on-demand
```

*Validación post-reinicio:* El comando `glxinfo | grep "OpenGL vendor"` debe devolver de forma estricta: `OpenGL vendor string: Intel`.

---

## 4. Configuración Avanzada del Servicio `systemd`

El archivo de control del demonio se configuró con variables de bajo nivel para inyectar los runtimes de CUDA y evitar la segmentación de memoria en hardware con VRAM limitada.

1. **Editar archivo de servicio:**

   ```bash
   sudo vi /etc/systemd/system/ollama.service
   ```

2. **Bloque de Configuración de Producción:**

   ```ini
   [Unit]
   Description=Ollama Service (Custom Isolated & High-Performance)
   After=network-online.target

   [Service]
   ExecStart=/home/admin/Dev/IA/bin/ollama serve
   User=root
   Group=root
   Restart=always
   RestartSec=3
   # Mapeo de almacenamiento e infraestructura local
   Environment="OLLAMA_MODELS=/home/admin/Dev/IA/models"
   Environment="OLLAMA_RUNNERS_DIR=/home/admin/Dev/IA/lib/ollama"
   Environment="LD_LIBRARY_PATH=/home/admin/Dev/IA/lib/ollama:/usr/lib64:/usr/lib/x86_64-linux-gnu"
   Environment="PATH=$PATH:/home/admin/Dev/IA/bin:/usr/bin"
   # Directivas de optimización de bajo nivel
   Environment="OLLAMA_NUM_PARALLEL=1"
   Environment="OLLAMA_MAX_LOADED_MODELS=1"
   Environment="OLLAMA_FLASH_ATTENTION=1"
   Environment="OLLAMA_SCHED_SPREAD=0"

   [Install]
   WantedBy=multi-user.target
   ```

3. **Inyección de Librerías Dinámicas de Cómputo:**

   ```bash
   # Clonar los backends de CUDA dinámicos hacia el directorio local
   sudo cp -r /usr/lib/ollama/* /home/admin/Dev/IA/lib/ollama/ 2>/dev/null || true
   sudo chown -R admin:admin /home/admin/Dev/IA/lib

   # Liberar sockets colgados en red, recargar y activar el servicio
   sudo fuser -k 11434/tcp || true
   sudo systemctl daemon-reload
   sudo systemctl enable ollama --now
   ```

---

## 5. Compilación de Modelos a la Medida (`Modelfile`)

Para el análisis de repositorios masivos, se extendió la ventana de contexto estándar (4K) al doble (8K) y se limitaron los hilos matemáticos para evitar la degradación por *Hyper-Threading* en los **6 núcleos físicos** del i7.

1. **Crear archivo de definición de arquitectura:**

   ```bash
   nano /home/admin/Dev/IA/Qwen8k.Modelfile
   ```

2. **Parámetros del Kernel del Modelo:**

   ```text
   FROM qwen2.5-coder:7b-instruct-q4_K_M
   PARAMETER num_ctx 8192
   PARAMETER num_thread 6
   PARAMETER num_predict -1
   ```

3. **Compilación del Artefacto:**

   ```bash
   ollama create qwen2.5-coder:7b-8k -f /home/admin/Dev/IA/Qwen8k.Modelfile
   ```

---

## 6. Aprovisionamiento Final de Modelos en Disco

Se descargó la suite definitiva optimizada a 4-bits (`Q4_K_M`) que garantiza un *offloading* superior al 50% de las capas directamente en VRAM:

```bash
# Descarga de modelo generalista de arquitectura y SysAdmin
ollama run llama3.1:8b-instruct-q4_K_M

# Descarga de modelo ultra-ligero para embeddings vectoriales de repositorios (RAG)
ollama run nomic-embed-text
```

---

## 7. Integración Completa con el IDE (VS Code)

Se integró la extensión **Continue** mapeando las tareas de forma especializada de acuerdo a las fortalezas de cada modelo local.

### Archivo de Configuración de la Extensión (`~/.continue/config.yaml`)

```yaml
name: Local Config
version: 1.0.0
schema: v1
models:
  - name: Llama 3.1 8B (Cloud & SysAdmin)
    provider: ollama
    model: llama3.1:8b-instruct-q4_K_M
    roles:
      - chat
      - edit
      - apply

  - name: Qwen 2.5 Coder 7B (Desarrollo 8K)
    provider: ollama
    model: qwen2.5-coder:7b-8k
    roles:
      - chat
      - edit
      - apply
      - autocomplete

  - name: Nomic Embed
    provider: ollama
    model: nomic-embed-text:latest
    roles:
      - embed
```

### Regla de Exclusión de Repositorios Grandes (`.continueignore`)

Ubicado en la raíz de tus proyectos de código para optimizar la velocidad del indexador matemático:

```text
.venv/
venv/
node_modules/
vendor/
.terraform/
.git/
*.log
dist/
```

---

## 8. Libro de Comandos para Diagnóstico y Mantenimiento

* **Monitorear capas inyectadas en la GPU (Offloading):**

  ```bash
  sudo journalctl -u ollama --no-pager -n 40 | grep -i "offload"
  ```

  *Métrica esperada:* `load_tensors: offloaded 15/29 layers to GPU`.

* **Monitoreo dinámico de consumo de VRAM en tiempo real:**

  ```bash
  watch -n 0.5 nvidia-smi
  ```

* **Validación de Socket e Inventario Local:**

  ```bash
  ollama list
  ```

EOF
