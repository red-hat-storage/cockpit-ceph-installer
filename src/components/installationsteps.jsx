import React from 'react';
import '../app.scss';
import WelcomePage from './welcomepage.jsx';
import EnvironmentPage from './environmentpage.jsx';
import HostsPage from './hostspage.jsx';
import ValidatePage from './validatepage.jsx';
import NetworkPage from './networkpage.jsx';
import DeployPage from './deploypage.jsx';
import ProgressTracker from './progresstracker.jsx';
import InfoBar from './infobar.jsx';

export class InstallationSteps extends React.Component {
    constructor(props) {
        super(props);
        this.nextHandler = this.nextHandler.bind(this);
        this.jumpToPageHandler = this.jumpToPageHandler.bind(this);
        this.state = {
            pageNum: 0,
            lastPage: 0,
            hosts: [],
            osdType: "Bluestore",
            sourceType: "Red Hat",
            clusterType: "Production",
            targetVersion: "RHCS 3.1",
            osdMode: "Standard",
            installType: "RPM",
            flashUsage: "Journals/Logs",
            publicNetwork: '',
            clusterNetwork: '',
            networkType: 'ipv4',
            deployStarted: false
        };
        this.page = {
            welcome: "page",
            environment: "page behind",
            hosts: "page behind",
            validate: "page behind",
            network: "page behind",
            // commit: "page behind",
            deploy: "page behind"
            // finish: "page behind"
        };
        this.infoText = [
            "",
            "The environment settings define the basic constraints that will apply to the target Ceph cluster",
            "Enter the hostnames using either the hostname or a hostname pattern to " +
                "define a range (e.g. node-[1-5] defines node-1,node-2,node-3 etc)",
            "By probing the hosts, we can check that there are enough hardware resources to" +
                " support the intended Ceph roles. It also allows you to visually check the" +
                " detected devices and configuration are as expected. Once probed, you may" +
                " hover over the hostname to show the hardware model name of the server."
        ];
        this.visited = [];
    }

    deployCluster() {
        console.log("go deploy the cluster");
        console.log("Current state is " + JSON.stringify(this.state));
        // console.log("Current config is " + JSON.stringify(this.config));
    }

    deployHandler = () => {
        // invoked when the user clicks on deploy
        this.setState({deployStarted: true});
    }

    nextHandler (param) {
        if (param !== undefined) {
            if (param.constructor === {}.constructor) {
                // this is a json object
                let stateObject = param;
                // console.log(JSON.stringify(stateObject));
                console.log("Lets apply the settings to the parents config object");
                if ('className' in stateObject) {
                    console.log("removing className attribute");
                    delete stateObject['className'];
                }
                // this.config = Object.assign(this.config, stateObject);
                // console.log("installation config holds: " + JSON.stringify(this.config));
                let keys = Object.keys(stateObject);
                for (var k of keys) {
                    console.log("processing key : " + k + " value of " + JSON.stringify(stateObject[k]));
                    this.setState({[k]: stateObject[k]});
                }
                // this.config = Object.assign(this.config, stateObject);
                // console.log("installation config holds: " + JSON.stringify(this.config));
                console.log("installation state updated with: " + JSON.stringify(stateObject));
            }
        }
        let current = this.state.pageNum;
        let newPage = current + 1;
        if (current < 5) {
            if (!this.visited.includes(newPage)) {
                this.visited.push(newPage);
            }

            this.setState({
                pageNum: newPage,
                lastPage: current
            });
        } else {
            // clicked next on the last page
            this.deployCluster();
        }
    }

    jumpToPageHandler (param) {
        if (!this.state.deployStarted) {
            if (this.visited.includes(param)) {
                console.log("jump to already visited page " + param + " requested");
                let current = this.state.pageNum;
                if (param < current) {
                    this.setState({
                        pageNum: param,
                        lastPage: current
                    });
                } else {
                    console.error("can't jump forward - need to use the next button to ensure state changes propogate correctly");
                }
            } else {
                console.log("jump to page " + param + " denied - not been there yet!");
            }
        } else {
            console.log("attempt to navigate back is blocked while a deployment has started/is running");
        }
    }

    render() {
        console.log("rendering installationpage: state - " + JSON.stringify(this.state));
        console.log("Page counter is " + this.state.pageNum);

        let oldPage = Object.keys(this.page)[this.state.lastPage];
        console.log("old page is " + oldPage);
        let newPage = Object.keys(this.page)[this.state.pageNum];
        console.log("new page is " + newPage);

        this.page[oldPage] = "page behind";
        this.page[newPage] = "page";
        console.log(this.page);
        return (
            <div>
                <ProgressTracker
                    pageNum={this.state.pageNum}
                    pageSwitcher={this.jumpToPageHandler} />
                <div id="installPages">
                    <WelcomePage
                        className={this.page['welcome']}
                        action={this.nextHandler} />
                    <EnvironmentPage
                        className={this.page['environment']}
                        action={this.nextHandler} />
                    <HostsPage
                        className={this.page['hosts']}
                        action={this.nextHandler}
                        hosts={this.state.hosts}
                        installType={this.state.installType}
                        clusterType={this.state.clusterType}
                        svctoken={this.props.svctoken} />
                    <ValidatePage
                        className={this.page['validate']}
                        action={this.nextHandler}
                        hosts={this.state.hosts}
                        clusterType={this.state.clusterType}
                        installType={this.state.installType}
                        flashUsage={this.state.flashUsage}
                        svctoken={this.props.svctoken} />
                    <NetworkPage
                        className={this.page['network']}
                        action={this.nextHandler}
                        hosts={this.state.hosts} />
                    <DeployPage
                        className={this.page['deploy']}
                        action={this.nextHandler}
                        settings={this.state}
                        deployHandler={this.deployHandler}
                        modalHandler={this.props.modalHandler}
                        svctoken={this.props.svctoken} />
                </div>
                <InfoBar
                     info={this.infoText[this.state.pageNum] || ''} />
            </div>
        );
    }
}

export default InstallationSteps;
