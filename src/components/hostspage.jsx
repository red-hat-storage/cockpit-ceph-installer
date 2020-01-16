import React from 'react';

import { UIButton } from './common/nextbutton.jsx';
import { Kebab } from './common/kebab.jsx';
import { RoleCheckbox } from './common/rolecheckbox.jsx';
import { emptyRow } from './common/emptyrow.jsx';
import { Notification } from './common/notifications.jsx';
import { GenericModal, WindowTitle } from './common/modal.jsx';
import { Tooltip } from './common/tooltip.jsx';
import { InfoBar } from './common/infobar.jsx';
import { decodeAddError } from '../services/errorHandlers.js';
/* eslint-disable */
import { addGroup, getGroups, addHost, deleteHost, deleteGroup } from '../services/apicalls.js';
import { buildRoles, removeItem, versionSupportsMetrics, convertRole, collocationOK, toggleHostRole, sortByKey, activeRoles, hostsWithRoleCount, getHost, copyToClipboard, hostsWithRole, activeRoleCount } from '../services/utils.js';
/* eslint-enable */
import '../app.scss';

export class HostsPage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            modalVisible: false,
            modalContent: '',
            modalTitle:'',
            hosts: [],
            ready: false,
            addHostsVisible: false,
            msgLevel: 'info',
            msgText: '',
            infoTip:"Enter the hostnames using either the hostname or a hostname pattern to " +
                    "define a range (e.g. node-[1-5] defines node-1,node-2,node-3 etc).",
            localChange: false
        };
        this.config = {};
        this.cache = {
            roles: []
        };
        // this.hostMaskInput = React.createRef();
    }

    nextAction = (event) => {
        let usable = true;
        let iscsiTargetCounts = [0, 2, 4];
        let errMsgs = [];

        if (versionSupportsMetrics(this.props.cephVersion)) {
            let metricsHost = '';
            for (let idx = 0; idx < this.state.hosts.length; idx++) {
                if (this.state.hosts[idx]['metrics']) {
                    metricsHost = this.state.hosts[idx]['hostname'];
                    break;
                }
            }
            if (metricsHost) {
                // pass the metrics host name back to the parent state
                // Note this will drive a state change/re-render to all sibling components
                this.props.metricsHostHandler(metricsHost);
            } else {
                this.updateLocalState({
                    msgLevel: 'error',
                    msgText: "To continue you must provide a host for metrics (grafana/prometheus)"
                });
                return;
            }
        }

        // console.log("Debug: we have these hosts: " + JSON.stringify(this.state.hosts));
        if (this.state.hosts.length > 0) {
            // we must have hosts to process before moving on to validation
            var hostOKCount = 0;
            this.state.hosts.forEach(host => {
                if (host.status == 'OK') {
                    hostOKCount++;
                }
            });
            if (hostOKCount != this.state.hosts.length) {
                errMsgs.push("All hosts must be in an 'OK' state to continue");
                console.debug("DEBUG: hosts are " + JSON.stringify(this.state.hosts));
            }
            console.debug("DEBUG hosts " + JSON.stringify(this.state.hosts));
            let monCount = hostsWithRoleCount(this.state.hosts, 'mon');
            let osdHostCount = hostsWithRoleCount(this.state.hosts, 'osd');
            let iscsiCount = hostsWithRoleCount(this.state.hosts, 'iscsi');
            console.debug("DEBUG : # iscsi hosts is " + iscsiCount);

            switch (true) {
            case (monCount === 0):
                errMsgs.push("You must have a MON role defined");
                break;
            case (monCount === 1 && this.props.clusterType.toLowerCase() === 'production'):
                errMsgs.push("You must have 3 or 5 MONs defined for a Production deployment");
                break;
            case (monCount % 2 == 0):
                errMsgs.push("You can't have an even number of MONs");
                break;
            }

            if (osdHostCount === 0) {
                errMsgs.push("OSD hosts are required");
            }

            if (!iscsiTargetCounts.includes(iscsiCount)) {
                errMsgs.push("iSCSI requires either " + iscsiTargetCounts.slice(1).join(' or ') + " hosts to provide path redundancy");
            }

            if (errMsgs.length > 0) {
                this.updateLocalState({
                    msgLevel: "error",
                    msgText: errMsgs.join('. ')
                });
                usable = false;
                // return;
            }

            if (usable) {
                this.updateLocalState({
                    msgLevel: "",
                    msgText: ""
                });
                this.props.action(this.state);
            }
        } else {
            this.updateLocalState({
                msgLevel: "error",
                msgText: "You need hosts in an OK state to continue"
            });
            console.log("You haven't got any hosts - can't continue");
        }
    }

    addHostsToTable = (stateObject) => {
        console.log("received mask information " + JSON.stringify(stateObject));
        this.updateLocalState({
            addHostsVisible: false
        });
        // before we do anything, we need to look at the mask to ensure that it will
        // resolve to new hosts. If not, this is a no-op.
        if (this.expandHosts(stateObject.hostmask).length == 0) {
            return;
        }

        // check selected groups are in the inventory
        var roleList = buildRoles([stateObject]);

        // if the user asks for a mon, they get a mgr collocated too
        if (roleList.includes('mons')) {
            console.log("adding mgrs to role list since we have a mon");
            roleList.push('mgrs');
        }

        var rolesString = roleList.join(',');

        // turn off the next button while the table is being built
        this.updateLocalState({
            ready: false
        });

        console.log("required ansible groups: " + rolesString);
        var ansibleRoles;
        var createGroups = [];

        getGroups()
                .done(resp => {
                    ansibleRoles = JSON.parse(resp)['data']['groups'];
                })
                .then(() => {
                    console.log("existing roles from runner-service: " + ansibleRoles);

                    for (let i = 0; i < roleList.length; i++) {
                        let groupName = roleList[i];
                        if (!ansibleRoles.includes(groupName)) {
                            // need to create a group
                            createGroups.push(addGroup(groupName));
                        }
                    }
                })
                .then(() => {
                    // wait for any create group requests to complete
                    Promise.all(createGroups)
                            .then(() => {
                                // Add the host entries to the table
                                var currentHosts = this.state.hosts;
                                let hostMask = stateObject.hostmask;
                                delete stateObject['hostmask'];
                                stateObject['status'] = "Unknown";
                                let newHosts = this.expandHosts(hostMask);
                                console.log("New hosts are " + newHosts.join(','));

                                var that = this;
                                var ctr = 0;
                                var hostStatus = 'Unknown';
                                var hostInfo = '';

                                // run the add hosts serially - avoids inventory update conflicts/retries
                                var sequence = Promise.resolve();
                                newHosts.forEach(function(hostName) {
                                    sequence = sequence.then(() => {
                                        return addHost(hostName, rolesString);
                                    }).then((resp) => {
                                        console.log(resp);
                                        let r = JSON.parse(resp);
                                        console.log("host is " + hostName);
                                        hostInfo = 'Connectivity verified, added to the inventory';
                                        hostStatus = r.status;
                                    })
                                            .catch((err) => {
                                                let result = decodeAddError(hostName, err);
                                                hostStatus = result.statusText;
                                                hostInfo = result.statusDescription;
                                            })
                                            .finally(() => {
                                                console.log("running code regardless of success/fail state");
                                                let newObject = JSON.parse(JSON.stringify(stateObject));

                                                newObject['hostname'] = hostName;
                                                newObject['cpu'] = '';
                                                newObject['ram'] = '';
                                                newObject['nic'] = '';
                                                newObject['hdd'] = '';
                                                newObject['ssd'] = '';
                                                newObject['capacity'] = '';
                                                newObject['status'] = hostStatus; // usable by ansible
                                                newObject['ready'] = ''; // valid for deployment
                                                newObject['info'] = hostInfo;
                                                newObject['msgs'] = [];
                                                newObject['vendor'] = '';
                                                newObject['model'] = 'Unknown';
                                                newObject['selected'] = false;
                                                that.config[hostName] = newObject;

                                                currentHosts.unshift(newObject); // always add to the start
                                                that.setState({hosts: currentHosts});
                                                that.props.updater({hosts: currentHosts});
                                                ctr++;
                                                if (ctr == newHosts.length) {
                                                    that.setState({ready: true});
                                                }
                                            });
                                });
                            })
                            .catch(err => {
                                console.error("create groups problem :" + err + ", " + err.message);
                                this.updateLocalState({
                                    msgLevel: 'error',
                                    msgText: "Unable to create ansible groups. Please check the ansible runner service log for more details"
                                });
                            });
                })
                .fail(error => {
                    console.error('Problem fetching group list: ' + error);
                    let errorMsg;
                    if (error.hasOwnProperty("status")) {
                        errorMsg = "Unexpected API response (" + error.status + ") : " + error.message;
                    } else {
                        errorMsg = "Unable to fetch ansible groups. Check that the ansible API service is running";
                    }

                    this.updateLocalState({
                        msgLevel: "error",
                        msgText: errorMsg
                    });
                });
    }

    retryHost = (hostName) => {
        // host already in the hosts array, so no need to check presence
        // get the roles from the existing entry
        var hostInfo, hostStatus;
        var currentHosts = this.state.hosts.slice(0);
        let ptr;
        for (let i = 0; i < currentHosts.length; i++) {
            if (currentHosts[i].hostname === hostName) {
                currentHosts[i].status = 'RETRY';
                ptr = i;
                break;
            }
        }

        // update the table to show the retry action, and turn of any old error messages
        this.updateLocalState({
            hosts: currentHosts,
            msgLevel: 'info',
            msgText: ''
        });

        var that = this;
        var roleList = buildRoles([currentHosts[ptr]]);
        if (roleList.includes('mons')) {
            console.log("adding mgrs to role list since we have a mon");
            roleList.push('mgrs');
        }

        addHost(hostName, roleList.join(','))
                .then((resp) => {
                    console.log("Add OK");
                    let r = JSON.parse(resp);
                    hostStatus = r.status;
                    hostInfo = 'Connectivity verified, added to the inventory';
                })
                .catch((err) => {
                    console.error("Unable to add host: " + JSON.stringify(err));
                    let result = decodeAddError(hostName, err);
                    hostStatus = result.statusText;
                    hostInfo = result.statusDescription;
                })
                .finally(() => {
                    console.log("tidy up");
                    currentHosts[ptr].info = hostInfo;
                    currentHosts[ptr].status = hostStatus;
                    that.updateLocalState({
                        hosts: currentHosts
                    });
                    that.config[hostName] = currentHosts[ptr];
                });
    }

    expandHosts (hostMask) {
        // return a list of hosts corresponding to the supplied hostmask
        let hosts = [];
        if (hostMask.includes('[')) {
            console.log("need to expand for a range");
            let rangeStr = hostMask.substring(
                hostMask.lastIndexOf("[") + 1,
                hostMask.lastIndexOf("]")
            );

            let rangeNum = rangeStr.split('-');
            let hostPrefix = hostMask.substring(0, hostMask.indexOf('['));

            for (let i = rangeNum[0]; i <= rangeNum[1]; i++) {
                hosts.push(hostPrefix + i);
            }
        } else {
            hosts.push(hostMask);
        }

        // check that we remove any hostnames that already exist (can't have dupes!)
        let currentHosts = Object.keys(this.config);
        console.log("config lookup is: " + JSON.stringify(currentHosts));
        let candidates = hosts.slice(0);
        let hostErrors = [];
        candidates.forEach((hostName) => {
            if (currentHosts.includes(hostName)) {
                // need to drop to avoid duplicate
                hostErrors.push(hostName);
                hosts = removeItem(hosts, hostName);
            }
        });
        if (hostErrors.length > 0) {
            let pfx = (hostErrors == 1) ? "Host" : "Hosts";
            let errorMsg = (
                <div>{ pfx } { hostErrors.join(',') } already defined. To add a role, simply update an existing entry</div>
            );
            this.showModal("Hostname Duplicate", errorMsg);
        }

        return hosts;
    }

    updateLocalState = (settings) => {
        settings.localChange = true;
        this.setState(settings);
    }

    updateHostsState = (updatedHosts) => {
        // update the host state to drive render update
        console.log("DEBUG ME: updating hosts state with " + JSON.stringify(updatedHosts));
        this.updateLocalState({
            hosts: updatedHosts,
            msgLevel: 'info',
            msgText: ''
        });
    }

    updateHost = (hostname, role, checked) => {
        console.log("updating the role state for " + hostname + " role " + role + " state of " + checked);
        var localState = this.state.hosts.slice(0);
        console.log("current hosts are: " + JSON.stringify(this.state.hosts));
        let hostObject = getHost(localState, hostname);

        if (checked) {
            // host role has been checked
            console.log("host is: " + JSON.stringify(hostObject));
            let currentRoles = buildRoles([hostObject]);
            if ((role == "metrics") && (hostsWithRoleCount(this.state.hosts, 'metrics') > 0)) {
                this.updateLocalState({
                    msgLevel: 'error',
                    msgText: "Only one host can hold the metrics role"
                });
                return;
            }
            if (!collocationOK(currentRoles, role, this.props.installType, this.props.clusterType)) {
                console.log("current hosts are: " + JSON.stringify(localState));
                this.updateLocalState({
                    msgLevel: 'error',
                    msgText: "Adding " + role + " role to " + hostname + " would violate supported collocation rules"
                });
                return;
            } else {
                // collocation is OK, but are there any other issues to look for?
                if ((role == 'metrics') && (hostsWithRoleCount(this.state.hosts, 'metrics') == 1)) {
                    this.updateLocalState({
                        msgLevel: 'error',
                        msgText: "Only one host may have the metrics role"
                    });
                    return;
                }
            }
        } else {
            // host role has been unchecked
            console.log("unchecking a role");
            if (activeRoleCount(hostObject) == 1) {
                this.updateLocalState({
                    msgLevel: 'error',
                    msgText: "Hosts must have at least one role. To remove the host, select 'Delete' from the action menu"
                });
                return;
            }
        }

        toggleHostRole(localState, this.updateHostsState, hostname, role, checked);
    }

    deleteHostEntry = (idx) => {
        console.log("deleting host entry id " + idx);
        var localState = JSON.parse(JSON.stringify(this.state.hosts));
        console.log("state looks like this " + JSON.stringify(localState));
        let hostname = localState[idx].hostname;
        console.log("deleting hostname " + hostname);
        // drop the entry
        localState.splice(idx, 1);
        delete this.config[hostname];

        if (localState.length == 0) {
            this.updateLocalState({
                ready: false
            });
        }

        this.updateLocalState({
            hosts: localState
        });
        this.props.updater({hosts: localState}); // update parents state
        console.log("deleting host resulted in hosts: " + JSON.stringify(localState));
    }

    deleteGroups = (groupsToRemove) => {
        console.log("We need to remove the following groups: " + groupsToRemove.join(',') + " - " + JSON.stringify(groupsToRemove));
        var delChain = Promise.resolve();
        groupsToRemove.forEach(group => delChain.then(() => deleteGroup(group)));
        delChain.catch(err => {
            console.error("Failed to remove group. Error: " + JSON.stringify(err));
        });
    }

    deleteHost = (hostname) => {
        // delete a host from the state
        console.log("You clicked to delete host - " + hostname);

        // turn off any old error messages
        this.updateLocalState({
            msgLevel: 'info',
            msgText: ''
        });

        var localState = JSON.parse(JSON.stringify(this.state.hosts));

        for (var idx in localState) {
            if (localState[idx].hostname == hostname) {
                // match found
                break;
            }
        }

        let hostRoles = activeRoles(localState[idx]);
        var groupsToRemove = [];
        for (let role of hostRoles) {
            if (hostsWithRoleCount(localState, role) == 1) {
                groupsToRemove.push(convertRole(role));
                if (role === 'mon') {
                    groupsToRemove.push(convertRole('mgr'));
                }
            }
        }

        if (localState[idx].status == 'OK') {
            // OK state means we've added the host to the inventory, so we need
            // to delete from the inventory AND the UI state
            deleteHost(hostname)
                    .then((resp) => {
                        this.deleteHostEntry(idx);
                    })
                    .catch((error) => {
                        console.error("Error " + error + " deleting " + hostname);
                    })
                    .finally(() => {
                        if (groupsToRemove.length > 0) {
                            this.deleteGroups(groupsToRemove);
                        }
                    });
        } else {
            // status was NOTOK, so the host is not in the inventory
            console.log("host index is " + idx);
            this.deleteHostEntry(idx);
        }
    }

    static getDerivedStateFromProps(props, state) {
        console.debug("DEBUG: hostspage props set to : " + JSON.stringify(props));
        if (state.localChange) {
            console.debug("DEBUG: hostspage local state change detected - bypassing any props update");
            return {
                localChange: false
            };
        }
        console.debug("DEBUG: hostspage update is NOT local - checking incoming props");
        if (JSON.stringify(props.hosts) != JSON.stringify(state.hosts)) {
            console.debug("DEBUG: old host state was " + JSON.stringify(state.hosts));
            let tempHosts = JSON.parse(JSON.stringify(props.hosts));
            tempHosts.sort(sortByKey('hostname'));
            return { hosts: tempHosts };
        } else {
            console.debug("DEBUG: hostspage prop -> state change but not local?");
            return null;
        }
    }

    hideModal = () => {
        this.updateLocalState({
            modalVisible: false,
            modalContent: "",
            modalTitle: ""
        });
    }

    showModal = (title, modalContent) => {
        // handle the show and hide of the app level modal
        console.log("content: ");
        console.log(modalContent);
        this.updateLocalState({
            modalVisible: true,
            modalTitle: title,
            modalContent: modalContent
        });
    }

    showAddHosts = () => {
        console.log("Show add hosts modal");
        this.updateLocalState({
            msgLevel: 'info',
            msgText: '',
            addHostsVisible: true
        });
        // this.hostMaskInput.current.focus();
    }

    hideAddHosts = () => {
        this.updateLocalState({
            addHostsVisible: false
        });
    }

    prevPageHandler = () => {
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
            var rows, metricsClass;
            metricsClass = versionSupportsMetrics(this.props.cephVersion) ? "textCenter thMetricsWidth visible-cell" : "hidden";

            if (this.state.hosts.length > 0) {
                console.log("DEBUG: hostspage is seeing " + JSON.stringify(this.state.hosts));
                rows = this.state.hosts.map(host => {
                    console.log("creating hostrow for " + host.hostname);
                    console.log("host atributes are " + JSON.stringify(host));
                    return <HostDataRow
                                key={host.hostname}
                                hostData={host}
                                roleChange={this.updateHost}
                                deleteRow={this.deleteHost}
                                retryHost={this.retryHost}
                                userName={this.props.userName}
                                cephVersion={this.props.cephVersion}
                                modal={this.showModal} />;
                });
            } else {
                rows = emptyRow();
            }

            return (
                <div id="hosts" className={this.props.className}>
                    <h3>2. Host Definition</h3>
                    <p>Hostnames or hostname masks can be used to assign roles to specific hosts. Click 'Add Hosts' to define
                     the hosts and roles. This process checks that the hosts can be reached, and the roles requested align to
                     best practice collocation rules. All hosts listed here, must be in an 'OK' state in order to continue. To
                     remove or retry connectivity to a host, use the row's action icon.</p>
                    <Notification ref="validationMessage" msgLevel={this.state.msgLevel} msgText={this.state.msgText} />
                    <GenericModal
                        show={this.state.modalVisible}
                        title={this.state.modalTitle}
                        content={this.state.modalContent}
                        closeHandler={this.hideModal} />
                    <HostMask
                        show={this.state.addHostsVisible}
                        hosts={this.state.hosts}
                        callback={this.addHostsToTable}
                        clusterType={this.props.clusterType}
                        cephVersion={this.props.cephVersion}
                        closeHandler={this.hideAddHosts}
                        installType={this.props.installType}
                        domainName={this.props.domainName} />
                    <div className="divCenter">
                        <div className="add-hosts-offset" >
                            <UIButton btnClass="display-block float-right btn btn-primary btn-lg" btnLabel="Add Host(s)" action={this.showAddHosts} />
                        </div>
                    </div>
                    <div className="divCenter">
                        <div className="host-container">
                            <table className="roleTable">
                                <thead>
                                    <tr>
                                        <th className="thHostname">Hostname</th>
                                        <th className="textCenter thRoleWidth">mon</th>
                                        <th className="textCenter thRoleWidth">mds</th>
                                        <th className="textCenter thRoleWidth">osd</th>
                                        <th className="textCenter thRoleWidth">rgw</th>
                                        <th className="textCenter thRoleWidth">iscsi</th>
                                        <th className={ metricsClass }>metrics</th>
                                        <th className="textCenter thStatusWidth">Status</th>
                                        <th className="leftAligned thHostInfo">Info</th>
                                        <th className="tdDeleteBtn" />
                                    </tr>
                                </thead>
                                <tbody>
                                    { rows }
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="nav-button-container">
                        <UIButton primary disabled={!this.state.ready} btnLabel="Validate &rsaquo;" action={this.nextAction} />
                        <UIButton btnLabel="&lsaquo; Back" action={this.prevPageHandler} />
                        <InfoBar
                            info={this.state.infoTip || ''} />
                    </div>
                </div>
            );
        } else {
            console.log("Skipping render of hostspage - not active");
            return (<div id="hosts" className={this.props.className} />);
        }
    }
}

class HostDataRow extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            host: null,
            actions: []
        };
        this.actions = [];
    }

    hostRoleChange = (role, checked) => {
        console.log("Requested to changing the role state of " + role + " " + checked + " within a table row");
        console.log("for host " + this.state.host.hostname);
        this.props.roleChange(this.state.host.hostname, role, checked);
    }

    colorify = (text) => {
        if (this.state.host.status == 'OK') {
            return (<span>{text}</span>);
        } else {
            return (<span className="criticalText">{text}</span>);
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        let newState = {
            actions: [
                {
                    action: "Delete",
                    callback: nextProps.deleteRow
                }
            ]
        };

        if (JSON.stringify(nextProps.hostData) != JSON.stringify(prevState.host)) {
            newState['host'] = nextProps.hostData;
        }

        if (nextProps.hostData.status === 'NOTOK') {
            newState['actions'].push({
                action: "Retry",
                callback: nextProps.retryHost
            });
        }
        return newState;
    }

    dummy = () => {
        console.log("Dummy function for a retry request");
    }

    render() {
        let metricsClass = versionSupportsMetrics(this.props.cephVersion) ? "thMetricsWidth visible-cell" : "hidden";
        console.log("render hostrow for " + this.state.host.hostname);
        return (
            <tr>
                <td className="thHostname" >
                    { this.colorify(this.state.host.hostname) }
                </td>
                <td className="thRoleWidth">
                    <RoleCheckbox role="mon" checked={this.state.host.mon} callback={this.hostRoleChange} />
                </td>
                <td className="thRoleWidth">
                    <RoleCheckbox role="mds" checked={this.state.host.mds} callback={this.hostRoleChange} />
                </td>
                <td className="thRoleWidth">
                    <RoleCheckbox role="osd" checked={this.state.host.osd} callback={this.hostRoleChange} />
                </td>
                <td className="thRoleWidth">
                    <RoleCheckbox role="rgw" checked={this.state.host.rgw} callback={this.hostRoleChange} />
                </td>
                <td className="thRoleWidth">
                    <RoleCheckbox role="iscsi" checked={this.state.host.iscsi} callback={this.hostRoleChange} />
                </td>
                <td className={ metricsClass }>
                    <RoleCheckbox role="metrics" checked={this.state.host.metrics} callback={this.hostRoleChange} />
                </td>
                <td className="textCenter hostStatusCell">
                    { this.colorify(this.state.host.status) }
                </td>
                <td className="tdHostInfo">
                    <HostInfo
                        hostname={this.state.host.hostname}
                        info={this.state.host.info}
                        userName={this.props.userName}
                        modal={this.props.modal} />
                </td>
                <td className="tdDeleteBtn">
                    <Kebab value={this.state.host.hostname} actions={this.state.actions} />
                </td>
            </tr>
        );
    }
}

class HostInputMask extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            valid: true,
            class: 'textinput textinput-nofocus'
        };
        // this.hostInput = React.createRef();
    }

    validateMaskHandler = (event) => {
        console.log("need to validate " + event.target.value);
        const hostRegex = /^[a-zA-Z0-9-]+((\[\d+-\d+\]){0,})$/g;

        let text = event.target.value;
        let isValid = false;
        if (text.match(hostRegex)) {
            if (!this.state.valid) {
                isValid = true;

                this.setState({
                    valid: true,
                    class:'textinput'
                });
            } else {
                isValid = true;

                this.setState({
                    valid: true,
                    class:'textinput'
                });
            }

            if (text.includes('[')) {
                let rangeStr = text.substring(
                    text.lastIndexOf("[") + 1,
                    text.lastIndexOf("]")
                );

                let rangeNum = rangeStr.split('-');
                if (rangeNum[0] >= rangeNum[1]) {
                    // invalid numeric range in the hostmask
                    isValid = false;
                    console.log("host mask contains a range, where the first value is > then second");

                    this.setState({
                        valid: false,
                        class: 'textinput textinput-error'
                    });
                }
            }
            console.log("host pattern ok" + text);
        } else {
            console.log("no match with " + text);
            isValid = false;

            this.setState({
                valid: false,
                class: 'textinput textinput-error'
            });
            console.log('invalid hostname pattern');
        }
        console.log("pattern in callback is ok?" + isValid);
        this.props.callback(text, isValid); /* update the hostmask property of the parent */
    }

    componentDidUpdate(prevProps, prevState) {
        console.log("hostmask input component update");
        if (!prevProps.visible) {
            this.refs.hostInputField.focus();
            console.log("with props " + JSON.stringify(prevProps));
        }
    }

    render () {
        return (
            <div style={{display: "inline-block"}}>
                <input type="text" id="hostMask" rows="1"
                ref="hostInputField"
                autoFocus
                className={this.state.class}
                value={this.props.content}
                onChange={this.validateMaskHandler} />
            </div>
        );
    }
}

class HostMask extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            mon: false,
            mds: false,
            osd: false,
            rgw: false,
            iscsi: false,
            metrics: false,
            hostmask: '',
            hostmaskOK: false,
            msgLevel: 'info',
            msgText: ''
        };

        this.helpText = {
            "roles": "A Ceph cluster consists of multiple daemons, each performing\na specific role. Hover over the 'info' icon against each role\nto learn more.",
            "mon": "Monitor nodes provide control functionality to the cluster including\nmonitoring, host membership, configuration and state.3 mons are\nrequired for production use cases",
            "mds": "This is the metadata server that provides a scale-out, distributed\n filesystem",
            "osd": "Each disk within the cluster is managed by an Object Storage Daemon.\nTo install you must assign the OSD role to one or more hosts that have\nfree disks",
            "metrics": "The 'metrics' role uses Grafana and Prometheus to provide near\nreal-time performance insights. Grafana dashboards are integrated\ninto the Ceph Dashboard UI to provide monitoring and alerting",
            "iscsi": "iSCSI connectivity is supported with gateway hosts. For high\nIOPS iSCSI environments, consider using dedicated hosts\nfor the iSCSI role",
            "rgw": "The RADOS gateway daemon provides an AWS S3 compatible object\nstorage interface"
        };
    }

    reset = () => {
        console.log("resetting the mask");
        this.setState({
            mon: false,
            mds: false,
            osd: false,
            rgw: false,
            iscsi: false,
            metrics: false,
            hostmask: '',
            hostmaskOK: false,
            msgLevel: 'info',
            msgText: ''
        });
    }

    updateRole = (roleName, checkedState) => {
        console.log("Request to update " + roleName + " mask to " + checkedState);
        if (checkedState) {
            console.log("need to check collocation rules");
            let roles = ['mon', 'mds', 'osd', 'rgw', 'iscsi', 'metrics'];
            let currentRoles = [];

            roles.forEach(role => {
                if (this.state[role]) {
                    currentRoles.push(convertRole(role));
                }
            });
            console.log("current roles from mask are " + currentRoles);
            if (!collocationOK(currentRoles, roleName, this.props.installType, this.props.clusterType)) {
                console.log("invalid roles - violates collocation rules");
                this.setState({
                    msgLevel: 'error',
                    msgText: 'Collocation of ' + currentRoles.join(', ') + " with " + roleName + " is not allowed."
                });
                return;
            } else {
                if (roleName == 'metrics') {
                    // check that the hostname is explicit
                    console.log("check that the hostname " + this.state.hostmask + " is explicit");
                    if ((this.state.hostmask.includes('[')) || (this.state.hostmask.includes("]"))) {
                        this.setState({
                            msgLevel: 'error',
                            msgText: "A metrics role can only be applied to a single host, a range is not supported"
                        });
                        return;
                    }
                    console.log("check that the metrics role hasn't already been selected");
                    if (hostsWithRoleCount(this.props.hosts, roleName) > 0) {
                        this.setState({
                            msgLevel: 'error',
                            msgText: "A metrics role has already been selected"
                        });
                        return;
                    }
                }
                // turn off any prior error message
                this.setState({
                    msgLevel: 'info',
                    msgText: ''
                });
            }
        }

        this.setState({[roleName]: checkedState});
    }

    updateHost = (mask, isValid) => {
        console.log("updating hostname mask info " + mask + "state of " + isValid);
        this.setState({
            hostmask: mask,
            hostmaskOK: isValid
        });
    }

    checkMaskValid = () => {
        // let i = this.props.installType;
        console.log("type of install " + this.props.installType);
        console.log("state is :" + JSON.stringify(this.state));
        console.log("check the mask info is usable to populate the table");
        // check that at least one role is selected and we have a hostmask
        if (!this.state.hostmaskOK) {
            console.log("hostname is invalid");
            this.setState({
                msgLevel: "error",
                msgText:"Invalid hostname/mask. Use aplhanumeric, '-' characters. A numeric range suffix uses the syntax [x-y]"
            });
            return;
        }
        if (!this.state.hostmask) {
            console.log("clicked add, but the hostmask is invalid/empty");
            this.setState({
                msgLevel: 'info',
                msgText: "You must provide a hostname/mask"
            });
            return;
        }

        let flags = ['mon', 'mds', 'osd', 'rgw', 'iscsi', 'metrics'];

        let rolesSelected = false;

        for (var property in this.state) {
            // skip other properties
            if (!(flags.includes(property))) {
                continue;
            }
            if (this.state[property]) {
                console.log("at least one role is selected");
                rolesSelected = true;
                break;
            }
        }
        if (rolesSelected) {
            console.log("Ok to expand and populate the table");
            this.reset();
            this.props.callback(this.state);
        } else {
            this.setState({
                msgLevel: 'error',
                msgText: "At least one role is required"
            });
            console.log("Need to specify at least one role per hostname mask");
        }
    }

    closeHandler = () => {
        this.reset();
        this.props.closeHandler();
    }

    render() {
        let showHideClass = this.props.show ? 'modal display-block' : 'modal display-none';
        let metrics_cbox = (<td />);
        let metrics_label = (<td />);
        if (versionSupportsMetrics(this.props.cephVersion)) {
            console.log("enabling selection of metrics role - grafana/prometheus");
            metrics_cbox = (
                <td>
                    <RoleCheckbox role='metrics' checked={this.state.metrics} callback={this.updateRole} />
                </td>);
            metrics_label = (<td style={{minWidth: "60px"}}>Metrics<Tooltip text={this.helpText.metrics} /></td>);
        }

        return (
            <div className={showHideClass}>
                <div className="hostMask modal-main">
                    <WindowTitle title="Add Hosts" closeHandler={this.closeHandler} />
                    <div className="modal-inner">
                        Hosts may be added by hostname or a mask. Select the Ceph roles that should be applied
                        to the new hosts.<p>&nbsp;</p>
                        <div>
                            <div className="display-inline-block sel-label-vertical"><b>Hostname/Mask</b></div>
                            <div className="display-inline-block">
                                <HostInputMask ref="hostInput" callback={this.updateHost} content={this.state.hostmask} visible={this.props.show} />
                            </div>
                            <div className="display-inline-block">
                                <span>&nbsp;&nbsp;.</span>{this.props.domainName}
                            </div>
                        </div>
                        <div className="add-hosts-container" style={{marginTop:"15px"}}>
                            <div className="display-inline-block sel-label-vertical">
                                <b>Roles</b>
                                <Tooltip text={this.helpText.roles} />
                            </div>
                            <div style={{display:"inline-flex"}}>

                                <div className="display-inline-block">
                                    <table id="add-hosts" >
                                        <tbody>
                                            <tr>
                                                <td>
                                                    <RoleCheckbox role='mon' checked={this.state.mon} callback={this.updateRole} />
                                                </td>
                                                <td style={{minWidth: "60px"}}>MON<Tooltip text={this.helpText.mon} /></td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <RoleCheckbox role='mds' checked={this.state.mds} callback={this.updateRole} />
                                                </td>
                                                <td style={{minWidth: "60px"}}>MDS<Tooltip text={this.helpText.mds} /></td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <RoleCheckbox role='osd' checked={this.state.osd} callback={this.updateRole} />
                                                </td>
                                                <td style={{minWidth: "60px"}}>OSD<Tooltip text={this.helpText.osd} /></td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <RoleCheckbox role='rgw' checked={this.state.rgw} callback={this.updateRole} />
                                                </td>
                                                <td style={{minWidth: "60px"}}>RGW<Tooltip text={this.helpText.rgw} /></td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <RoleCheckbox role='iscsi' checked={this.state.iscsi} callback={this.updateRole} />
                                                </td>
                                                <td style={{minWidth: "60px"}}>iSCSI<Tooltip text={this.helpText.iscsi} /></td>
                                            </tr>
                                            <tr>
                                                { metrics_cbox }
                                                { metrics_label }
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        <Notification msgLevel={this.state.msgLevel} msgText={this.state.msgText} />
                        <div className="add-hosts-buttons">
                            <UIButton
                                btnClass="nav-button btn btn-primary btn-lg"
                                action={this.checkMaskValid}
                                btnLabel="Add" />
                            <UIButton
                                btnClass="nav-button btn btn-lg"
                                action={this.closeHandler}
                                btnLabel="Cancel" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export class HostInfo extends React.Component {
    // clipboardCopy = () => {
    //     let errorText;
    //     errorText = this.props.hostname + " failed in role '";
    //     errorText += this.props.errorEvent['role'] + "', task '";
    //     errorText += this.props.errorEvent['task'] + "'. Error msg - ";
    //     errorText += this.props.errorEvent['res']['msg'];
    //     copyToClipboard(errorText);
    // }

    render () {
        var helper = (<div />);

        if (this.props.info.startsWith('SSH Auth')) {
            let fixMe = "ssh-copy-id -f -i /usr/share/ansible-runner-service/env/ssh_key.pub " +
                        this.props.userName + "@" + this.props.hostname;
            if (this.props.userName != "root") {
                // non-root users must use sudo to access the ssh_key files
                fixMe = "sudo " + fixMe;
            }

            let helperMsg = (
                <div>
                    You need to copy the ssh public key from this host to {this.props.hostname}, and
                    ensure the user '{this.props.userName}' is configured for passwordless SUDO.<br />
                    e.g.<br />
                    <pre className="display-inline-block">
                        { fixMe }
                    </pre>
                    <button className="btn fa fa-clipboard clippy" onClick={() => { copyToClipboard(fixMe) }} />
                </div>
            );
            helper = (
                <a className="pficon-help" onClick={(e) => { this.props.modal("SSH Authentication Error", helperMsg) }} />
            );
        }

        return (
            <div>
                <span className="leftAligned">{this.props.info} &nbsp;</span>
                { helper }
            </div>
        );
    }
}

export default HostsPage;
