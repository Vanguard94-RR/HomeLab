# Jenkins Auto-Configuration

Jenkins se despliega automáticamente con el pipeline `homepage-pipeline` configurado.

## Despliegue Automático

Usa este comando para desplegar Jenkins con configuración automática:

```bash
helm upgrade --install jenkins jenkins/jenkins \
  -n ci-cd \
  -f /home/admin/Documents/HomeLab/Helm-Charts/jenkins-values-minimal.yaml \
  --post-renderer /home/admin/Documents/HomeLab/Helm-Charts/add-hook.sh \
  --wait --timeout=10m
```

## Qué hace

1. Instala Jenkins con plugins mínimos (workflow-aggregator, git)
2. Ejecuta un Helm hook (Job de Kubernetes) después de la instalación
3. El Job espera a que Jenkins esté listo
4. Crea automáticamente el pipeline `homepage-pipeline`
5. El pipeline queda listo para usar

## Archivos Involucrados

- `jenkins-values-minimal.yaml` - Configuración de Helm
- `add-hook.sh` - Post-renderer que agrega el Job
- `jenkins-templates/post-install-job.yaml` - Job que configura el pipeline

## Verificación

Después del despliegue:

```bash
# Ver logs del Job de configuración
kubectl logs -n ci-cd job/jenkins-configure-pipeline

# Verificar pipeline en Jenkins
curl -u admin:$(kubectl get secret -n ci-cd jenkins-admin -o jsonpath='{.data.jenkins-admin-password}' | base64 -d) http://192.168.1.91:32000/job/homepage-pipeline/api/json
```

## Acceso

- URL: http://192.168.1.91:32000
- Usuario: admin
- Password: See Kubernetes secret `jenkins-admin` in `ci-cd` namespace (managed by External Secrets + Vault)
- Pipeline: http://192.168.1.91:32000/job/homepage-pipeline/

## SSH Keys

Si necesitas restaurar SSH keys para acceso al host:

```bash
bash /home/admin/Documents/HomeLab/Helm-Charts/jenkins-post-install.sh
```

(El post-install.sh solo es necesario si las SSH keys no están en /tmp/jenkins-backup/)
