multibranchPipelineJob('homelab') {

    branchSources {
        branchSource {
            source {
                github {
                    id('homelab-github')
                    repoOwner('Vanguard94-RR')
                    repository('HomeLab')
                    credentialsId('github-token')
                    configuredByUrl(true)
                    repositoryUrl('https://github.com/Vanguard94-RR/HomeLab.git')
                }
            }
        }
    }

    factory {
        workflowBranchProjectFactory {
            scriptPath('apps/homepage/Jenkinsfile')
        }
    }

    orphanedItemStrategy {
        discardOldItems {
            numToKeep(20)
        }
    }

    triggers {
        periodicFolderTrigger {
            interval('1m')
        }
    }
}
