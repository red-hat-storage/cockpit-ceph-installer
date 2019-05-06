import React from 'react';
import { UIButton } from './common/nextbutton.jsx';
import { Notification } from './common/notifications.jsx';
import { RoleCheckbox } from './common/rolecheckbox.jsx';
import { Arrow } from './common/arrow.jsx';

import {
    toggleHostRole,
    allRoles,
    buildRoles,
    checkPlaybook,
    countNICs,
    msgCount,
    sortByKey,
    collocationOK,
    getHost,
    hostsWithRoleCount,
    commonSubnets,
    osdCount} from '../services/utils.js';

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
            probeStatusMsg: '',
            msgLevel: 'info',
            msgText: ''
        };
        this.probeSummary = '';
        this.roleSummary = '';
        this.eventLookup = {}; // lookup for probe results
        this.skipChecks = false;
        this.playUUID = '';
    }

    processEventData = (eventData) => {
        console.log("processing event data for " + eventData.remote_addr);
        let eventHostname = eventData.remote_addr;
        let localState = JSON.parse(JSON.stringify(this.state.hosts));
        let probeTotal = localState.length - hostsWithRoleCount(localState, 'metrics');
        if (!eventData.res.hasOwnProperty('data')) {
            console.log("Skipping " + eventHostname + ", no data returned");
        } else {
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
            if (eventData.res.data.status.toLowerCase() == 'ok') {
                obj['selected'] = true;
            }
            obj['msgs'] = eventData.res.data.status_msgs;

            obj['nic'] = countNICs(facts);

            for (let i = 0; i < localState.length; i++) {
                let host = localState[i];
                if (host.hostname == eventHostname) {
                    console.log("updating state");
                    Object.assign(host, obj);
                    localState[i] = host;
                    let currentCount = this.state.probedCount + 1;
                    let level = (currentCount === probeTotal) ? "success" : "active";

                    this.setState({
                        hosts: localState,
                        probedCount: currentCount,
                        msgLevel: level,
                        msgText: currentCount + "/" + probeTotal + " probes complete",
                        probeStatusMsg: currentCount + "/" + probeTotal + " probes complete"
                    });
                    console.log("updating notification message " + currentCount);
                    break;
                }
            }

            this.roleSummary = JSON.stringify(allRoles(this.state.hosts));
        }
        // this.probeSummary = JSON.stringify(this.state.hosts);
    }

    updateProbeStatus = (response, playUUID) => {
        console.log("Update after a probe iteration");
        console.log("events are :" + JSON.stringify(response));
        let eventData = response.data.events;
        let eventIDs = Object.keys(eventData);
        let eventCount = eventIDs.length;
        let hostCount = this.state.hosts.length;

        console.log("Progress " + eventCount + "/" + hostCount);
        eventIDs.forEach((eventID, idx, ary) => {
            if (this.eventLookup.hasOwnProperty(eventID)) {
                console.log("skipping " + eventID + " already seen it!");
            } else {
                this.eventLookup[eventID] = "";
                console.log("processing " + eventID);
                // this.refs.validationMessage.forceUpdateHandler();
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

    probeComplete = (playbookStatus) => {
        console.log("probe playbook complete : " + playbookStatus);
        if (playbookStatus == 'failed') {
            this.setState({
                msgLevel: 'error',
                msgText: "Unexpected playbook failure. Check ansible-runner-service directory '" + this.playUUID + "' for details.",
                probeEnabled: true,
                pendingProbe: true,
                ready: false,
                probeStatusMsg: ''
            });
        } else {
            this.setState({
                probeEnabled: true,
                ready: true,
                probeStatusMsg: ''
            });
        }
        this.eventLookup = {};
    }

    probeHosts = () => {
        console.log("Request to probe hosts received");
        let probeTotal = this.state.hosts.length - hostsWithRoleCount(this.state.hosts, 'metrics');
        this.setState({
            probeEnabled: false,
            pendingProbe: false,
            ready: false,
            probedCount: 0,
            msgLevel: 'active',
            msgText: "0/" + probeTotal + " probes complete",
            probeStatusMsg: "0/" + probeTotal + " probes complete"
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
            // ignore the metrics host for the probe
            if (!host.metrics) {
                rolesByHost[host.hostname] = buildRoles([host]).join(',');
            }
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
                    this.playUUID = response.data.play_uuid;
                    console.log("tracking playbook with UUID :" + this.playUUID);

                    console.log("starting progress tracker");
                    checkPlaybook(this.playUUID, this.props.svctoken, this.updateProbeStatus, this.probeComplete);
                })
                .catch((e) => {
                    let errorMsg;
                    console.error("Problem starting the playbook: response was - " + JSON.stringify(e));
                    if (e.hasOwnProperty('status')) {
                        // API returned a bad state
                        switch (e.status) {
                        case 404:
                            errorMsg = "checkrole.yml file is missing. Install the file, then retry";
                            break;
                        default:
                            errorMsg = "Error response from API service (" + e.status + "). Check API service log for more information";
                        }
                    } else {
                        // no status attribute = API was not there.
                        errorMsg = "Ansible service API unavailable. Try again after starting the service";
                    }
                    this.setState({
                        probeEnabled: true,
                        pendingProbe: true,
                        msgLevel: 'error',
                        msgText: errorMsg
                    });
                });

        this.setState({
            selectAll: false
        });
    }

    updateState = (updatedHosts) => {
        console.log("updating state with " + JSON.stringify(updatedHosts));
        this.setState({
            hosts: updatedHosts,
            pendingProbe: true,
            ready: false
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
                this.setState({
                    msgLevel: "error",
                    msgText: "Adding " + role + " role to " + hostname + " would violate supported collocation rules"
                });
                return;
            } else {
                console.log("collocation is OK");
            }
        }

        toggleHostRole(localState, this.updateState, hostname, role, checked, svctoken);
    }

    hostOK (host) {
        return (['OK'].includes(host.ready));
    }

    toggleAllRows = (event) => {
        if (!this.state.ready) {
            this.setState({
                msgLevel: 'error',
                msgText: "You can't select 'ALL' hosts until a probe has been performed"
            });
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
            this.setState({
                msgLevel: 'error',
                msgText: "There aren't any usable hosts. All hosts have errors or warnings related to them"
            });
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
                    this.setState({
                        msgLevel: 'error',
                        msgText: "Only hosts with a status of 'OK' can be selected"
                    });
                }
                break;
            }
        }
    }

    checkHostsReady = () => {
        // Need to have more than 3 hosts in a selected state
        // all selected hosts must have a status of OK
        let minimum = {
            osdHosts: {
                "Production": 3,
                "Development/POC": 1
            },
            osdCount: {
                "Production": 3,
                "Development/POC": 1
            },
            iscsiCount: {
                "Production": [0, 2, 4],
                "Development/POC": [0, 2]
            },
            mons: {
                "Production": [3, 5, 7],
                "Development/POC": [1, 3]
            },
            clusterSize: {
                "Production": 3,
                "Development/POC": 1
            }
        };

        let candidateHosts = [];
        let hostsToDelete = [];
        if (JSON.stringify(allRoles(this.state.hosts)) != this.roleSummary) {
            console.log("clicked next, but role changes detected since last probe");
            this.setState({
                msgLevel: 'warning',
                msgText: "You have made role changes, so a further probe is required."
            });

            return;
        }

        if (this.skipChecks) {
            console.log("all checks bypassed");
            let hosts = { hosts: JSON.parse(JSON.stringify(this.state.hosts)) };
            this.props.action(hosts);
            return;
        }

        for (let i = 0; i < this.state.hosts.length; i++) {
            if ((this.state.hosts[i].selected) || (this.state.hosts[i]['metrics'])) {
                candidateHosts.push(JSON.parse(JSON.stringify(this.state.hosts[i])));
            } else {
                hostsToDelete.push(this.state.hosts[i].hostname);
            }
        }

        if (candidateHosts.length < minimum.clusterSize[this.props.clusterType]) {
            this.setState({
                msgLevel: 'error',
                msgText: "To proceed you need to select at least " + minimum.clusterSize[this.props.clusterType] + " hosts in an 'OK' state"
            });
            return;
        }

        // perform some pre-req checks for a production like deployment
        let validMonCounts = minimum.mons[this.props.clusterType]; // array
        if (!validMonCounts.includes(hostsWithRoleCount(candidateHosts, 'mon'))) {
            this.setState({
                msgLevel: 'error',
                msgText: "You need " + validMonCounts.join(' or ') + " mons to continue"
            });
            return;
        }

        // check we have a minimum number of osd hosts
        if (hostsWithRoleCount(candidateHosts, 'osd') < minimum.osdHosts[this.props.clusterType]) {
            this.setState({
                msgLevel: 'error',
                msgText: "You need at least " + minimum.osdHosts[this.props.clusterType] + " OSD hosts to continue"
            });
            return;
        }

        // check for iscsi restrictions
        let validISCSITargets = minimum.iscsiCount[this.props.clusterType]; // array
        if (!validISCSITargets.includes(hostsWithRoleCount(candidateHosts, 'iscsi'))) {
            this.setState({
                msgLevel: 'error',
                msgText: "You need " + validISCSITargets.slice(1).join(' or ') + " hosts as iSCSI targets to continue"
            });
            return;
        }

        // the hosts provided must have a common subnet
        if (commonSubnets(candidateHosts, 'all').length == 0) {
            this.setState({
                msgLevel: 'error',
                msgText: "Ceph requires at least one common subnet across all hosts"
            });
            return;
        }

        if (osdCount(candidateHosts, this.props.flashUsage) < minimum.osdCount[this.props.clusterType]) {
            this.setState({
                msgLevel: 'error',
                msgText: "Ceph requires at least " + minimum.osdCount[this.props.clusterType] + " OSD(s) to store data"
            });
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

    prevPageHandler = () => {
        // reset any prior messages held by the 'page'
        this.setState({
            msgLevel: "info",
            msgText: "",
            ready: false,
            probeEnabled: true,
            pendingProbe: true
        });

        if (this.state.hosts) {
            // pass back the current hosts to the parent
            console.log("sending host state back to parent");
            let savedHostState = {
                hosts: this.state.hosts
            };

            this.props.prevPage(savedHostState);
        } else {
            console.log('Passing back to parent, no hosts to save');
            this.props.prevPage();
        }
    }

    render() {
        if (this.props.className == 'page') {
            console.log("rendering the validatepage");

            // var spinner;
            var rows;
            var probeButtonClass;
            var nextButtonClass;
            if (this.state.hosts.length > 0) {
                rows = this.state.hosts.map(host => {
                    // only show ceph nodes, ignoring the metrics host
                    if (!host.metrics) {
                        return <HostDiscoveryRow
                            key={host.hostname}
                            hostData={host}
                            updateRole={this.updateRole}
                            callback={this.toggleSingleRow} />;
                    }
                });
            } else {
                rows = (<tbody />); // emptyRow();
            }

            probeButtonClass = (this.state.pendingProbe) ? "nav-button btn btn-primary btn-lg" : "nav-button btn btn-lg";
            nextButtonClass = (this.state.ready) ? "nav-button btn btn-primary btn-lg" : "nav-button btn btn-lg";
            return (
                <div id="validate" className={this.props.className} >
                    <h3>3. Validate Host Selection</h3>
                    The hosts have been checked for DNS and passwordless SSH.<br />The next step is to
                    probe the hosts that Ceph will use to validate that their hardware configuration is compatible with
                    their intended Ceph role. Once the probe is complete you must select the hosts to
                    use for deployment using the checkboxes (<i>only hosts in an 'OK' state can be selected</i>)<br /><br />
                    <Notification ref="validationMessage" msgLevel={this.state.msgLevel} msgText={this.state.msgText} />
                    <div className="divCenter">
                        <div>
                            <div className="proby">
                                <table id="probe-headings" className="probe-headings">
                                    <thead>
                                        <tr>
                                            <th className="tdSelector">
                                                <div className="arrow-dummy" />
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
                                            <th className="leftAligned thHostInfo">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody />
                                </table>
                            </div>
                            <div className="probe-container">
                                <table id="probe-table" className="probe-table" >
                                    {rows}
                                </table>
                            </div>
                        </div>
                    </div>
                    <div className="nav-button-container">
                        <UIButton btnClass={ nextButtonClass } disabled={!this.state.ready} btnLabel="Network &rsaquo;" action={this.checkHostsReady} />
                        <UIButton btnClass={ probeButtonClass } disabled={!this.state.probeEnabled} btnLabel="Probe Hosts" action={this.probeHosts} />
                        <UIButton btnLabel="&lsaquo; Back" disabled={!this.state.probeEnabled} action={this.prevPageHandler} />
                    </div>
                </div>
            );
        } else {
            console.log("Skipping render of validatepage - not active");
            return (<div id="validate" className={this.props.className} />);
        }
    }
}

class HostDiscoveryRow extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            msgClass: 'hidden'
        };
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

    rowGroupHandler = () => {
        console.log("change the state of the msg row");
        if (this.state.msgClass === 'hidden') {
            this.setState({msgClass: "visible"});
        } else {
            this.setState({msgClass: "hidden"});
        }
    }

    render () {
        var host = this.props.hostData;
        var probeMsgs = "full-width " + this.state.msgClass;
        let rowExpansion;

        if (host.msgs.length > 0) {
            rowExpansion = (
                <Arrow clickHandler={this.rowGroupHandler} />
            );
        } else {
            rowExpansion = (
                <div className="arrow-dummy" />
            );
        }

        return (
            <tbody>
                <tr>
                    <td className="tdSelector" >
                        { rowExpansion }
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
                <tr className={ probeMsgs }>
                    <HostMsgs msgs={host.msgs} />
                </tr>
            </tbody>
        );
    }
}

class HostStatus extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            // msgClass: "hidden"
        };
    }

    buildSummary = () => {
        var status = this.props.status;

        var msgSummary = msgCount(this.props.msgs);
        var msgTypes = Object.keys(msgSummary);
        var summary = msgTypes.map((mtype, i) => {
            let classes = "status-msg " + mtype;
            let mtypeText = (msgSummary[mtype] > 1) ? mtype + "s" : mtype;
            return (<span key={i} className={classes}><b>{msgSummary[mtype]}</b>&nbsp;{mtypeText}</span>);
        });
        if (msgTypes.length > 0) {
            return (<span><b>{status}</b>&nbsp;{ summary }</span>);
        } else {
            return (<span><b>{status}</b></span>);
        }
    }

    render () {
        var hostState = this.buildSummary();

        return (
            <div>
                <div>{ hostState }</div>
            </div>
        );
    }
}

class HostMsgs extends React.Component {
    render() {
        var msgLines = this.props.msgs.map((m, i) => {
            var [mType, mDesc] = m.split(':');
            var highlight = "display-inline-block hiddenTable " + mType + "Text bold-text probe-result";
            return (
                <div key={i} className="probe-detail">
                    <span className={highlight}>{mType}</span>
                    <span>{mDesc}</span>
                </div>
            );
        });
        return (
            <td colSpan="14" className="full-width display-inline-block" >
                {msgLines}
            </td>
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

export default ValidatePage;
