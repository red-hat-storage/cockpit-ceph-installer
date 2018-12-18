import React from 'react';

import { NextButton } from './common/nextbutton.jsx';
import { RoleCheckbox } from './common/rolecheckbox.jsx';
import { emptyRow } from './common/emptyrow.jsx';
import { GenericModal } from './common/modal.jsx';
/* eslint-disable */
import { addGroup, getGroups, addHost, deleteHost, changeHost, deleteGroup } from '../services/apicalls.js';
import { buildRoles, removeItem, convertRole, collocationOK, toggleHostRole, sortByKey, activeRoles, hostsWithRoleCount, getHost } from '../services/utils.js';
/* eslint-enable */
import '../app.scss';

export class HostsPage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            modalVisible: false,
            modalContent: '',
            hosts: [],
            ready: false
        };
        this.config = {};
        this.cache = {
            roles: []
        };
    }

    // TODO: need to consider the hosts as a json object key=hostname to cut down on
    // screen updates?

    nextAction = (event) => {
        if (this.state.hosts.length > 0) {
            // we must have hosts to process before moving on to validation
            var hostOKCount = 0;
            this.state.hosts.forEach(host => {
                if (host.status == 'OK') {
                    hostOKCount++;
                }
            });
            if (hostOKCount != this.state.hosts.length) {
                let errorMsg = (
                    <div>Can't continue with {this.state.hosts.length - hostOKCount} host(s) in a 'NOTOK' state</div>
                );
                this.showModal(errorMsg);
                return;
            }

            console.log("TODO: check we have minimum config size of mons and osds");
            let usable = true;

            if (usable) {
                this.props.action(this.state);
            }
        } else {
            console.log("You haven't got any hosts - can't continue");
        }
    }

    addHostsToTable = (stateObject) => {
        console.log("received mask information " + JSON.stringify(stateObject));

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
        this.setState({ready: false});

        console.log("required ansible groups: " + rolesString);
        var tokenString = this.props.svctoken;
        var ansibleRoles;
        var createGroups = [];

        getGroups(this.props.svctoken)
                .done(resp => {
                    ansibleRoles = JSON.parse(resp)['data']['groups'];
                })
                .then(() => {
                    console.log("existing roles from runner-service: " + ansibleRoles);

                    for (let i = 0; i < roleList.length; i++) {
                        let groupName = roleList[i];
                        if (!ansibleRoles.includes(groupName)) {
                            // need to create a group
                            createGroups.push(addGroup(groupName, tokenString));
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
                                var modalMsg;

                                // run the add hosts serially - avoids inventory update conflicts/retries
                                var sequence = Promise.resolve();
                                newHosts.forEach(function(hostName) {
                                    sequence = sequence.then(() => {
                                        return addHost(hostName, rolesString, tokenString);
                                    }).then((resp) => {
                                        console.log(resp);
                                        let r = JSON.parse(resp);
                                        console.log("host is " + hostName);
                                        hostInfo = '';
                                        hostStatus = r.status;
                                    })
                                            .catch((err) => {
                                                switch (err.status) {
                                                case 401:
                                                    console.log("SSH key problem with " + hostName);
                                                    hostStatus = "NOTOK";
                                                    hostInfo = "SSH Auth failure to " + hostName;
                                                    break;
                                                case 404:
                                                    console.log("Server " + hostName + " not found");
                                                    hostStatus = "NOTOK";
                                                    hostInfo = "Host not found (DNS issue?)";
                                                    break;
                                                default:
                                                    modalMsg = (
                                                        <div>
                                                            Unexpected response when attempting to add '{ hostName }'<br />
                                                            Status: { err.status }<br />
                                                            Msg: {err.message }<br />
                                                        </div>
                                                    );
                                                    this.showModal(modalMsg);
                                                    console.error("Unknown response to add host request: " + err.status + " / " + err.message);
                                                }
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
                                                ctr++;
                                                if (ctr == newHosts.length) {
                                                    that.setState({ready: true});
                                                }
                                            });
                                });
                            })
                            .catch(err => console.error("create groups problem :" + err + ", " + err.message));
                })
                .fail(error => console.error('Problem fetching group list' + error));
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
            this.showModal(errorMsg);
        }

        return hosts;
    }

    updateState = (hosts) => {
        // update the host state to drive render update
        console.log("updating state with " + JSON.stringify(hosts));
        this.setState({hosts: hosts});
    }

    updateHost = (hostname, role, checked) => {
        console.log("updating the role state for " + hostname + " role " + role + " state of " + checked);
        var localState = this.state.hosts.splice(0);
        console.log("current hosts are: " + JSON.stringify(this.state.hosts));

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

        toggleHostRole(localState, this.updateState, hostname, role, checked, this.props.svctoken);
    }

    deleteHostEntry = (idx) => {
        console.log("deleting host entry");
        var localState = JSON.parse(JSON.stringify(this.state.hosts));
        console.log("state looks like this " + JSON.stringify(localState));
        let hostname = localState[idx].hostname;

        // drop the entry
        localState.splice(idx, 1);
        delete this.config[hostname];

        if (localState.length == 0) {
            this.setState({ready: false});
        }

        this.setState({hosts: localState});
    }

    deleteGroups = (groupsToRemove) => {
        console.log("We need to delete the following groups: " + groupsToRemove.join(','));
        var delChain = Promise.resolve();
        for (var g of groupsToRemove) {
            console.log("Removing " + g + "from the inventory");
            delChain = delChain.then(() => deleteGroup(g, this.props.svctoken));
        }
        delChain.catch(err => {
            console.log("Failed to remove " + g + ": " + err);
        });
    }

    deleteHost = (event) => {
        // delete a host from the state
        console.log("You clicked to delete host - " + event.target.value);

        var hostname = event.target.value;
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
            }
        }

        if (localState[idx].status == 'OK') {
            // OK state means we've added the host to the inventory, so we need
            // to delete from the inventory AND the UI state
            deleteHost(hostname, this.props.svctoken)
                    .then((resp) => {
                        this.deleteHostEntry(idx);
                    })
                    .catch((error) => {
                        console.error("Error " + error + " deleting " + hostname);
                    });
        } else {
            // status was NOTOK, so the host is not in the inventory
            console.log("host index is " + idx);
            this.deleteHostEntry(idx);
        }

        if (groupsToRemove.length > 0) {
            this.deleteGroups(groupsToRemove);
        }

        console.log("TODO: if this is the last host, remove all groups from the inventory");
    }

    componentWillReceiveProps(props) {
        // pick up the state change from the parent
        console.log("hostspage receiving props update");
        const { hosts } = this.state.hosts;
        if (props.hosts != hosts) {
            console.log("hosts have changed, so sort them");
            // sort the hosts by name, then update our state
            var tempHosts = JSON.parse(JSON.stringify(props.hosts));
            tempHosts.sort(sortByKey('hostname'));
            this.setState({hosts: tempHosts});
        }
    }

    hideModal = () => {
        this.setState({
            modalVisible: false,
            modalContent: ''
        });
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
        var rows;
        if (this.state.hosts.length > 0) {
            rows = this.state.hosts.map(host => {
                return <HostDataRow
                            key={host.hostname}
                            hostData={host}
                            roleChange={this.updateHost}
                            deleteRow={this.deleteHost}
                            modal={this.showModal} />;
            });
        } else {
            rows = emptyRow();
        }

        return (
            <div id="hosts" className={this.props.className}>
                <h3>2. Host Definition</h3>
                Enter the hostname or hostname mask to populate the host table. When you click 'Add', the mask will be
                 expanded and the resulting hosts will be added to the Ansible inventory. During this process passwordless
                 SSH is verified, with any errors detected shown below. If a host is in a NOTOK state, you will need to
                 resolve the issue and remove/re-add the host.
                <GenericModal
                    show={this.state.modalVisible}
                    content={this.state.modalContent}
                    closeHandler={this.hideModal} />
                <div className="divCenter">
                    <div>
                        <HostMask callback={this.addHostsToTable} clusterType={this.props.clusterType} installType={this.props.installType} />
                    </div>
                </div>
                <div className="divCenter">
                    <div className="separatorLine" />
                </div>
                <div className="divCenter">
                    <div >
                        <table className="roleTable">
                            <thead>
                                <tr>
                                    <th className="thHostname">Hostname</th>
                                    <th className="textCenter thRoleWidth">mon</th>
                                    <th className="textCenter thRoleWidth">mds</th>
                                    <th className="textCenter thRoleWidth">osd</th>
                                    <th className="textCenter thRoleWidth">rgw</th>
                                    <th className="textCenter thRoleWidth">iscsi</th>
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
                <NextButton disabled={!this.state.ready} action={this.nextAction} />
            </div>
        );
    }
}

class HostDataRow extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            host: this.props.hostData
        };
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

    componentWillReceiveProps(props) {
        // pick up the state change from the parent
        const { hostData } = this.state.host;
        if (props.hostData != hostData) {
            this.setState({host: props.hostData});
        }
    }

    render() {
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
                <td className="textCenter hostStatusCell">
                    { this.colorify(this.state.host.status) }
                </td>
                <td className="tdHostInfo">
                    <HostInfo hostname={this.state.host.hostname} info={this.state.host.info} modal={this.props.modal} />
                </td>
                <td className="tdDeleteBtn">
                    <button className="pficon-delete" value={this.state.host.hostname} onClick={this.props.deleteRow} />
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

    render () {
        return (
            <div style={{display: "inline-block"}}>
                <input type="text" rows="1"
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
            hostmask: '',
            hostmaskOK: false
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
            hostmask: '',
            hostmaskOK: false
        });
    }

    updateRole = (roleName, checkedState) => {
        console.log("Request to update " + roleName + " mask to " + checkedState);
        if (checkedState) {
            console.log("need to check collocation rules");
            let roles = ['mon', 'mds', 'osd', 'rgw', 'iscsi'];
            let currentRoles = [];

            roles.forEach(role => {
                if (this.state[role]) {
                    currentRoles.push(convertRole(role));
                }
            });
            console.log("current roles from mask are " + currentRoles);
            if (!collocationOK(currentRoles, roleName, this.props.installType, this.props.clusterType)) {
                return;
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
        let i = this.props.installType;
        console.log("type of install " + i);
        console.log("state is :" + JSON.stringify(this.state));
        console.log("check the mask info is usable to populate the table");
        // check that at least one role is selected and we have a hostmask
        if (!this.state.hostmaskOK) {
            console.log("hostname is invalid");
            return;
        }
        if (!this.state.hostmask) {
            console.log("clicked add, but the hostmask is invalid/empty");
            return;
        }

        let flags = ['mon', 'mds', 'osd', 'rgw', 'iscsi'];

        let rolesOK = false;
        for (var property in this.state) {
            if (!(flags.includes(property))) {
                continue;
            }
            if (this.state[property]) {
                console.log("at least one role is selected");
                rolesOK = true;
                break;
            }
        }
        if (rolesOK) {
            console.log("Ok to expand and populate the table");
            this.reset();
            this.props.callback(this.state);
            // add the table row
            // reset the mask entry fields
        } else {
            console.log("Need to specify at least one role per hostname mask");
        }
    }

    render() {
        return (
            <div className="hostMask">
                <span style={{marginRight:"10px"}}>Hostname/Mask</span>
                <div style={{display:"inline-block"}}>
                    <HostInputMask callback={this.updateHost} content={this.state.hostmask} />
                </div>
                <span style={{marginLeft: "10px", marginRight:"5px"}}>mon</span>
                <RoleCheckbox role='mon' checked={this.state.mon} callback={this.updateRole} />
                <span style={{marginLeft: "10px", marginRight:"5px"}}>mds</span>
                <RoleCheckbox role='mds' checked={this.state.mds} callback={this.updateRole} />
                <span style={{marginLeft: "10px", marginRight:"5px"}}>osd</span>
                <RoleCheckbox role='osd' checked={this.state.osd} callback={this.updateRole} />
                <span style={{marginLeft: "10px", marginRight:"5px"}}>rgw</span>
                <RoleCheckbox role='rgw' checked={this.state.rgw} callback={this.updateRole} />
                <span style={{marginLeft: "10px", marginRight:"5px"}}>iscsi</span>
                <RoleCheckbox role='iscsi' checked={this.state.iscsi} callback={this.updateRole} />
                <button style={{marginLeft:"20px"}}
                    className="btn btn-primary btn-lg"
                    onClick={this.checkMaskValid} >
                    Add</button>
            </div>
        );
    }
}

export class HostInfo extends React.Component {
    render () {
        var helper = (<div />);
        if (this.props.info.startsWith('SSH')) {
            let helperMsg = (
                <div>
                    You need to copy the ssh public key from this host to {this.props.hostname}<br /><br />
                    <pre>
                        ssh-copy-id -f -i /usr/share/ansible-runner-service/env/ssh_key.pub root@{this.props.hostname}
                    </pre>
                </div>
            );
            helper = (
                <a className="pficon-help" onClick={(e) => { this.props.modal(helperMsg) }} />
            );
        }

        return (
            <div>
                <span className="leftAligned">{this.props.info}</span>
                { helper }
            </div>
        );
    }
}

export default HostsPage;
