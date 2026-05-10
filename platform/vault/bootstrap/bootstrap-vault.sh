#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "${SCRIPT_DIR}")")"

NAMESPACE=vault

echo "========================================="
echo "Checking Vault status"
echo "========================================="

INITIALIZED=$(kubectl exec -n ${NAMESPACE} vault-0 -- \
  vault status -format=json | jq -r '.initialized')

SEALED=$(kubectl exec -n ${NAMESPACE} vault-0 -- \
  vault status -format=json | jq -r '.sealed')

if [ "$INITIALIZED" = "false" ]; then

  echo "========================================="
  echo "Initializing Vault"
  echo "========================================="

  kubectl exec -n ${NAMESPACE} vault-0 -- \
    vault operator init -key-shares=1 -key-threshold=1 \
    > "${ROOT_DIR}/vault-init.txt"

  UNSEAL_KEY=$(grep 'Unseal Key 1:' "${ROOT_DIR}/vault-init.txt" | awk '{print $4}')
  ROOT_TOKEN=$(grep 'Initial Root Token:' "${ROOT_DIR}/vault-init.txt" | awk '{print $4}')

  echo "${UNSEAL_KEY}" > "${ROOT_DIR}/.vault-unseal-key"
  echo "${ROOT_TOKEN}" > "${ROOT_DIR}/.vault-root-token"

else

  echo "Vault already initialized"

  if [ ! -f "${ROOT_DIR}/.vault-root-token" ]; then
    echo "Missing .vault-root-token"
    exit 1
  fi

  ROOT_TOKEN=$(cat "${ROOT_DIR}/.vault-root-token")

fi

if [ "$SEALED" = "true" ]; then

  echo "========================================="
  echo "Unsealing Vault"
  echo "========================================="

  if [ ! -f "${ROOT_DIR}/.vault-unseal-key" ]; then
    echo "Missing .vault-unseal-key"
    exit 1
  fi

  UNSEAL_KEY=$(cat "${ROOT_DIR}/.vault-unseal-key")

  kubectl exec -n ${NAMESPACE} vault-0 -- \
    vault operator unseal ${UNSEAL_KEY}

fi

echo "========================================="
echo "Login"
echo "========================================="

kubectl exec -n ${NAMESPACE} vault-0 -- \
  vault login ${ROOT_TOKEN}

echo "========================================="
echo "Enable Kubernetes Auth"
echo "========================================="

if kubectl exec -n ${NAMESPACE} vault-0 -- \
  vault auth list | grep -q "kubernetes/"
then
  echo "Kubernetes auth already enabled"
else
  kubectl exec -n ${NAMESPACE} vault-0 -- \
    vault auth enable kubernetes
fi

echo "========================================="
echo "Enable KV Secrets Engine"
echo "========================================="

if kubectl exec -n ${NAMESPACE} vault-0 -- \
  vault secrets list | grep -q "secret/"
then
  echo "KV secret engine already enabled"
else
  kubectl exec -n ${NAMESPACE} vault-0 -- \
    vault secrets enable -path=secret kv-v2
fi

echo "========================================="
echo "Write Jenkins Policy"
echo "========================================="

POLICY_FILE="${ROOT_DIR}/infrastructure/policies/vault/jenkins-policy.hcl"

kubectl cp \
  "${POLICY_FILE}" \
  vault/vault-0:/tmp/jenkins-policy.hcl

kubectl exec -n ${NAMESPACE} vault-0 -- \
  vault policy write jenkins /tmp/jenkins-policy.hcl

echo "========================================="
echo "Configure Kubernetes Auth"
echo "========================================="

TOKEN_REVIEW_JWT=$(kubectl create token default -n vault)

KUBE_HOST=$(kubectl config view --raw --minify \
  --output 'jsonpath={.clusters[0].cluster.server}')

KUBE_CA_CERT=$(kubectl config view --raw --minify \
  --output 'jsonpath={.clusters[0].cluster.certificate-authority-data}' | base64 -d)

kubectl exec -i -n ${NAMESPACE} vault-0 -- sh <<EOT
vault write auth/kubernetes/config \
  token_reviewer_jwt="${TOKEN_REVIEW_JWT}" \
  kubernetes_host="${KUBE_HOST}" \
  kubernetes_ca_cert='${KUBE_CA_CERT}'
EOT

echo "========================================="
echo "Create Jenkins Role"
echo "========================================="

kubectl exec -n ${NAMESPACE} vault-0 -- \
  vault write auth/kubernetes/role/jenkins \
    bound_service_account_names=jenkins \
    bound_service_account_namespaces=ci-cd \
    audience=vault \
    policies=jenkins \
    ttl=24h

echo "========================================="
echo "Store GitHub Secret"
echo "========================================="

read -s -p "GitHub Token: " GITHUB_TOKEN
echo ""

kubectl exec -i -n ${NAMESPACE} vault-0 -- sh <<EOT
vault kv put secret/jenkins/github \
  username=Vanguard94-RR \
  token=${GITHUB_TOKEN}
EOT

echo "========================================="
echo "Vault bootstrap completed"
echo "========================================="
