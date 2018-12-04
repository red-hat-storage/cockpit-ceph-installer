import React from 'react';
// import { NextButton } from './common/nextbutton.jsx';
import '../app.scss';
import { allVars, osdsVars, monsVars, mgrsVars, hostVars } from '../services/ansibleMap.js';
import { storeGroupVars, storeHostVars, runPlaybook, getPlaybookState } from '../services/apicalls.js';
import { ElapsedTime } from './common/timer.jsx';
import { buildRoles, copyToClipboard } from '../services/utils.js';

export class DeployPage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            deployEnabled: true,
            deployBtnText: 'Deploy',
            statusMsg: '',
            deployActive: false,
            settings: {},
            status: {
                status: "",
                msg: "",
                data: {
                    ok: 0,
                    failed: 0,
                    skipped: 0,
                }
            },
            mocked: true
        };
        this.playbookUUID = '';
        this.intervalHandler = 0;
        this.activeMockData = [];
        this.mockdata = [
            {status: "running", msg: "ok", data: {
                task: "doing osd stuff 1", last_task_num: 10,
                ok: 5, skipped: 2, failed: 0, failures: {}
            }},
            {status: "running", msg: "ok", data: {
                task: "doing osd stuff 2", last_task_num: 20,
                ok: 15, skipped: 10, failed: 0, failures: {}
            }},
            {status: "running", msg: "ok", data: {
                task: "doing osd stuff 3", last_task_num: 30,
                ok: 20, skipped: 20, failed: 0, failures: {}
                //     'ceph-1': {msg: "bad things happened"}
                // }
            }},
            {status: "running", msg: "ok", data: {
                task: "doing osd stuff 4", last_task_num: 45,
                ok: 25, skipped: 30, failed: 0, failures: {}
                //     'ceph-1': {msg: "bad things happened"}
                // }
            }},
            {status: "successful", msg: "ok", data: {
                task: "doing osd stuff 5", last_task_num: 80,
                ok: 30, skipped: 45, failed: 0, failures: {}
                //     'ceph-1': {msg: "bad things happened"}
                // }
            }},
        ];
    }

    componentWillReceiveProps(props) {
        const { settings } = this.state.settings;
        if (JSON.stringify(props.settings) != JSON.stringify(settings)) {
            this.setState({settings: props.settings});
        }
    }

    deployBtnHandler = () => {
        // user clicked deploy
        console.log("User clicked the deploy button");
        if (this.state.deployBtnText == 'Complete') {
            return;
        }

        console.log("current app state is;");
        console.log(JSON.stringify(this.state.settings));

        this.setState({
            deployActive: true,
            deployBtnText: 'Running',
            deployEnabled: false,
            status: {
                status: "",
                msg: "",
                data: {
                    ok: 0,
                    failed: 0,
                    skipped: 0,
                }
            }
            // finished: false
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

        if (this.state.mocked) {
            this.activeMockData = this.mockdata.slice(0);
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
        if (this.state.mocked) {
            if (this.activeMockData.length > 0) {
                let mockData = this.activeMockData.shift();
                console.log(JSON.stringify(mockData));
                this.setState({status: mockData});
            } else {
                console.log("All mocked data used up");
                clearInterval(this.intervalHandler);

                let playStatus = this.state.status.status.toUpperCase();
                console.log("Last status is " + playStatus);
                let buttonText;
                buttonText = (playStatus == "SUCCESSFUL") ? "Complete" : "Retry";

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

                        let status = response.status.toUpperCase();
                        let buttonText;

                        switch (status) {
                        case "FAILED":
                        case "CANCELED":
                        case "SUCCESSFUL":
                            buttonText = (status == "SUCCESSFUL") ? "Complete" : "Retry";
                            clearInterval(this.intervalHandler);
                            this.setState({
                                deployActive: false,
                                deployBtnText: buttonText,
                                deployEnabled: true
                            });
                            break;
                        default:
                            // play is still active - UI chnages handled by prior setState
                        }
                    })
                    .catch(e => {
                        console.log("Problem fetching playbook execution state from runner-service");
                    });
        }
    }

    render() {
        console.log("in deploypage render method");
        var spinner;

        if (this.state.deployActive) {
            spinner = (
                <div className="modifier deploy-summary">
                    <div className="modifier spinner spinner-lg">&nbsp;</div>
                    <RuntimeSummary />
                </div>);
        } else {
            spinner = (<div className="modifier deploy-summary" />);
        }

        var deployBtnClass;
        switch (this.state.deployBtnText) {
        case "Failed":
        case "Retry":
            deployBtnClass = "btn btn-danger btn-lg btn-offset";
            break;
        case "Complete":
            deployBtnClass = "btn btn-success btn-lg btn-offset";
            break;
        default:
            deployBtnClass = "btn btn-primary btn-lg btn-offset";
            break;
        }
        console.log("btn class string is " + deployBtnClass);

        return (

            <div id="deploy" className={this.props.className}>

                <h3>Deploy the Cluster</h3>
                You are now ready to start the deployment process. <br />
                All the options you've chosen will be saved to disk, and the deployment engine (Ansible) invoked
                 to configure your hosts. Deployment progress will be shown below.<br />
                <div className="spacer" />
                <button className={deployBtnClass} disabled={!this.state.deployEnabled} onClick={this.deployBtnHandler}>{this.state.deployBtnText}</button>
                { spinner }
                <div className="divCenter">
                    <div className="separatorLine" />
                </div>
                <ExecutionProgress active={this.state.deployActive} status={this.state.status} />
                <FailureSummary status={this.state.status} failures={this.state.status.data.failed} />
                {/* <NextButton btnText="Finish" disabled={!this.state.finished} action={this.props.action} /> */}

            </div>
        );
    }
}

export class RuntimeSummary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            now: ''
        };
    }

    componentDidMount(props) {
        let now = new Date();
        this.setState({now: now.toLocaleString().substr(11)});
    }

    componentWillUnmount(props) {
        console.log("Unmounting the RuntimeSummary component");
    }

    render() {
        return (
            <div className="modifier deploy-summary">
                <table className="skinny-table">
                    <tbody>
                        <tr>
                            <td className="aligned-right">Start time:&nbsp;</td>
                            <td>{this.state.now}</td>
                        </tr>
                        <tr>
                            <td className="aligned-right">Run time:&nbsp;</td>
                            <td><ElapsedTime /></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }
}

export class ExecutionProgress extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
        };
    }

    render() {
        var progress;
        var status;
        progress = (<div />);

        if (this.props.status.status != '') {
            status = this.props.status;
            progress = (
                <div>
                    <div style={{float: "left"}}>
                        <table className="playbook-table">
                            <tbody>
                                <tr>
                                    <td className="task-title">Completed Tasks</td>
                                    <td className="task-data aligned-right">{ status.data.ok }</td>
                                </tr>
                                <tr>
                                    <td className="task-title">Skipped</td>
                                    <td className="task-data aligned-right">{ status.data.skipped }</td>
                                </tr>
                                <tr>
                                    <td className="task-title">Task Failures</td>
                                    <td className="task-data aligned-right">{ status.data.failed }</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div className="task-title aligned-right float-left" >
                    Current Task:
                    </div>
                    <div className="float-left" >
                        { status.data.task }
                    </div>
                </div>
            );
        }
        // tried using rowSpan, but it doesn't render correctly, so switched to
        // multiple side-by-side divs
        return (
            <div>
                { progress }
            </div>
        );
    }
}

export class FailureSummary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
        };
    }

    render() {
        var failureRows;
        var failureSection;

        failureSection = (
            <div />
        );

        if (this.props.failures > 0) {
            let failedHosts = Object.keys(this.props.status.data.failures);
            failureRows = failedHosts.map((host, id, ary) => {
                return <FailureDetail
                            key={id}
                            hostname={host}
                            errorText={this.props.status.data.failures[host]['msg']} />;
            });

            failureSection = (
                <table className="failure-table">
                    <tbody>
                        <tr>
                            <th className="fhost">Hostname</th>
                            <th className="fdetail">Task Name / Failure Reason</th>
                            <th className="fbtn">&nbsp;</th>
                        </tr>
                        { failureRows }
                    </tbody>
                </table>
            );
        }

        return (
            <div id="failures">
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

    clipboardCopy = () => {
        console.log("copying error for " + this.props.hostname + " to the clipboard");
        copyToClipboard(this.props.errorText);
    }

    render() {
        return (
            <tr>
                <td className="fhost">{this.props.hostname}</td>
                <td className="fdetail">{this.props.errorText}</td>
                <td className="fbtn">
                    <button className="pficon-export" onClick={this.clipboardCopy} />
                </td>
            </tr>
        );
    }
}

export default DeployPage;
