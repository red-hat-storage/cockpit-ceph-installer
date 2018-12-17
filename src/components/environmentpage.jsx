import React from 'react';
import { NextButton } from './common/nextbutton.jsx';
import { RadioSet } from './common/radioset.jsx';
import { Selector } from './common/selector.jsx';

import '../app.scss';

export class EnvironmentPage extends React.Component {
    constructor(props) {
        super(props);
        this.updateState = this.updateState.bind(this);
        this.checkReady = this.checkReady.bind(this);
        this.state = {
            className: this.props.className,
            osdType: "Bluestore",
            networkType: "ipv4",
            sourceType: "Red Hat",
            clusterType: "Production",
            osdMode: "Standard",
            installType: "Container",
            flashUsage: "Journals/Logs",
            targetVersion: "RHCS 3"
        };

        this.installSource = {
            "Red Hat": ["RHCS 3", 'RHCS 4'],
            "Distribution": ["13 (Mimic)", "12 (Luminous)"],
            "Community": ["13 (Mimic)", "12 (Luminous)", "14 (Nautilus)"]
        };

        this.clusterTypes = ["Production", "Development/POC"];

        // TODO: These settings should come from the parent, which in turn should be
        // the result of a cockpit.file read request, so the config is editable from
        // a file - instead of hacking code!
        this.osd_type = {
            description: "Select the OSD type",
            options: ["Bluestore", "Filestore"],
            default: "Bluestore",
            name: "osdType",
            horizontal: true
        };
        this.network_type = {
            description: "Network connectivity",
            options: ['ipv4', 'ipv6'],
            default: 'ipv4',
            name: 'networkType',
            horizontal: true
        };
        this.source = {
            description: "Select the software source type",
            options: ["Red Hat", "OS Distribution", "Community"],
            default: "Red Hat",
            name: "sourceType",
            horizontal: true
        };
        this.osd_mode = {
            description: "Select the level of data security required on the OSD drives",
            options: ["Standard", "Encrypted"],
            default: "Standard",
            name: "osdMode",
            horizontal: true
        };
        this.install_type = {
            description: "Choose an installation type. Ceph can be installed either as regular packages (RPMs) or as container images. " +
                         "Container deployments support collocation of more Ceph services",
            options: ["Container", "RPM"],
            default: "Container",
            name: "installType",
            horizontal: true
        };
        this.flash_usage = {
            description: "Flash (SSD or NVMe) media can be used as either Journals/Logs or as the main backing storage itself (OSD)",
            options: ["Journals/Logs", "OSD Data"],
            default: "Journals/Logs",
            name: "flashUsage",
            horizontal: true
        };
    }

    clusterTypeChange = (event) => {
        console.log("changing the type of cluster to " + event.target.value);
        this.setState({clusterType: event.target.value});
    }

    installChange = (event) => {
        console.log("changing installation settings for: " + event.target.value);
        this.setState({
            sourceType: event.target.value,
            targetVersion: this.installSource[event.target.value][0]
        });
    }

    versionChange = (event) => {
        this.setState({targetVersion: event.target.value});
        console.log("changing version : " + event.target.value);
    }

    updateState(event) {
        console.log("received a state change for radio button: " + event.target.getAttribute('name') + " with " + event.target.value);
        this.setState({ [event.target.getAttribute('name')]: event.target.value });
    }

    checkReady(event) {
        // insert any validation logic here - that would compare the state settings prior to passing page state to the parent
        console.log("current radio button config: " + JSON.stringify(this.state));
        this.props.action(this.state);
    }

    render() {
        var versionList = this.installSource[this.state.sourceType];

        return (
            <div id="environment" className={this.props.className}>
                <h3>Environment</h3>
                Define the high level environment settings that will determine the way that the Ceph cluster is installed and configured.
                <div >
                    <Selector labelName="Installation Source" options={Object.keys(this.installSource)} callback={this.installChange} />
                    <Selector labelName="Target Version" value={this.state.targetVersion} options={versionList} callback={this.versionChange} />
                    <Selector labelName="Cluster Type" options={this.clusterTypes} callback={this.clusterTypeChange} />
                </div>
                <p>&nbsp;</p>
                <RadioSet config={this.network_type} callback={this.updateState} />
                <p>&nbsp;</p>
                <RadioSet config={this.osd_type} callback={this.updateState} />
                <p>&nbsp;</p>
                <RadioSet config={this.flash_usage} callback={this.updateState} />
                <p>&nbsp;</p>
                <RadioSet config={this.osd_mode} callback={this.updateState} />
                <p>&nbsp;</p>
                <RadioSet config={this.install_type} callback={this.updateState} />
                <NextButton action={this.checkReady} />
            </div>
        );
    }
}

export default EnvironmentPage;
