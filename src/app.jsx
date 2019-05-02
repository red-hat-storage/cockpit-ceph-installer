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
import { readFile } from './services/utils.js';
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
            "svctoken": null,
            modalVisible: false,
            modalContent: '',
            modalTitle: '',
            ready: false
        };
        this.defaults = {
            sourceType: "Red Hat",
            targetVersion: "RHCS 3",
            clusterType: "Production",
            installType: "Container",
            networkType: 'ipv4',
            osdType: "Bluestore",
            osdMode: "Standard",
            flashUsage: "Journals/Logs",
        };
    }

    componentWillMount() {
        // count of the number of files we need to read before we should render anything
        var filesRead = 0;

        console.log("Loading svctoken for ansible-runner-service API");
        readFile('/etc/ansible-runner-service/svctoken')
                .then((content, tag) => {
                    this.setState({
                        svctoken: content
                    });
                    console.log("SVC token is : " + content);
                    filesRead++;
                    if (filesRead == 2) { this.setState({ready: true}) }
                })
                .fail((error) => {
                    console.error("Can't read the svctoken file");
                    console.error("Error : " + error.message);
                });

        console.log("Checking for local default cluster setting overrides");
        readFile('/var/lib/cockpit/ceph-installer/defaults.json', 'JSON')
                .then((overrides, tag) => {
                    if (overrides) {
                        console.log("Overrides are : " + JSON.stringify(overrides));
                        Object.assign(this.defaults, overrides);
                        console.log("Defaults are : " + JSON.stringify(this.defaults));
                    } else {
                        console.log("Unable to read local default overrides, using internal defaults");
                    }
                    filesRead++;
                    if (filesRead == 2) { this.setState({ready: true}) }
                })
                .catch((e) => {
                    console.error("Error reading overrides file: " + JSON.stringify(e));
                });
    }

    hideModal = () => {
        this.setState({modalVisible: false});
    }

    showModal = (title, modalContent) => {
        // handle the show and hide of the app level modal
        console.log("Content: " + modalContent);
        this.setState({
            modalVisible: true,
            modalContent: modalContent,
            modalTitle: title
        });
    }

    render() {
        console.log("in main render");
        if (!this.state.ready) {
            return (<div />);
        } else {
            return (
                <div className="container-fluid">
                    <GenericModal
                        show={this.state.modalVisible}
                        title={this.state.modalTitle}
                        content={this.state.modalContent}
                        closeHandler={this.hideModal} />
                    <h2><b>Ceph Installer</b></h2>
                    <InstallationSteps svctoken={this.state.svctoken} defaults={this.defaults} modalHandler={this.showModal} />
                </div>
            );
        }
    }
}
