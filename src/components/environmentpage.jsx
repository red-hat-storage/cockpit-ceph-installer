import React from 'react';
import { UIButton } from './common/nextbutton.jsx';
import { RadioSet } from './common/radioset.jsx';
import { Selector } from './common/selector.jsx';

import '../app.scss';

export class EnvironmentPage extends React.Component {
    //
    // this page offers the high level cluster configuration options like
    // version/release and filestore/bluestore. Defaults are defined in
    // the components initial state

    constructor(props) {
        super(props);
        this.state = {
            className: this.props.className,
            osdType: props.defaults.osdType,
            networkType: props.defaults.networkType,
            sourceType: props.defaults.sourceType,
            clusterType: props.defaults.clusterType,
            osdMode: props.defaults.osdMode,
            installType: props.defaults.installType,
            flashUsage: props.defaults.flashUsage,
            targetVersion: props.defaults.targetVersion
        };

        this.installSource = {
            "Red Hat": ["RHCS 3", 'RHCS 4'],
            "Distribution": ["13 (Mimic)", "12 (Luminous)"],
            "Community": ["13 (Mimic)", "12 (Luminous)", "14 (Nautilus)"]
        };

        this.clusterTypes = {
            options : ["Production", "Development/POC"],
            tooltip : "Production mode applies strict configuration rules. To relax rules for\na developer or POC, use Development/POC mode"
        };

        this.osd_type = {
            description: "OSD type",
            options: ["Bluestore", "Filestore"],
            name: "osdType",
            tooltip: "Bluestore is the default OSD type, offering more features and improved\nperformance. Filestore is supported as a legacy option only",
            horizontal: true
        };
        this.network_type = {
            description: "Network connectivity",
            options: ['ipv4'], // 'ipv6'],
            name: 'networkType',
            tooltip: "",
            horizontal: true
        };
        this.source = {
            description: "Software source",
            options: ["Red Hat", "OS Distribution", "Community"],
            name: "sourceType",
            tooltip: '',
            horizontal: true
        };
        this.osd_mode = {
            description: "Encryption",
            options: ["None", "Encrypted"],
            name: "osdMode",
            info: "For added security, you may use at-rest encryption for your storage devices",
            tooltip: "Data encryption uses the Linux dmcrypt subsystem (LUKS1)",
            horizontal: true
        };

        this.install_type = {
            description: "Installation type",
            options: ["Container", "RPM"],
            name: "installType",
            info: "Ceph can be installed as lightweight container images, or as rpm packages. Container deployments offer service isolation enabling improved collocation and hardware utilization",
            tooltip: "Containers simplify deployment",
            horizontal: true
        };
        this.flash_usage = {
            description: "Flash Configuration",
            options: ["Journals/Logs", "OSD Data"],
            name: "flashUsage",
            info: "Flash media (SSD or NVMe) can be used for all data, or as journal devices to improve the performance of slower devices (HDDs)",
            tooltip: "In Journal 'mode', the installation process will check HDD:Flash media\nratios against best practice",
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

    updateState = (event) => {
        console.log("received a state change for radio button: " + event.target.getAttribute('name') + " with " + event.target.value);
        this.setState({ [event.target.getAttribute('name')]: event.target.value });
    }

    checkReady = (event) => {
        // insert any validation logic here - that would compare the state settings prior to passing page state to the parent
        console.log("current radio button config: " + JSON.stringify(this.state));
        this.props.action(this.state);
    }

    render() {
        var versionList = this.installSource[this.state.sourceType];

        return (
            <div id="environment" className={this.props.className}>
                <h3>1. Environment</h3>
                Define the high level environment settings that will determine the way that the Ceph cluster is installed and configured.
                <div >
                    <Selector labelName="Installation Source" vertical value={this.state.installSource} options={Object.keys(this.installSource)} callback={this.installChange} />
                    <Selector labelName="Target Version" vertical value={this.state.targetVersion} options={versionList} callback={this.versionChange} />
                    <Selector labelName="Cluster Type" vertical value={this.state.clusterType} options={this.clusterTypes.options} tooltip={this.clusterTypes.tooltip} callback={this.clusterTypeChange} />
                </div>
                <RadioSet config={this.network_type} default={this.state.networkType} callback={this.updateState} />
                <RadioSet config={this.osd_type} default={this.state.osdType} callback={this.updateState} />
                <RadioSet config={this.flash_usage} default={this.state.flashUsage} callback={this.updateState} />
                <RadioSet config={this.osd_mode} default={this.state.osdMode} callback={this.updateState} />
                <RadioSet config={this.install_type} default={this.state.installType} callback={this.updateState} />
                <div className="nav-button-container">
                    <UIButton primary btnLabel="Hosts &rsaquo;" action={this.checkReady} />
                </div>
            </div>
        );
    }
}

export default EnvironmentPage;
