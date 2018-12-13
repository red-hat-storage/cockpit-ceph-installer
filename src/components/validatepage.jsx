import React from 'react';
import { NextButton } from './common/nextbutton.jsx';
import { RoleCheckbox } from './common/rolecheckbox.jsx';
import { GenericModal } from './common/modal.jsx';
import { emptyRow } from './common/emptyrow.jsx';
import { toggleHostRole, buildRoles, checkPlaybook, countNICs, msgCount, sortByKey, collocationOK, getHost } from '../services/utils.js';
import { runPlaybook, getJobEvent, deleteHost } from '../services/apicalls.js';

import '../app.scss';

export class ValidatePage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            modalVisable: false,
            modalContent: '',
            ready: false,
            probeEnabled: true,
            selectAll: false,
            refresh: 0,
            hosts: [],
            probedCount: 0,
            pendingProbe: true,
            probeStatusMsg: ''
        };
        this.probeSummary = '';
        this.eventLookup = {}; // lookup for probe results
        this.skipChecks = true;
    }

    processEventData = (eventData) => {
        console.log("processing event data for " + eventData.remote_addr);
        let eventHostname = eventData.remote_addr;
        let localState = JSON.parse(JSON.stringify(this.state.hosts));
        let facts = eventData.res.data.summary_facts;

        let obj = {};
        obj['vendor'] = facts.vendor;
        obj['model'] = facts.model;
        obj['cpuType'] = facts.cpu_type;
        obj['subnets'] = facts.network.subnets;
        obj['subnet_details'] = facts.network.subnet_details;
        obj['hdd_devices'] = Object.keys(facts.hdd);
        obj['hdd'] = obj.hdd_devices.length;
        obj['ssd_devices'] = Object.keys(facts.ssd);
        obj['ssd'] = obj.ssd_devices.length;
        obj['capacity'] = facts.capacity;
        obj['cpu'] = facts.cpu_core_count;
        obj['ram'] = Math.round(facts.ram_mb / 1024);

        console.log(JSON.stringify(eventData.res.data.status));
        obj['ready'] = eventData.res.data.status;
        obj['msgs'] = eventData.res.data.status_msgs;

        obj['nic'] = countNICs(facts);

        for (let i = 0; i < localState.length; i++) {
            let host = localState[i];
            if (host.hostname == eventHostname) {
                console.log("updating state");
                Object.assign(host, obj);
                localState[i] = host;
                let currentCount = this.state.probedCount;
                this.setState({
                    hosts: localState,
                    probeCount: currentCount + 1
                });

                break;
            }
        }
        this.probeSummary = JSON.stringify(this.state.hosts);
    }

    updateProbeStatus = (response, playUUID) => {
        console.log("Update after a probe iteration");
        console.log("events are :" + JSON.stringify(response));
        let eventData = response.data.events;
        let eventIDs = Object.keys(eventData);
        let eventCount = eventIDs.length;
        let hostCount = this.state.hosts.length;

        let processed = Object.keys(this.eventLookup).length;
        this.setState({probeStatusMsg: processed + "/" + hostCount + " probes complete"});

        console.log("Progress " + eventCount + "/" + hostCount);
        eventIDs.forEach((eventID, idx, ary) => {
            if (this.eventLookup.hasOwnProperty(eventID)) {
                console.log("skipping " + eventID + " already seen it!");
            } else {
                this.eventLookup[eventID] = "";
                console.log("processing " + eventID);
                getJobEvent(playUUID, eventID, this.props.svctoken)
                        .then((resp) => {
                            let event = JSON.parse(resp);
                            // ignore verbose type events
                            if (event.data.event != "verbose") {
                                let hostData = event.data.event_data;
                                // console.log("event data returned is " + JSON.stringify(hostData));
                                this.processEventData(hostData);
                            }
                        });
            }
        });
    }

    probeComplete = () => {
        console.log("probe scan has completed");
        this.setState({
            probeEnabled: true,
            ready: true,
            probeStatusMsg: ''
        });
        this.eventLookup = {};
    }

    probeHosts = () => {
        console.log("Request to probe hosts received");
        this.setState({
            probeEnabled: false,
            pendingProbe: false,
            ready: false,
            probedCount: 0,
            probeStatusMsg: "0/" + this.state.hosts.length + " probes complete"
        });

        console.log("remove the status info for all the hosts");
        let hostsCopy = this.state.hosts.slice(0);
        hostsCopy.forEach((host, idx, hostsCopy) => {
            host.msgs = [];
            host.ready = '';
        });
        this.setState({hosts: hostsCopy});

        // build a JSON representation of the hosts
        // pass it to the api request
        var rolesByHost = {};
        this.state.hosts.forEach((host, idx, hosts) => {
            rolesByHost[host.hostname] = buildRoles([host]).join(',');
        });
        console.log("roles :" + JSON.stringify(rolesByHost));
        // call the playbook
        let clusterType;
        if (this.props.clusterType == 'Production') {
            clusterType = 'prod';
        } else {
            clusterType = 'dev';
        }

        let flashusage;
        if (this.props.flashUsage.toUpperCase().startsWith("JOURNAL")) {
            flashusage = 'journal';
        } else {
            flashusage = 'data';
        }

        let playbookVars = {
            inventory: rolesByHost,
            mode: clusterType,
            osdtype: this.props.osdType.toLowerCase(),
            flashusage: flashusage,
            deployment: this.props.installType.toLowerCase()
        };

        console.log("playbook vars are:" + JSON.stringify(playbookVars));

        runPlaybook("checkrole.yml", playbookVars, this.props.svctoken)
                .then((resp) => {
                    let response = JSON.parse(resp);
                    console.log("playbook execution started :" + response.status);
                    console.log("response object :" + JSON.stringify(response));
                    let playUUID = response.data.play_uuid;
                    console.log("tracking playbook with UUID :" + playUUID);

                    console.log("starting progress tracker");
                    checkPlaybook(playUUID, this.props.svctoken, this.updateProbeStatus, this.probeComplete);
                });

        this.setState({
            selectAll: false
        });
    }

    updateState = (updatedHosts) => {
        console.log("updating state with " + JSON.stringify(updatedHosts));
        this.setState({
            hosts: updatedHosts,
            pendingProbe: true
        });
    }

    updateRole = (hostname, role, checked) => {
        console.log("updating host " + hostname + " details for role " + role + " status of " + checked);

        var svctoken = this.props.svctoken;
        var localState = this.state.hosts.splice(0);
        if (checked) {
            let hostObject = getHost(localState, hostname);
            console.log("host is: " + JSON.stringify(hostObject));
            let currentRoles = buildRoles([hostObject]);
            if (!collocationOK(currentRoles, role, this.props.installType, this.props.clusterType)) {
                console.log("current hosts are: " + JSON.stringify(localState));
                this.updateState(localState);
                return;
            }
        }

        toggleHostRole(localState, this.updateState, hostname, role, checked, svctoken);
    }

    hostOK (host) {
        return (['OK'].includes(host.ready));
    }

    toggleAllRows = (event) => {
        if (!this.state.ready) {
            let errorMsg = (
                <div>You can't select 'ALL' hosts until a probe has been performed</div>
            );
            this.showModal(errorMsg);
            return;
        }

        console.log("toggle selection of all hosts in the table" + event.target + " " + event.target.checked + " " + event.target.getAttribute('name'));
        var hostsCopy = JSON.parse(JSON.stringify(this.state.hosts));
        var hostsChanged = false;
        for (let i = 0; i < hostsCopy.length; i++) {
            if (this.hostOK(hostsCopy[i])) {
                hostsCopy[i].selected = event.target.checked;
                hostsChanged = true;
            }
        }

        if (hostsChanged) {
            this.setState({
                selectAll: event.target.checked,
                hosts: hostsCopy
            });
        } else {
            let errorMsg = (
                <div>There aren't any usable hosts. All hosts have errors or warnings related to them</div>
            );
            this.showModal(errorMsg);
        }
    }

    toggleSingleRow = (event) => {
        console.log("toggle selection of a host " + event.target + " " + event.target.checked + " " + event.target.getAttribute('name'));
        var hostsCopy = JSON.parse(JSON.stringify(this.state.hosts));
        for (let i = 0; i < hostsCopy.length; i++) {
            if (hostsCopy[i].hostname == event.target.getAttribute('name')) {
                if (this.hostOK(hostsCopy[i])) {
                    hostsCopy[i].selected = event.target.checked;
                    this.setState({hosts: hostsCopy});
                    break;
                } else {
                    let errorMsg = (
                        <div>Only hosts with a status of 'OK' can be selected</div>
                    );
                    this.showModal(errorMsg);
                }
                break;
            }
        }
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

    checkHostsReady = () => {
        // Need to have more than 3 hosts in a selected state
        // all selected hosts must have a status of OK
        let candidateHosts = [];
        let hostsToDelete = [];
        if (JSON.stringify(this.state.hosts) != this.probeSummary) {
            console.log("clicked next, but changes detected since last probe");
            let errorMsg = (
                <div>
                    You have made role changes, so a further probe is required.
                </div>);
            this.showModal(errorMsg);
            return;
        }

        if (this.skipChecks) {
            console.log("all checks bypassed");
            let hosts = { hosts: JSON.parse(JSON.stringify(this.state.hosts)) };
            this.props.action(hosts);
            return;
        }

        for (let i = 0; i < this.state.hosts.length; i++) {
            if (this.state.hosts[i].selected) {
                candidateHosts.push(JSON.parse(JSON.stringify(this.state.hosts[i])));
            } else {
                hostsToDelete.push(this.state.hosts[i].hostname);
            }
        }
        // if (this.state.probePending) {
        //     console.error("You must run another probe, since changes have been made");
        //     return;
        // }

        // TODO: this is mickey-mouse for testing ONLY
        if (candidateHosts.length < 1) {
            console.log("Not enough hosts with a selected state");
            return;
        }

        var chain = Promise.resolve();
        // At this point the checks have passed
        if (hostsToDelete.length > 0) {
            console.log("We have " + hostsToDelete.length + "hosts to remove from the inventory");
            // run the delete hosts serially, but in the background

            for (let hostName of hostsToDelete) {
                chain = chain.then(() => deleteHost(hostName, this.props.svctoken));
            }
        }
        chain.then(() => {
            console.log("promise chain complete, passing hosts back to parent");
            // At this point the checks have passed, so allow the UI to continue
            let hosts = {hosts: JSON.parse(JSON.stringify(candidateHosts))};
            // pass a copy of the hosts back to the parent's callback
            console.log("hosts array looks like this:");
            console.log(JSON.stringify(hosts));
            this.props.action(hosts);
        });
        chain.catch(err => {
            console.log("Problem removing incompatible hosts from the inventory: " + err);
        });
    }

    componentWillReceiveProps(props) {
        // pick up the state change from the parent
        const { hosts } = this.state.hosts;
        if (props.hosts != hosts) {
            // sort the hosts by name, then update our state
            var tempHosts = JSON.parse(JSON.stringify(props.hosts));
            tempHosts.sort(sortByKey('hostname'));
            this.setState({hosts: tempHosts});
        }
    }

    render() {
        console.log("rendering the validatepage");

        var spinner;
        var rows;
        if (this.state.hosts.length > 0) {
            rows = this.state.hosts.map(host => {
                return <HostDiscoveryRow
                            key={host.hostname}
                            hostData={host}
                            updateRole={this.updateRole}
                            callback={this.toggleSingleRow} />;
            });
        } else {
            rows = emptyRow();
        }

        if (!this.state.probeEnabled) {
            spinner = (
                <div className="modifier">
                    <div className="modifier spinner spinner-lg" >&nbsp;</div>
                    <ProbeStatus msg={this.state.probeStatusMsg} />
                </div>);
        } else {
            spinner = (<div style={{display: "inline-block", width: "40px"}} />);
        }

        return (

            <div id="validate" className={this.props.className} >
                <h3>Validate Host Selection</h3>
                The hosts have been checked for DNS and passwordless SSH.<br />The next step is to
                 probe the hosts to validate that their hardware configuration is compatible with
                 their intended Ceph role. Once the probe is complete you must select the hosts to
                 use for deployment using the checkboxes (<i>only hosts in an 'OK' state can be selected</i>)<br /><br />
                <GenericModal
                    show={this.state.modalVisible}
                    content={this.state.modalContent}
                    closeHandler={this.hideModal} />
                <div className="spacer" />
                <button className="btn btn-primary btn-lg btn-offset" disabled={!this.state.probeEnabled} onClick={this.probeHosts}>Probe</button>
                { spinner }
                <div className="divCenter">
                    <div className="separatorLine" />
                </div>
                <div className="divCenter">
                    <div>
                        <table className="roleTable" >
                            <thead>
                                <tr>
                                    <th className="tdSelector">
                                        <HostSelector
                                            name="*ALL*"
                                            selected={this.state.selectAll}
                                            callback={this.toggleAllRows} />
                                    </th>
                                    <th className="thHostname">Hostname</th>
                                    <th className="textCenter thRoleWidth">mon</th>
                                    <th className="textCenter thRoleWidth">mds</th>
                                    <th className="textCenter thRoleWidth">osd</th>
                                    <th className="textCenter thRoleWidth">rgw</th>
                                    <th className="textCenter thRoleWidth">iscsi</th>
                                    <th className="textCenter fact">CPU</th>
                                    <th className="textCenter fact">RAM</th>
                                    <th className="textCenter fact">NIC</th>
                                    <th className="textCenter fact">HDD</th>
                                    <th className="textCenter fact">SSD</th>
                                    <th className="textCenter capacity">Raw Capacity<br />(HDD/SSD)</th>
                                    <th className="leftAligned thHostInfo">Ready</th>
                                </tr>
                            </thead>
                            <tbody >
                                { rows }
                            </tbody>
                        </table>
                    </div>
                </div>
                <NextButton action={this.checkHostsReady} disabled={!this.state.ready} />
            </div>
        );
    }
}

class HostDiscoveryRow extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    toggleSelect = (event) => {
        console.log("toggle selection status for a row");
        this.props.callback(event);
    }

    changeRole = (role, checkedState) => {
        let host = this.props.hostData;
        console.log("updating the role for host " + host.hostname);
        this.props.updateRole(host.hostname, role, checkedState);
    }

    render () {
        var host = this.props.hostData;

        return (
            <tr>
                <td className="tdSelector" >
                    <HostSelector name={host.hostname} selected={host.selected} callback={this.toggleSelect} />
                </td>
                <td className="thHostname">
                    <div className="textInfo">
                        {host.hostname}
                        <span className="tooltipContent">{host.model}</span>
                    </div>
                </td>
                <td className="thRoleWidth">
                    <RoleCheckbox role="mon" checked={host.mon} callback={this.changeRole} />
                </td>
                <td className="thRoleWidth">
                    <RoleCheckbox role="mds" checked={host.mds} callback={this.changeRole} />
                </td>
                <td className="thRoleWidth">
                    <RoleCheckbox role="osd" checked={host.osd} callback={this.changeRole} />
                </td>
                <td className="thRoleWidth">
                    <RoleCheckbox role="rgw" checked={host.rgw} callback={this.changeRole} />
                </td>
                <td className="thRoleWidth">
                    <RoleCheckbox role="iscsi" checked={host.iscsi} callback={this.changeRole} />
                </td>
                <td className="fact" >{host.cpu}</td>
                <td className="fact" >{host.ram}</td>
                <td className="fact" >{host.nic}</td>
                <td className="fact" >{host.hdd}</td>
                <td className="fact" >{host.ssd}</td>
                <td className="capacity" >{host.capacity}</td>
                <td className="leftAligned thHostInfo" >
                    <HostStatus status={host.ready} msgs={host.msgs} />
                </td>
            </tr>
        );
    }
}

class HostStatus extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            msgClass: "hidden"
        };
    }

    toggleMsgs = () => {
        if (this.state.msgClass == 'hidden') {
            this.setState({msgClass: "visible"});
        } else {
            this.setState({msgClass: "hidden"});
        }
    }

    buildSummary = () => {
        var status = this.props.status;

        var msgSummary = msgCount(this.props.msgs);
        var msgTypes = Object.keys(msgSummary);
        var summary = msgTypes.map((mtype, i) => {
            return (<span key={i} className={mtype}><b>{msgSummary[mtype]}</b>&nbsp;{mtype}</span>);
        });
        if (msgTypes.length > 0) {
            return (<span className="clickable"><b>{status}</b>&nbsp;{ summary }</span>);
        } else {
            return (<span><b>{status}</b></span>);
        }
    }

    render () {
        var hostState = this.buildSummary();

        return (
            <div>
                <div onClick={this.toggleMsgs} >{ hostState }</div>
                <HostMsgs display={this.state.msgClass} msgs={this.props.msgs} />
            </div>
        );
    }
}

class HostMsgs extends React.Component {
    render() {
        let display = "scrollX " + this.props.display;

        var msgLines = this.props.msgs.map((m, i) => {
            var [mType, mDesc] = m.split(':');
            var highlight = "hiddenTable " + mType + "Text";
            return (
                <tr key={i} className="hiddenTable">
                    <td className={highlight}>{mType}</td>
                    <td>{mDesc}</td>
                </tr>

            );
        });
        return (
            <div className={ display }>
                <table className="hiddenTable">
                    <tbody className="hiddenTable">
                        { msgLines }
                    </tbody>
                </table>
            </div>
        );
    }
}

class HostSelector extends React.Component {
    render () {
        return (
            <input type="checkbox"
                name={this.props.name}
                checked={this.props.selected}
                onChange={this.props.callback} />
        );
    }
}

class ProbeStatus extends React.Component {
    render () {
        console.log("rendering probestatus message");
        return (
            <div className="modifier" >
                <small>{ this.props.msg }</small>
            </div>
        );
    }
}

export default ValidatePage;
