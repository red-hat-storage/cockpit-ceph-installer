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
import { getSVCToken } from './services/utils.js';
import { GenericModal } from './components/common/modal.jsx';
// import InfoBar from './components/infobar.jsx';

const _ = cockpit.gettext;

export class Application extends React.Component {
    constructor() {
        super();
        this.state = {
            'hostname': _("Unknown"),
            "svctoken": null,
            modalVisible: false,
            modalContent: ''
        };
    }

    componentDidMount() {
        getSVCToken()
                .done((content, tag) => { this.setState({svctoken: content}) })
                .fail((error) => {
                    console.error("Can't read the svctoken file");
                    console.error("Error : " + error.message);
                });
    }

    hideModal = () => {
        this.setState({modalVisible: false});
    }

    showModal = (modalContent) => {
        // handle the show and hide of the app level modal
        console.log("content: ");
        console.log(modalContent);
        this.setState({
            modalVisible: true,
            modalContent: modalContent
        });
    }

    render() {
        console.log("in main render");
        console.log("svctoken is " + this.state.svctoken);

        return (
            <div className="container-fluid">
                <GenericModal
                    show={this.state.modalVisible}
                    content={this.state.modalContent}
                    closeHandler={this.hideModal} />
                <h2><b>Ceph Installer</b></h2>
                {/* <ProgressTracker /> */}
                <InstallationSteps svctoken={this.state.svctoken} modalHandler={this.showModal} />
                {/* <InfoBar /> */}
            </div>
        );
    }
}
