# HomeLab

Infraestructura personal basada en Kubernetes + Jenkins + Helm + GitOps.

## Structure

- apps/: aplicaciones desplegadas
- infrastructure/: charts, storage y networking
- scripts/: automatización y deployment helpers
- backups/: respaldos operativos
- docs/: documentación técnica

## Apps

- homepage
- calibreweb
- private registry

## Infrastructure

- jenkins
- longhorn
- helm charts

## CI/CD

Jenkins pipelines despliegan automáticamente cambios hacia Kubernetes.

## Future roadmap

- ArgoCD
- Monitoring stack
- Secrets management
- Ingress + TLS
