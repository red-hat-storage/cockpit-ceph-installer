/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

import cockpit from 'cockpit';
import React from 'react';
import './app.scss';
// import ProgressTracker from './components/progresstracker.jsx';
import InstallationSteps from './components/installationsteps.jsx';
import { readFile, getUser } from './services/utils.js';
import { checkAPI } from './services/apicalls.js';
import { GenericModal } from './components/common/modal.jsx';
// import InfoBar from './components/infobar.jsx';

const _ = cockpit.gettext;

export class Application extends React.Component {
    //
    // Application "bootstrap". The cockpit menu option "Ceph Installer" starts
    // this reactjs app. This page performs some initial setup then effectively
    // hands off to the installationsteps page to build out the page components
    constructor() {
        super();
        this.state = {
            'hostname': _("Unknown"),
            modalVisible: false,
            modalContent: '',
            modalTitle: '',
            ready: false
        };
        this.defaults = {
            iscsiTargetName: "iqn.2003-01.com.redhat.iscsi-gw:ceph-igw",
            sourceType: "Red Hat",
            targetVersion: "RHCS 4",
            clusterType: "Production",
            installType: "Container",
            networkType: 'ipv4',
            osdType: "Bluestore",
            osdMode: "None",
            flashUsage: "Journals/Logs",
            cockpitHost: "localhost",
            user: {},
            rhcs_node_exporter_image: "registry.redhat.io/openshift4/ose-prometheus-node-exporter:v4.1",
            rhcs_grafana_image: "registry.redhat.io/rhceph/rhceph-3-dashboard-rhel7:3",
            rhcs_prometheus_image: "registry.redhat.io/openshift4/ose-prometheus:4.1",
            rhcs_alertmanager_image: "registry.redhat.io/openshift4/ose-prometheus-alertmanager:4.1",
            rhcs_ceph_image: "rhceph-beta/rhceph-4-rhel8",
            domainName: ""
        };
    }

    checkReady = (errorMsgs) => {
        if (errorMsgs.length == 0) {
            this.setState({ready: true});
            console.debug("UI using the following defaults :" + JSON.stringify(this.defaults));
        } else {
            // errors encountered, better give the user the bad news
            let msgs = errorMsgs.map((msg, key) => {
                return (<li key={key}>{msg}</li>);
            });
            let errorText = (
                <span>The following environment errors were detected; <br />
                    {msgs}
                    <br />
                    The installer is unable to continue, until these issues are resolved. To retry, refresh the page.
                </span>);
            this.showModal("Environment Error", errorText);
        }
    }

    componentWillMount() {
        // count of the number of files we need to read before we should render anything
        var actions = 0;

        // count of all the actions we'll do to check the environment is ready. Make sure this
        // matches the number of tests performed in this function.
        var actions_limit = 6;

        // array of error messages - ideally should be empty!
        var errorMsgs = [];

        readFile('/etc/hostname')
                .then((content, tag) => {
                    // check the content, and extract up to 1st dot if needed
                    let hostComponent = content.split(".");

                    // hostname
                    this.defaults['cockpitHost'] = hostComponent[0];

                    // domain name
                    if (hostComponent.length > 1) {
                        console.debug("hostname is fully qualified with a domain suffix");
                        let dnsName = hostComponent.slice(1,).join(".");
                        this.defaults['domainName'] = dnsName.trim(); // drop any whitespace
                    } else {
                        console.debug("hostname does not include domain suffix");
                    }

                    console.log("running on hostname " + hostComponent[0] + " in dns domain '" + this.defaults['domainName'] + "'");
                    actions++;
                    if (actions == actions_limit) {
                        this.checkReady(errorMsgs);
                    }
                });

        readFile('/etc/ansible-runner-service/certs/client/client.crt')
                .then((content, tag) => {
                    if ((!content) && (tag == '-')) {
                        // crt file missing
                        console.error("Error: client crt file is missing. Has generate_certs.sh been run?");
                        errorMsgs.push("client .crt file is missing. Has generate_certs.sh been run?");
                    } else {
                        console.log("client crt file accessible");
                        // Could check the internal format is PEM?
                    }
                    actions++;
                    if (actions == actions_limit) {
                        this.checkReady(errorMsgs);
                    }
                });
        readFile('/etc/ansible-runner-service/certs/client/client.key')
                .then((content, tag) => {
                    if ((!content) && (tag == '-')) {
                        // crt file missing
                        console.error("Error: client key file is missing. Has generate_certs.sh been run?");
                        errorMsgs.push("client .key file is missing. Has generate_certs.sh been run?");
                    } else {
                        console.log("client key file accessible");
                        // Could check the internal format is PEM?
                    }
                    actions++;
                    if (actions == actions_limit) {
                        this.checkReady(errorMsgs);
                    }
                });

        checkAPI()
                .then((resp) => {
                    console.log("API responded and ready");
                })
                .catch(error => {
                    console.log("error " + JSON.stringify(error));
                    errorMsgs.push("unable to access the ansible-runner-service API. Are the client files in place? Is the service running?");
                })
                .finally(() => {
                    actions++;
                    if (actions == actions_limit) {
                        this.checkReady(errorMsgs);
                    }
                });

        console.log("Checking for local default cluster setting overrides");
        readFile('/var/lib/cockpit/ceph-installer/defaults.json', 'JSON')
                .then((overrides, tag) => {
                    if (overrides) {
                        console.log("Overrides are : " + JSON.stringify(overrides));
                        Object.assign(this.defaults, overrides);
                    } else {
                        console.log("Unable to read local default overrides, using internal defaults");
                    }
                    actions++;
                    if (actions == actions_limit) {
                        this.checkReady(errorMsgs);
                    }
                })
                .catch((e) => {
                    errorMsgs.push("invalid format of configuration override file");
                    console.error("Error reading overrides file: " + JSON.stringify(e));
                });

        console.log("fetching user details");
        getUser()
                .then((user) => {
                    this.defaults['user'] = user;
                    actions++;
                    if (actions == actions_limit) {
                        this.checkReady(errorMsgs);
                    }
                });
    }

    hideModal = () => {
        this.setState({modalVisible: false});
    }

    showModal = (title, modalContent) => {
        // handle the show and hide of the app level modal
        // console.log("Content: " + modalContent);
        this.setState({
            modalVisible: true,
            modalContent: modalContent,
            modalTitle: title
        });
    }

    render() {
        console.log("in main render");
        var installPages = (<div />);
        if (this.state.ready) {
            installPages = (<InstallationSteps defaults={this.defaults} modalHandler={this.showModal} />);
        }

        return (
            <div className="container-fluid">
                <GenericModal
                    show={this.state.modalVisible}
                    title={this.state.modalTitle}
                    content={this.state.modalContent}
                    closeHandler={this.hideModal} />
                <h2><b>Ceph Installer</b></h2>
                { installPages }
            </div>
        );
    }
}
