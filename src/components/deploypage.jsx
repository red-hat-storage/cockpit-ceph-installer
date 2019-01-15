import cockpit from 'cockpit';
import React from 'react';

import { UIButton } from './common/nextbutton.jsx';
import '../app.scss';
import { allVars, osdsVars, monsVars, mgrsVars, hostVars, cephAnsibleSequence } from '../services/ansibleMap.js';
import { storeGroupVars, storeHostVars, runPlaybook, getPlaybookState, getEvents, getJobEvent } from '../services/apicalls.js';
import { ElapsedTime } from './common/timer.jsx';
import { Selector } from './common/selector.jsx';
import { GenericModal } from './common/modal.jsx';
// import { buildRoles, copyToClipboard, currentTime } from '../services/utils.js';
import { buildRoles, currentTime } from '../services/utils.js';

export class DeployPage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            deployEnabled: true,
            deployBtnText: 'Deploy',
            statusMsg: '',
            deployActive: false,
            settings: {},
            runTime: 0,
            showTaskStatus: true,
            startTime: 'N/A',
            roleState: {},
            status: {
                status: 'ready',
                msg: "Waiting to start",
                data: {
                    ok: 0,
                    failed: 0,
                    skipped: 0,
                    role: '',
                    task: '',
                    task_metadata: {
                        created: '',
                        task_action: '',
                        task_path: '',
                        play_pattern: ''
                    }
                }
            }
        };
        this.deploySelector = [
            'Current task',
            'Failed task(s)'
        ];
        this.startTime = 'N/A';
        this.endTime = null;
        this.roleSequence = [];
        this.roleActive = null;
        this.roleSeen = [];
        this.mocked = false;
        this.playbookUUID = '';
        this.intervalHandler = 0;
        this.activeMockData = [];
        this.mockEvents = [];
        this.mockCephOutput = [];
    }

    componentDidMount() {
        console.log("deploypage mounted to the DOM");
        console.log("checking for mock data");

        cockpit.file("/var/lib/cockpit/ceph-installer/mockdata/deploypage.json").read()
                .done((content, tag) => {
                    if (content === null && tag === '-') {
                        console.log("No mockdata present for deploypage");
                    } else {
                        let mockData = JSON.parse(content);
                        console.log("mock data loaded");
                        this.mocked = true;
                        this.mockEvents = mockData['mockEvents'];
                        console.log("mock events :" + this.mockEvents.length);
                        this.mockCephOutput = mockData['mockCephOutput'];
                        console.log("mock ceph output lines : " + this.mockCephOutput.length);
                    }
                })
                .fail((error) => {
                    console.log("file read failed :" + JSON.stringify(error));
                });
    }

    componentWillReceiveProps(props) {
        const { settings } = this.state.settings;
        if (JSON.stringify(props.settings) != JSON.stringify(settings)) {
            this.setState({settings: props.settings});
            let allRoles = buildRoles(props.settings.hosts);
            if (allRoles.length > 0) {
                let tmpRoleState = {};
                for (let role of allRoles) {
                    tmpRoleState[role] = 'pending';
                    if (role == 'mons') { tmpRoleState['mgrs'] = 'pending' }
                }
                this.setState({roleState: tmpRoleState});
                this.roleSequence = cephAnsibleSequence(allRoles);
            }
        }
    }

    setRoleState = (eventData) => {
        let currentState = this.state.roleState;
        let changesMade = false;
        let eventRoleName;
        let shortName = eventData.data.role.replace("ceph-", '');

        if (this.roleSequence.includes(shortName)) {
            eventRoleName = shortName + "s";
        } else {
            eventRoleName = shortName;
        }
        switch (eventData.msg) {
        case "running":
            if (this.roleActive == null) {
                // first time through
                currentState['mons'] = 'active';
                this.roleActive = 'mons';
                changesMade = true;
                break;
            } else {
                if (eventRoleName != "") {
                    // console.log("current role active: " + this.roleActive + ", eventRoleName: " + eventRoleName + ", shortName: " + shortName);

                    // if the event role is not in the list AND we have seen the role-active name
                    // - set the current role to complete and move pending to the next
                    if (!this.roleSequence.includes(shortName) && this.roleSeen.includes(this.roleActive.slice(0, -1))) {
                        currentState[this.roleActive] = 'complete';
                        // FIXME: this won't work for iscsi
                        let a = this.roleActive.slice(0, -1); // remove the 's'
                        let nextRole = this.roleSequence[this.roleSequence.indexOf(a) + 1];
                        currentState[nextRole + 's'] = 'active';
                        this.roleActive = nextRole + 's';
                        changesMade = true;
                        break;
                    }

                    // if the shortname is in the sequence, but not in last seen
                    // - add it to last seen
                    if (!this.roleSeen.includes(shortName) && this.roleSequence.includes(shortName)) {
                        this.roleSeen.push(shortName);
                    }
                }
            }
            break;
        case "failed":
            currentState[this.roleActive] = 'failed'; // mark current breadcrumb as complete
            changesMade = true;
            break;
        case "successful":
            currentState[this.roleActive] = 'complete'; // mark current breadcrumb as complete
            changesMade = true;
            break;
        }

        if (changesMade) {
            this.setState({roleState: currentState});
        }
        console.log("roles seen " + this.roleSeen);
    }

    formattedOutput = (output) => {
        var cmdOutput = output.map(textLine => {
            return (<div className="code">{textLine}</div>);
        });
        return (
            <div>
                { cmdOutput }
            </div>
        );
    }

    fetchCephState = () => {
        console.log("querying events for " + this.playbookUUID);
        if (this.mocked) {
            // just return the mocked data output
            console.log("using mocked data");
            console.log("calling the main app modal");
            let content = this.formattedOutput(this.mockCephOutput);
            this.props.modalHandler(content);
        } else {
            console.log("fetching event data from the playbook run");
            getEvents(this.playbookUUID, this.props.svctoken)
                    .then((resp) => {
                        let response = JSON.parse(resp);
                        let foundEvent = '';
                        let evtIDs = Object.keys(response.data.events).reverse();
                        for (let evt of evtIDs) {
                            let thisEvent = response.data.events[evt];
                            if (thisEvent['event'] == 'runner_on_ok' && thisEvent['task'].startsWith('show ceph status for')) {
                                foundEvent = evt;
                                break;
                            }
                        }
                        if (foundEvent != '') {
                            getJobEvent(this.playbookUUID, foundEvent, this.props.svctoken)
                                    .then((resp) => {
                                        let response = JSON.parse(resp);
                                        let output = response.data.event_data.res.msg;
                                        let content = this.formattedOutput(output);
                                        this.props.modalHandler("Ceph Cluster Status", content);
                                    })
                                    .catch(e => {
                                        console.error("Error fetching job event: " + e.message);
                                    });
                        } else {
                            console.log("playbook didn't have a show ceph status task");
                        }
                    })
                    .catch(e => {
                        console.error("Unable to fetch events for play " + this.playbookUUID);
                    });
        }
    }

    reset = () => {
        let allRoles = buildRoles(this.props.settings.hosts);
        let tmpRoleState = {};
        for (let role of allRoles) {
            tmpRoleState[role] = 'pending';
            if (role == 'mons') { tmpRoleState['mgrs'] = 'pending' }
        }
        this.roleSeen = [];
        this.roleActive = null;
        this.setState({
            status: {
                status: 'ready',
                msg: "Waiting to start",
                data: {
                    ok: 0,
                    failed: 0,
                    skipped: 0,
                    role: '',
                    task: ''
                }
            },
            roleState: tmpRoleState
        });
    }

    deployBtnHandler = () => {
        // user clicked deploy/Complete or retry button (multi-personality syndrome)
        console.log("User clicked the Deploy/Complete/Retry button");
        if (this.state.deployBtnText == 'Complete') {
            this.fetchCephState();
            return;
        }

        console.log("current app state is;");
        console.log(JSON.stringify(this.state.settings));
        this.reset();
        this.setState({
            deployActive: true,
            deployBtnText: 'Running',
            deployEnabled: false,
        });

        this.props.deployHandler(); // turns of the navigation bar
        console.log("Creating the hostvars and groupvars variables");
        let roleList = buildRoles(this.state.settings.hosts);
        console.log("Generating variables for roles " + roleList);
        var vars = allVars(this.state.settings);
        console.log("creating all.yml as " + JSON.stringify(vars));
        var chain = Promise.resolve();
        let mons, mgrs, osds;
        chain = chain.then(() => storeGroupVars('all', vars, this.props.svctoken));

        for (let roleGroup of roleList) {
            switch (roleGroup) {
            case "mons":
                console.log("adding mons + mgrs");
                mons = monsVars(this.state.settings);
                console.log("mon vars " + JSON.stringify(mons));
                chain = chain.then(() => storeGroupVars('mons', mons, this.props.svctoken));
                mgrs = mgrsVars(this.state.settings);
                console.log("mgr vars " + JSON.stringify(mgrs));
                chain = chain.then(() => storeGroupVars('mgrs', mgrs, this.props.svctoken));
                break;
            case "osds":
                console.log("adding osds");
                osds = osdsVars(this.state.settings);
                console.log("osd vars " + JSON.stringify(osds));
                chain = chain.then(() => storeGroupVars('osds', osds, this.props.svctoken));
                break;
            case "mdss":
                console.log("adding mds yml - TODO");
                break;
            case "rgws":
                console.log("ading rgws - TODO");
                break;
            case "iscsigws":
                console.log("adding iscsi - TODO");
                break;
            }
        }

        console.log("all group vars have been added");
        if (roleList.includes("osds")) {
            console.log("generating hostvars for the osd hosts");
            for (let host of this.state.settings.hosts) {
                if (host.osd) {
                    let osd_metadata = hostVars(host, this.state.settings.flashUsage);
                    chain = chain.then(() => storeHostVars(host.hostname, 'osds', osd_metadata, this.props.svctoken));
                }
            }
        }

        chain = chain.then(() => {
            console.log("hostvars and groupvars in place");
            this.startPlaybook();
        });

        chain.catch(err => {
            console.error("problem creating group vars files: " + err);
        });
    }

    startPlaybook = () => {
        console.log("Start playbook and set up timer to refresh every 2secs");
        this.setState({
            startTime: currentTime()
        });

        if (this.mocked) {
            this.activeMockData = this.mockEvents.slice(0);
            this.intervalHandler = setInterval(this.getPlaybookState, 2000);
        } else {
            // Start the playbook
            let playbookName;
            let varOverrides = {};
            if (this.state.settings.installType.toUpperCase() == 'CONTAINER') {
                playbookName = 'site-container.yml';
            } else {
                playbookName = 'site.yml';
            }
            console.log("Attempting to start playbook " + playbookName);
            runPlaybook(playbookName, varOverrides, this.props.svctoken)
                    .then((resp) => {
                        let response = JSON.parse(resp);
                        if (response.status == "STARTED") {
                            this.playbookUUID = response.data.play_uuid;
                            console.log("playbook has started with UUID " + this.playbookUUID);
                            this.intervalHandler = setInterval(this.getPlaybookState, 2000);
                        }
                    })
                    .catch(e => {
                        console.log("Problem starting the playbook - unable to continue: " + e + ", " + e.message);
                    });
        }
    }

    getPlaybookState = () => {
        console.log("fetch state from the playbook run");
        if (this.mocked) {
            if (this.activeMockData.length > 0) {
                let mockData = this.activeMockData.shift();
                console.log(JSON.stringify(mockData));
                this.setState({status: mockData});
                this.setRoleState(mockData);
                // TODO: look at the data to determine progress state for the breadcrumb
            } else {
                console.log("All mocked data used up");
                clearInterval(this.intervalHandler);

                let playStatus = this.state.status.msg.toUpperCase();
                console.log("Last status is " + playStatus);
                let buttonText;
                buttonText = (playStatus == "SUCCESSFUL") ? "Complete" : "Retry";
                this.endTime = currentTime();
                this.setState({
                    deployActive: false,
                    deployBtnText: buttonText,
                    deployEnabled: true
                });
            }
        } else {
            // this is a real run
            getPlaybookState(this.playbookUUID, this.props.svctoken)
                    .then((resp) => {
                        // process the response
                        let response = JSON.parse(resp);
                        this.setState({status: response});
                        this.setRoleState(response);
                        let msg = response.msg.toUpperCase();
                        let buttonText;

                        switch (msg) {
                        case "FAILED":
                        case "CANCELED":
                        case "SUCCESSFUL":
                            buttonText = (msg == "SUCCESSFUL") ? "Complete" : "Retry";
                            clearInterval(this.intervalHandler);
                            this.refs.timer.stopTimer();
                            this.endTime = currentTime();
                            this.setState({
                                deployActive: false,
                                deployBtnText: buttonText,
                                deployEnabled: true
                            });
                            break;
                        default:
                            // play is still active - NO-OP
                        }
                    })
                    .catch(e => {
                        console.log("Problem fetching playbook execution state from runner-service");
                    });
        }
    }

    storeRuntime = (timer) => {
        this.setState({runTime: timer});
    }

    deploymentSwitcher = (event) => {
        console.log("Change of pulldown to " + event.target.value);
        if (event.target.value.startsWith('Current')) {
            this.setState({showTaskStatus: true});
        } else {
            this.setState({showTaskStatus: false});
        }
    }

    render() {
        console.log("in deploypage render method");
        // var spinner;

        // if (this.state.deployActive) {
        //     spinner = (
        //         <div className="modifier deploy-summary">
        //             <div className="modifier spinner spinner-lg">&nbsp;</div>
        //             <RuntimeSummary callback={this.storeRuntime} />
        //         </div>
        //     );
        // } else {
        //     spinner = (<div className="modifier deploy-summary" />);
        // }

        var deployBtnClass;
        var msgClass;
        var msgText;
        switch (this.state.status.msg) {
        case "failed":
            msgClass = "runtime-table-value align-left errorText";
            msgText = 'FAILED';
            break;
        default:
            msgClass = "runtime-table-value align-left";
            msgText = this.state.status.msg;
        }

        switch (this.state.deployBtnText) {
        case "Failed":
        case "Retry":
            deployBtnClass = "nav-button btn btn-primary btn-lg";
            break;
        case "Complete":
            deployBtnClass = "nav-button btn btn-success btn-lg";
            break;
        default:
            deployBtnClass = "nav-button btn btn-primary btn-lg";
            break;
        }
        console.log("btn class string is " + deployBtnClass);

        return (

            <div id="deploy" className={this.props.className}>

                <h3>6. Deploy the Cluster</h3>
                You are now ready to start the deployment process. <br />
                {/* All the options you've chosen will be saved to disk, and the deployment engine (Ansible) invoked
                 to configure your hosts. Deployment progress will be shown below.<br /> */}
                {/* <div className="spacer" />
                <button className={deployBtnClass} disabled={!this.state.deployEnabled} onClick={this.deployBtnHandler}>{this.state.deployBtnText}</button>
                { spinner }
                <div className="divCenter">
                    <div className="separatorLine" />
                </div> */}
                {/* { breadcrumbs } */}
                {/* <div className="div-center"> */}
                <table className="runtime-table">
                    <tbody>
                        <tr>
                            <td className="runtime-table-label">Start Time</td>
                            <td className="runtime-table-value align-left">{this.state.startTime}</td>
                            <td className="runtime-table-spacer">&nbsp;</td>
                            <td className="runtime-table-label">Completed</td>
                            <td className="runtime-table-nbr align-right">{this.state.status.data.ok}</td>
                        </tr>
                        <tr>
                            <td className="runtime-table-label">Status</td>
                            <td className={msgClass}>{msgText}</td>
                            <td className="runtime-table-spacer">&nbsp;</td>
                            <td className="runtime-table-label">Skipped</td>
                            <td className="runtime-table-nbr align-right">{this.state.status.data.skipped}</td>
                        </tr>
                        <tr>
                            <td className="runtime-table-label">Run Time</td>
                            <td className="runtime-table-value align-left">
                                <ElapsedTime ref="timer" active={this.state.deployActive} callback={this.storeRuntime} />
                            </td>
                            <td className="runtime-table-spacer">&nbsp;</td>
                            <td className="runtime-table-label">Failures</td>
                            <td className="runtime-table-nbr align-right">{this.state.status.data.failed}</td>
                        </tr>
                    </tbody>
                </table>
                {/* <ExecutionProgress active={this.state.deployActive} status={this.state.status} runtime={this.state.runTime} callback={this.storeRuntime} /> */}
                {/* <div className="clear" /> */}
                <BreadCrumbStatus runStatus={this.state.status.status} roleState={this.state.roleState} />
                <div>
                    <Selector labelName="Filter by:&nbsp;&nbsp;" noformat options={this.deploySelector} callback={this.deploymentSwitcher} />
                </div>
                <div id="deploy-container">
                    <TaskStatus visible={this.state.showTaskStatus} status={this.state.status} />
                    <FailureSummary visible={!this.state.showTaskStatus} status={this.state.status} />
                </div>
                {/* </div> */}

                {/* <FailureSummary status={this.state.status} failures={this.state.status.data.failed} /> */}
                {/* <NextButton btnText="Finish" disabled={!this.state.finished} action={this.props.action} /> */}
                <div className="nav-button-container">
                    <UIButton btnClass={deployBtnClass} btnLabel={this.state.deployBtnText} disabled={!this.state.deployEnabled} action={this.deployBtnHandler} />
                    <UIButton btnLabel="&lsaquo; Back" disabled={!this.state.deployEnabled} action={this.props.prevPage} />
                </div>
            </div>
        );
    }
}

export class TaskStatus extends React.Component {
    render() {
        let visible = (this.props.visible) ? "deploy-status display-block" : "deploy-status hidden";
        let taskStatus;
        if (this.props.status.msg.startsWith('Waiting')) {
            taskStatus = (<div />);
        } else {
            let taskInfo;
            let timeStamp;
            if (this.props.status.data.role) {
                taskInfo = '[ ' + this.props.status.data.role + ' ] ' + this.props.status.data.task;
            } else {
                taskInfo = this.props.status.data.task;
            }
            if (this.props.status.data.task_metadata.created) {
                let t = new Date(this.props.status.data.task_metadata.created);
                let offset = t.getTimezoneOffset() / 60;
                t.setHours(t.getHours() - offset);
                timeStamp = t.toLocaleTimeString('en-GB');
            } else {
                timeStamp = '';
            }
            taskStatus = (
                <div>
                    <div>
                        <span className="task-label bold-text">Task Name:</span><span>{taskInfo}</span>
                    </div>
                    <div>
                        <span className="task-label bold-text">Started:</span><span>{timeStamp}</span>
                    </div>
                    <div>
                        <span className="task-label bold-text">Role:</span><span>{this.props.status.data.role}</span>
                    </div>
                    <div>
                        <span className="task-label bold-text">Pattern:</span><span>{this.props.status.data.task_metadata.play_pattern}</span>
                    </div>
                    <div>
                        <span className="task-label bold-text">Task Path:</span><span>{this.props.status.data.task_metadata.task_path}</span>
                    </div>
                    <div>
                        <span className="task-label bold-text">Action:</span><span>{this.props.status.data.task_metadata.task_action}</span>
                    </div>
                </div>
            );
        }

        return (
            <div className={visible} >
                {taskStatus}
            </div>
        );
    }
}

// export class FailureInfo extends React.Component {
//     render() {
//         let visible = (this.props.visible) ? "deploy-status display-block" : "deploy-status hidden";
//         return (
//             <div className={visible} >&nbsp;
//             </div>
//         );
//     }
// }

// export class RuntimeSummary extends React.Component {
//     constructor(props) {
//         super(props);
//         this.state = {
//             now: ''
//         };
//     }

//     componentDidMount(props) {
//         let now = new Date();
//         this.setState({now: now.toLocaleString().substr(11)});
//     }

//     componentWillUnmount(props) {
//         console.log("Unmounting the RuntimeSummary component");
//     }

//     render() {
//         return (
//             <div className="modifier deploy-summary">
//                 <table className="skinny-table">
//                     <tbody>
//                         <tr>
//                             <td className="aligned-right">Start time:&nbsp;</td>
//                             <td>{this.state.now}</td>
//                         </tr>
//                         <tr>
//                             <td className="aligned-right">Run time:&nbsp;</td>
//                             <td><ElapsedTime callback={this.props.callback} /></td>
//                         </tr>
//                     </tbody>
//                 </table>
//             </div>
//         );
//     }
// }

// export class ExecutionProgress extends React.Component {
//     constructor(props) {
//         super(props);
//         this.state = {
//         };
//     }

//     render() {
//         var progress;
//         var status;
//         var taskInfo;
//         var taskLabel;
//         progress = (<div />);

//         if (this.props.status.status != '') {
//             status = this.props.status;
//             console.log("rendering playbook run details");
//             console.log(JSON.stringify(status));
//             if (status.data.role != '') {
//                 taskInfo = "[" + status.data.role + "] " + status.data.task;
//             } else {
//                 taskInfo = status.data.task;
//             }
//             switch (status.msg.toUpperCase()) {
//             case "FAILED":
//                 taskLabel = (<span style={{color: "red"}}>FAILED</span>);
//                 taskInfo = '';
//                 break;
//             case "SUCCESSFUL":
//                 taskLabel = "Deployment Successful ";
//                 if (this.props.runtime > 0) {
//                     let date = new Date(null);
//                     date.setSeconds(this.props.runtime);
//                     taskLabel += "(run time: " + date.toISOString().substr(11, 8) + ")";
//                 }
//                 taskInfo = '';
//                 break;
//             default:
//                 taskLabel = "Task:";
//             }

//             progress = (
//                 <div>
//                     <div className="float-left">
//                         <table className="playbook-table">
//                             <tbody>
//                                 <tr>
//                                     <td className="task-title">Completed Tasks</td>
//                                     <td className="task-data aligned-right">{ status.data.ok }</td>
//                                 </tr>
//                                 <tr>
//                                     <td className="task-title">Skipped</td>
//                                     <td className="task-data aligned-right">{ status.data.skipped }</td>
//                                 </tr>
//                                 <tr>
//                                     <td className="task-title">Task Failures</td>
//                                     <td className="task-data aligned-right">{ status.data.failed }</td>
//                                 </tr>
//                                 <tr>
//                                     <td className="task-title">Run time</td>
//                                     <td className="task-data aligned-right">
//                                         <ElapsedTime active={this.props.active} callback={this.props.callback} />
//                                     </td>
//                                 </tr>
//                             </tbody>
//                         </table>
//                     </div>
//                     <div className="float-left" style={{width: "40px", minWidth: "40px"}} >&nbsp;</div>
//                     <div className="float-left padding-sides" >
//                         { taskLabel }
//                     </div>
//                     <div className="float-left padding-sides" >
//                         { taskInfo }
//                     </div>
//                 </div>
//             );
//         }
//         // tried using rowSpan, but it doesn't render correctly, so switched to
//         // multiple side-by-side divs
//         return (
//             <div>
//                 { progress }
//             </div>
//         );
//     }
// }

export class FailureSummary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            modalVisible: false,
            modalContent: '',
            modalTitle: ''
        };
    }

    showModal = (title, content) => {
        this.setState({
            modalTitle: title,
            modalVisible: true,
            modalContent: content
        });
    }

    hideModal = () => {
        this.setState({
            modalTitle: '',
            modalVisible: false,
            modalContent: ''
        });
    }

    render() {
        var failureRows;
        var failureSection;

        failureSection = (
            <div />
        );

        let visible = (this.props.visible) ? "display-block" : "hidden";

        if (this.props.visible) {
            if (this.props.status.data.failed > 0) {
                let failedHosts = Object.keys(this.props.status.data.failures);
                failureRows = failedHosts.map((host, id, ary) => {
                    let hostError = this.props.status.data.failures[host]['event_data'];
                    return <FailureDetail
                                key={id}
                                hostname={host}
                                errorEvent={hostError}
                                modalHandler={this.showModal} />;
                });

                failureSection = (
                    <table className="failure-table">
                        <thead>
                            <tr>
                                <th className="fhost">Hostname</th>
                                <th className="fdetail">Task Name / Failure Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            { failureRows }
                        </tbody>
                    </table>
                );
            }
        }

        return (
            <div className={visible}>
                <GenericModal
                    title={this.state.modalTitle}
                    show={this.state.modalVisible}
                    content={this.state.modalContent}
                    closeHandler={this.hideModal} />
                { failureSection }
            </div>
        );
    }
}

export class FailureDetail extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
        };
    }

    // clipboardCopy = () => {
    //     console.log("copying error for " + this.props.hostname + " to the clipboard");
    //     let errorText;
    //     errorText = this.props.hostname + " failed in role '";
    //     errorText += this.props.errorEvent['role'] + "', task '";
    //     errorText += this.props.errorEvent['task'] + "'. Error msg - ";
    //     errorText += this.props.errorEvent['res']['msg'];
    //     copyToClipboard(errorText);
    // }

    render() {
        let errorDetail;
        if (this.props.errorEvent.res.results) {
            // try to use stderr
            let results = this.props.errorEvent.res.results[0];
            if (results.stderr.length > 100) {
                errorDetail = (
                    <span>{results.stderr.slice(0, 100)}
                        <span className="link" onClick={() => {
                            let title = this.props.hostname + " Failure Details";
                            this.props.modalHandler(title, results.stderr);
                        }}><i>&nbsp;...more</i></span>
                    </span>);
            } else {
                errorDetail = (<span>{results.stderr}</span>);
            }
        } else {
            errorDetail = (<span>{this.props.errorEvent.res.msg}</span>);
        }

        return (
            <tr>
                <td className="fhost">{this.props.hostname}</td>
                <td className="fdetail">
                    {this.props.errorEvent['task']}<br />
                    { errorDetail }
                </td>
                {/* <td className="fbtn">
                    <button className="pficon-export" onClick={this.clipboardCopy} />
                </td> */}
            </tr>
        );
    }
}

export class BreadCrumbStatus extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            roles: []
        };
    }

    componentWillReceiveProps (props) {
        this.setState({roles: Object.keys(props.roleState)});
    }

    render () {
        console.log("render all breadcrumbs - " + JSON.stringify(this.props.roleState));
        var breadcrumbs;
        if (this.props.runStatus != '') {
            breadcrumbs = this.state.roles.map(role => {
                return <Breadcrumb
                            key={role}
                            label={role}
                            state={this.props.roleState[role]} />;
            });
        } else {
            breadcrumbs = (<div />);
        }
        return (
            <div className="display-block">
                { breadcrumbs }
            </div>
        );
    }
}

export class Breadcrumb extends React.Component {
    render() {
        console.log("rendering a breadcrumb");
        var status;
        switch (this.props.state) {
        case "pending":
            status = "grey";
            break;
        case "active":
            status = "blue";
            break;
        case "complete":
            status = "green";
            break;
        case "failed":
            status = "red";
            break;
        }

        status += " breadcrumb";
        return (
            <div className={status}>{this.props.label}</div>
        );
    }
}

export default DeployPage;
