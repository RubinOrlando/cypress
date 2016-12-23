import cs from 'classnames'
import _ from 'lodash'
import React, { Component } from 'react'
import { action } from 'mobx'
import { observer } from 'mobx-react'
import Loader from 'react-loader'

import App from '../lib/app'
import state from '../lib/state'
import BuildsCollection from './builds-collection'
import errors from '../lib/errors'
import { getBuilds, pollBuilds, stopPollingBuilds } from './builds-api'
import { getCiKeys } from '../projects/projects-api'
import projectsStore from '../projects/projects-store'
import orgsStore from '../organizations/organizations-store'

import Build from './builds-list-item'
import ErrorMessage from './error-message'
// import LoginThenSetupCI from './login-then-setup-ci'
// import LoginThenSeeBuilds from './login-then-see-builds'
import PermissionMessage from './permission-message'
import ProjectNotSetup from './project-not-setup'

@observer
class Builds extends Component {
  constructor (props) {
    super(props)

    this.buildsCollection = new BuildsCollection()

    this.state = {
      ciKey: null,
    }
  }

  componentWillMount () {
    this._getBuilds()
    this._handlePolling()
    this._getCiKey()
  }

  componentDidUpdate () {
    this._getCiKey()
    this._handlePolling()
  }

  componentWillUnmount () {
    this._stopPolling()
  }

  _getBuilds = () => {
    getBuilds(this.buildsCollection)
  }

  _handlePolling () {
    if (this._shouldPollBuilds()) {
      this._poll()
    } else {
      this._stopPolling()
    }
  }

  _shouldPollBuilds () {
    return (
      state.hasUser &&
      !!this.props.project.id
    )
  }

  _poll () {
    pollBuilds(this.buildsCollection)
  }

  _stopPolling () {
    stopPollingBuilds()
  }

  _getCiKey () {
    if (this._needsCiKey()) {
      getCiKeys().then((ciKeys = []) => {
        if (ciKeys.length) {
          this.setState({ ciKey: ciKeys[0].id })
        }
      })
    }
  }

  _needsCiKey () {
    return (
      !this.state.ciKey &&
      state.hasUser &&
      !this.buildsCollection.isLoading &&
      !this.buildsCollection.error &&
      !this.buildsCollection.builds.length &&
      this.props.project.id
    )
  }

  render () {
    const { project } = this.props

    // //--------Build States----------//
    // // they are not logged in
    // if (!state.hasUser) {

    //   // AND they've never setup CI
    //   if (!this.props.project.id) {
    //     return <LoginThenSetupCI/>

    //   // OR they have setup CI
    //   } else {
    //     return <LoginThenSeeBuilds/>
    //   }
    // }

    // If the project is invalid
    if (!project.valid) {
      return this._emptyWithoutSetup(false)
    }

    // OR if there is an error getting the builds
    if (this.buildsCollection.error) {
      // project id missing, probably removed manually from cypress.json
      if (errors.isMissingProjectId(this.buildsCollection.error)) {
        return this._emptyWithoutSetup()

      // the project is invalid
      } else if (errors.isNotFound(this.buildsCollection.error)) {
        return this._emptyWithoutSetup(false)

      // they are not authorized to see builds
      } else if (errors.isUnauthenticated(this.buildsCollection.error)) {
        return <PermissionMessage project={project} onRetry={this._getBuilds} />

      // other error, but only show if we don't already have builds
      } else if (!this.buildsCollection.isLoaded) {
        return <ErrorMessage error={this.buildsCollection.error} />
      }
    }

    // OR the builds are loading for the first time
    if (this.buildsCollection.isLoading && !this.buildsCollection.isLoaded) return <Loader color='#888' scale={0.5}/>

    // OR there are no builds to show
    if (!this.buildsCollection.builds.length) {

      // AND they've never setup CI
      if (!project.id) {
        return this._emptyWithoutSetup()

      // OR they have setup CI
      } else {
        return this._empty()
      }
    }
    //--------End Build States----------//

    // everything's good, there are builds to show!
    return (
      <div id='builds-list-page' className='builds'>
        <header>
          <h5>Builds
          <a href="#" className='btn btn-sm see-all-builds' onClick={this._openBuilds}>
            See All <i className='fa fa-external-link'></i>
          </a>

          </h5>
          <div>
            {this._lastUpdated()}
            <button
              className='btn btn-link btn-sm'
              disabled={this.buildsCollection.isLoading}
              onClick={this._getBuilds}
            >
              <i className={cs('fa fa-refresh', {
                'fa-spin': this.buildsCollection.isLoading,
              })}></i>
            </button>
          </div>
        </header>
        <ul className='builds-container list-as-table'>
          {_.map(this.buildsCollection.builds, (build) => (
            <Build
              key={build.id}
              goToBuild={this._openBuild}
              build={build}
            />
          ))}
        </ul>
      </div>
    )
  }

  _lastUpdated () {
    if (!this.buildsCollection.lastUpdated) return null

    return (
      <span className='last-updated'>
        Last updated: {this.buildsCollection.lastUpdated}
      </span>
    )
  }

  _emptyWithoutSetup (isValid = true) {
    return (
      <ProjectNotSetup
        project={this.props.project}
        isValid={isValid}
        onSetup={this._setProjectDetails}
      />
    )
  }

  @action _setProjectDetails = (projectDetails) => {
    this.buildsCollection.setError(null)
    projectsStore.updateProject(this.props.project, {
      id: projectDetails.id,
      name: projectDetails.projectName,
      public: projectDetails.public,
      orgId: projectDetails.orgId,
      orgName: (orgsStore.getOrgById(projectDetails.orgId) || {}).name,
      valid: true,
    })
  }

  _empty () {
    return (
      <div id='builds-list-page'>
        <div className='first-build-instructions'>
          <h4>Run Your First Build in CI</h4>
          <p>You'll need to add 2 lines of code to your CI config. Where this code goes depends on your CI provider.</p>
          <h5>Install the CLI tools:</h5>
          <pre><code>npm install -g cypress-cli</code></pre>
          <h5>Run tests and upload assets:</h5>
          <pre><code>cypress ci {this.state.ciKey || '<ci-key>'}</code></pre>
          <p>Refer to your CI provider's documentation to know when to run these commands.</p>
          <p className='center'>
            <a href='#' onClick={this._openCiGuide}>
              <i className='fa fa-question-circle'></i>{' '}
              Learn more about Continuous Integration
            </a>
          </p>
          {this._privateMessage()}
        </div>
      </div>
    )
  }

  _privateMessage () {
    if (this.props.project.public) return null

    return (
      <p>A message about how user can invite other users through admin</p>
    )
  }

  _openBuilds = (e) => {
    e.preventDefault()
    App.ipc('external:open', `https://on.cypress.io/admin/projects/${this.props.project.id}/builds`)
  }

  _openCiGuide = (e) => {
    e.preventDefault()
    App.ipc('external:open', 'https://on.cypress.io/guides/continuous-integration')
  }

  _openBuild = (buildId) => {
    App.ipc('external:open', `https://on.cypress.io/admin/projects/${this.props.project.id}/builds/${buildId}`)
  }
}

export default Builds
