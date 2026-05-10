import com.datapipe.jenkins.vault.configuration.*
import jenkins.model.*

def jenkins = Jenkins.get()

def configuration = new VaultConfiguration()
configuration.setVaultUrl("http://vault.vault.svc.cluster.local:8200")
configuration.setVaultCredentialId("vault-kubernetes")

VaultPluginConfiguration vaultConfig =
    GlobalConfiguration.all().get(VaultPluginConfiguration.class)

vaultConfig.setConfiguration(configuration)
vaultConfig.save()

println("Vault configured successfully")
