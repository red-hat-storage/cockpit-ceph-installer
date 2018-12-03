import React from 'react';
import { NextButton } from './common/nextbutton.jsx';
import '../app.scss';
import { allVars, osdsVars, monsVars, mgrsVars, hostVars } from '../services/ansibleMap.js';
import { storeGroupVars, storeHostVars } from '../services/apicalls.js';
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
            settings: {}
        };
    }

    componentWillReceiveProps(props) {
        const { settings } = this.state.settings;
        if (JSON.stringify(props.settings) != JSON.stringify(settings)) {
            this.setState({settings: props.settings});
        }
    }

    deployBtnHandler = () => {
        // user clicked deploy
        console.log("User clicked the deploy button - here's a dump of current state");
        console.log(JSON.stringify(this.state.settings));

        this.setState({
            deployActive: true,
            deployBtnText: 'Running',
            deployEnabled: false,
            finished: false
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
        console.log("Start playbook and set up timer");
        setInterval(this.getPlaybookState, 2000);
    }

    getPlaybookState = () => {
        console.log("fetch state from the playbook run");
    }

    render() {
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

        return (

            <div id="deploy" className={this.props.className}>

                <h3>Deploy the Cluster</h3>
                You are now ready to start the deployment process. <br />
                All the options you've chosen will be saved to disk, and the deployment engine (Ansible) invoked
                 to configure your hosts. Deployment progress will be shown below.<br />
                <div className="spacer" />
                <button className="btn btn-primary btn-lg btn-offset" disabled={!this.state.deployEnabled} onClick={this.deployBtnHandler}>{this.state.deployBtnText}</button>
                { spinner }
                <div className="divCenter">
                    <div className="separatorLine" />
                </div>
                <ExecutionProgress />
                <FailureSummary />
                {/* <div style={{border: "1px solid red", width: "100%"}}>hello</div> */}
                <NextButton btnText="Finish" disabled={!this.state.finished} action={this.props.action} />

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
        // tried using rowSpan, but it doesn't render correctly, so switched to
        // multiple side-by-side divs
        return (
            <div>
                <div style={{float: "left"}}>
                    <table className="playbook-table">
                        <tbody>
                            <tr>
                                <td className="task-title">Completed Tasks</td>
                                <td className="task-data aligned-right">59</td>
                            </tr>
                            <tr>
                                <td className="task-title">Skipped</td>
                                <td className="task-data aligned-right">0</td>
                            </tr>
                            <tr>
                                <td className="task-title">Task Failures</td>
                                <td className="task-data aligned-right">0</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="task-title aligned-right float-left" >
                Current Task:
                </div>
                <div className="float-left" >
                Doing something magical<br />on multiple lines<br />
                </div>
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
        var failureRows = (
            <FailureDetail
                hostname="ceph-1"
                errorText="Something went wrong!"
            />
        );

        return (
            <div id="failures">
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
