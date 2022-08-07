/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as exec from '@actions/exec'

import {
  mdCommonHeader,
  mdReusableWorkflows,
  newLine,
  mdAnchor,
  mdAgenda,
} from './markdown'
import { readYamls } from './fs'
import { log } from './helpers'

interface Props {
  overwrite: boolean
  documentPath: string
  generateOnly?: boolean
  githubBaseUrl?: string
  shouldMakePullRequest?: boolean
}
const getProps = (): Props => ({
  overwrite: core.getInput('overwrite') === 'true',
  documentPath: core.getInput('document-path'),
  generateOnly: core.getInput('generate-only') === 'true',
  githubBaseUrl: core.getInput('github-base-url'),
  shouldMakePullRequest: core.getInput('make-pull-request') === 'true',
})

const runMain = async (): Promise<void> => {
  try {
    log('Run reusable-workflow-documentator ...')

    const props: Props = getProps()
    log(`props: ${String(props)} ...`)

    // read yml file
    const readYamlResult = readYamls()
    if (Object.keys(readYamlResult.workflowCallYamlMap).length === 0) {
      log('No workflow call yaml file found')
      core.setOutput('result', '')
      return
    }
    const anchorDoc = mdAnchor()
    const headerDoc = mdCommonHeader()
    const contentDoc = mdReusableWorkflows(readYamlResult)
    const agendaDoc = mdAgenda(readYamlResult.workflowCallYamlMap)

    const result = `${anchorDoc}${headerDoc}${newLine}${agendaDoc}${newLine}${contentDoc}`
    core.setOutput('document', result)
    core.setOutput('agenda', agendaDoc)
    log('Done generate markdown processes ...')
    log(result)

    const token = process.env.GITHUB_TOKEN
    if (token && !props.generateOnly) {
      exec.exec('echo', [
        result,
        props.overwrite ? '>' : '>>',
        props.documentPath,
      ])
      exec.exec('git', ['config', 'user.name', 'GitHub Action Documentator'])
      exec.exec('git', ['config', 'user.email', 'github-action.com'])
      exec.exec('git', ['add', props.documentPath])
      exec.exec('git', ['commit', '-m', 'Update reusable workflows document'])
      const octokit = github.getOctokit(token, {
        baseUrl: props.githubBaseUrl
          ? props.githubBaseUrl
          : 'https://api.github.com',
      })
      const context = github.context

      const defaultBranch = context.payload.repository?.default_branch || 'main'
      const owner = context.repo.owner
      const repo = context.repo.repo
      const headBranch = context.ref.replace('refs/heads/', '')
      const baseBranch = context.payload.pull_request
        ? context.payload.pull_request.base.ref
        : defaultBranch

      if (props.shouldMakePullRequest) {
        // if make-pull-request is true, create a pull request
        try {
          const pullRequest = await octokit.rest.pulls.create({
            owner,
            repo,
            title: '📝 Reusable Workflows Document',
            body: result,
            head: headBranch,
            base: baseBranch,
          })
          if (pullRequest.status < 300) {
            log('Success create pull request')
          } else {
            log('Fail create pull request: ' + JSON.stringify(pullRequest))
            core.setFailed(new Error('Failed to create pull request'))
          }
        } catch (err) {
          log('Fail create pull request: ' + JSON.stringify(err))
          core.setFailed(
            err instanceof Error ? err : new Error(JSON.stringify(err))
          )
        }
      } else {
        // If make-pull-request is false, then push the changes to the head branch.
        exec.exec('git', ['push', 'origin', headBranch])
        log('Success create pull request')
      }
    }
  } catch (err) {
    core.setFailed(
      err instanceof Error ? err.message : `Unknown error: ${String(err)}`
    )
  }
}

runMain()
