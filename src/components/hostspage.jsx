import React from 'react';

import { UIButton } from './common/nextbutton.jsx';
import { Kebab } from './common/kebab.jsx';
import { RoleCheckbox } from './common/rolecheckbox.jsx';
import { emptyRow } from './common/emptyrow.jsx';
import { Notification } from './common/notifications.jsx';
import { GenericModal, WindowTitle } from './common/modal.jsx';
import { decodeAddError } from '../services/errorHandlers.js';
/* eslint-disable */
import { addGroup, getGroups, addHost, deleteHost, changeHost, deleteGroup } from '../services/apicalls.js';
import { buildRoles, removeItem, convertRole, collocationOK, toggleHostRole, sortByKey, activeRoles, hostsWithRoleCount, getHost, copyToClipboard } from '../services/utils.js';
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
            msgText: ''
        };
        this.config = {};
        this.cache = {
            roles: []
        };
        // this.hostMaskInput = React.createRef();
    }

    nextAction = (event) => {
        let usable = true;
        let errMsgs = [];

        if (this.state.hosts.length > 0) {
            // we must have hosts to process before moving on to validation
            var hostOKCount = 0;
            this.state.hosts.forEach(host => {
                if (host.status == 'OK') {
                    hostOKCount++;
                }
            });
            if (hostOKCount != this.state.hosts.length) {
                errMsgs.push("Hosts must be in an 'OK' state to continue");
            }

            let monCount = hostsWithRoleCount(this.state.hosts, 'mon');
            let osdHostCount = hostsWithRoleCount(this.state.hosts, 'osd');

            switch (true) {
            case (monCount === 0):
                errMsgs.push("You must have a mon role defined");
                break;
            case (monCount === 1 && this.props.clusterType.toLowerCase() === 'production'):
                errMsgs.push("Too few mons for production. You must have 3 or 5 mons defined");
                break;
            case (monCount % 2 == 0):
                errMsgs.push("You can't have an even number of mons");
                break;
            }

            if (osdHostCount === 0) {
                errMsgs.push("OSD hosts are required");
            }

            if (errMsgs.length > 0) {
                this.setState({
                    msgLevel: "error",
                    msgText: errMsgs.join('. ')
                });
                usable = false;
            }

            if (usable) {
                this.setState({
                    msgLevel: "",
                    msgText: ""
                });
                this.props.action(this.state);
            }
        } else {
            this.setState({
                msgLevel: "error",
                msgText: "You need hosts in an OK state to continue"
            });
            console.log("You haven't got any hosts - can't continue");
        }
    }

    addHostsToTable = (stateObject) => {
        console.log("received mask information " + JSON.stringify(stateObject));
        this.setState({addHostsVisible: false});
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

                                // run the add hosts serially - avoids inventory update conflicts/retries
                                var sequence = Promise.resolve();
                                newHosts.forEach(function(hostName) {
                                    sequence = sequence.then(() => {
                                        return addHost(hostName, rolesString, tokenString);
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

        this.setState({hosts: currentHosts}); // update the table to show the retry action

        var that = this;
        var tokenString = this.props.svctoken;
        var roleList = buildRoles([currentHosts[ptr]]);
        if (roleList.includes('mons')) {
            console.log("adding mgrs to role list since we have a mon");
            roleList.push('mgrs');
        }

        addHost(hostName, roleList.join(','), tokenString)
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
                    that.setState({hosts: currentHosts});
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
                this.setState({
                    msgLevel: 'error',
                    msgText: "Adding " + role + " role to " + hostname + " would violate supported collocation rules"
                });
                this.updateState(localState);
                return;
            } else {
                console.log("should turn of any collocation error message");
                // this.setState({
                //     msgLevel: 'info',
                //     msgText: ''
                // });
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
        console.log("We need to remove the following groups: " + groupsToRemove.join(',') + " - " + JSON.stringify(groupsToRemove));
        var delChain = Promise.resolve();
        groupsToRemove.forEach(group => delChain.then(() => deleteGroup(group, this.props.svctoken)));
        delChain.catch(err => {
            console.error("Failed to remove group. Error: " + JSON.stringify(err));
        });
    }

    deleteHost = (hostname) => {
        // delete a host from the state
        console.log("You clicked to delete host - " + hostname);

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
            deleteHost(hostname, this.props.svctoken)
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
            modalContent: "",
            modalTitle: ""

        });
    }

    showModal = (title, modalContent) => {
        // handle the show and hide of the app level modal
        console.log("content: ");
        console.log(modalContent);
        this.setState({
            modalVisible: true,
            modalTitle: title,
            modalContent: modalContent
        });
    }

    showAddHosts = () => {
        console.log("Show add hosts modal");
        this.setState({addHostsVisible: true});
        // this.hostMaskInput.current.focus();
    }

    hideAddHosts = () => {
        this.setState({addHostsVisible: false});
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
        var rows;
        if (this.state.hosts.length > 0) {
            rows = this.state.hosts.map(host => {
                return <HostDataRow
                            key={host.hostname}
                            hostData={host}
                            roleChange={this.updateHost}
                            deleteRow={this.deleteHost}
                            retryHost={this.retryHost}
                            modal={this.showModal} />;
            });
        } else {
            rows = emptyRow();
        }

        return (
            <div id="hosts" className={this.props.className}>
                <h3>2. Host Definition</h3>
                <p>Enter the hostname or hostname mask to populate the host table. When you click 'Add', the mask will be
                 expanded and the resulting hosts will be added to the Ansible inventory. During this process passwordless
                 SSH is verified, with any errors detected shown below. If a host is in a NOTOK state, you will need to
                 resolve the issue and remove/re-add the host.</p>
                <Notification ref="validationMessage" msgLevel={this.state.msgLevel} msgText={this.state.msgText} />
                <GenericModal
                    show={this.state.modalVisible}
                    title={this.state.modalTitle}
                    content={this.state.modalContent}
                    closeHandler={this.hideModal} />
                <HostMask
                    show={this.state.addHostsVisible}
                    callback={this.addHostsToTable}
                    clusterType={this.props.clusterType}
                    closeHandler={this.hideAddHosts}
                    installType={this.props.installType} />
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
                </div>
                {/* <NextButton disabled={!this.state.ready} action={this.nextAction} /> */}
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

    componentWillReceiveProps(props) {
        // pick up the state change from the parent
        const { hostData } = this.state.host;
        if (props.hostData != hostData) {
            this.setState({host: props.hostData});
            this.actions = [{action: "Delete", callback: this.props.deleteRow}];
            if (props.hostData.status === 'NOTOK') {
                this.actions.push({action:"Retry", callback:this.props.retryHost});
            }
        }
    }

    dummy = () => {
        console.log("Dummy function for a retry request");
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
                    <Kebab value={this.state.host.hostname} actions={this.actions} />
                    {/* <button className="pficon-delete" value={this.state.host.hostname} onClick={this.props.deleteRow} /> */}
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

    // componentWillReceiveProps(props) {
    //     console.log("hostmaskinput " + JSON.stringify(props));
    //     if (props.visible) {
    //         console.log("setting focus to input element");
    //         this.hostInput.current.focus();
    //     }
    // }

    componentDidUpdate(prevProps, prevState) {
        console.log("hostmask input component update");
        if (!prevProps.visible) {
            this.refs.hostInputField.focus();
            console.log("with props " + JSON.stringify(prevProps));
        }
    }

    // setFocus() {
    //     this.refs.hostInputField.focus();
    // }

    // shouldComponentUpdate = () => {
    //     return false;
    // }

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
            hostmask: '',
            hostmaskOK: false,
            msgLevel: 'info',
            msgText: ''
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
            hostmaskOK: false,
            msgLevel: 'info',
            msgText: ''
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
                console.log("invalid roles - violates collocation rules");
                this.setState({
                    msgLevel: 'error',
                    msgText: 'Collocation of ' + currentRoles.join(', ') + " is not allowed "
                });
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

    // componentWillReceiveProps(props) {
    //     console.log("HostMask component received " + JSON.stringify(props));
    //     if (props.show) {
    //         console.log("revealed add hosts and set focus");
    //         this.refs.hostInput.setFocus();
    //     }
    // }

    render() {
        let showHideClass = this.props.show ? 'modal display-block' : 'modal display-none';
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
                        </div>
                        <div style={{marginTop:"15px"}}>
                            <div className="display-inline-block sel-label-vertical"><b>Roles</b></div>
                            <div style={{display:"inline-flex"}}>

                                <div className="display-inline-block">
                                    <table id="add-hosts" >
                                        <tbody>
                                            <tr>
                                                <td>
                                                    <RoleCheckbox role='mon' checked={this.state.mon} callback={this.updateRole} />
                                                </td>
                                                <td style={{minWidth: "60px"}}>mon</td>
                                                <td>
                                                    <RoleCheckbox role='mds' checked={this.state.mds} callback={this.updateRole} />
                                                </td>
                                                <td style={{minWidth: "60px"}}>mds</td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <RoleCheckbox role='osd' checked={this.state.osd} callback={this.updateRole} />
                                                </td>
                                                <td style={{minWidth: "60px"}}>osd</td>
                                                <td>
                                                    <RoleCheckbox role='iscsi' checked={this.state.iscsi} callback={this.updateRole} />
                                                </td>
                                                <td style={{minWidth: "60px"}}>iscsi</td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <RoleCheckbox role='rgw' checked={this.state.rgw} callback={this.updateRole} />
                                                </td>
                                                <td style={{minWidth: "60px"}}>rgw</td>
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
        if (this.props.info.startsWith('SSH')) {
            let fixMe = "ssh-copy-id -f -i /usr/share/ansible-runner-service/env/ssh_key.pub root@" + this.props.hostname;
            let helperMsg = (
                <div>
                    You need to copy the ssh public key from this host to {this.props.hostname}<br /><br />
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
                <span className="leftAligned">{this.props.info}</span>
                { helper }
            </div>
        );
    }
}

export default HostsPage;
