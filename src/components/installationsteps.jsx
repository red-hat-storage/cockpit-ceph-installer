import React from 'react';
import '../app.scss';
import WelcomePage from './welcomepage.jsx';
import EnvironmentPage from './environmentpage.jsx';
import HostsPage from './hostspage.jsx';
import ValidatePage from './validatepage.jsx';
import NetworkPage from './networkpage.jsx';
import ReviewPage from './reviewpage.jsx';
import DeployPage from './deploypage.jsx';
import ProgressTracker from './progresstracker.jsx';
import InfoBar from './infobar.jsx';

export class InstallationSteps extends React.Component {
    //
    // This is the main page that loads all the page components into the DOM
    //
    constructor(props) {
        super(props);
        this.state = {
            pageNum: 0,
            lastPage: 0,
            hosts: [],
            iscsiTargetName: props.defaults.iscsiTargetName,
            sourceType: props.defaults.sourceType,
            targetVersion: props.defaults.targetVersion,
            clusterType: props.defaults.clusterType,
            installType: props.defaults.installType,
            networkType: props.defaults.networkType,
            osdType: props.defaults.osdType,
            osdMode: props.defaults.osdMode,
            flashUsage: props.defaults.flashUsage,
            publicNetwork: '',
            clusterNetwork: '',
            rgwNetwork:'',
            metricsHost: '',
            deployStarted: false,
            cockpitHost: props.defaults.cockpitHost,
            cephVersion: ''
        };

        // define the classes the pages will initially use on first render. If behind is defined,
        // the page will be hidden.
        this.page = {
            welcome: "page",
            environment: "page behind",
            hosts: "page behind",
            validate: "page behind",
            network: "page behind",
            review: "page behind",
            deploy: "page behind"
        };
        this.infoText = [
            "",
            "The environment settings define the basic constraints that will apply to the target Ceph cluster.",
            "Enter the hostnames using either the hostname or a hostname pattern to " +
                "define a range (e.g. node-[1-5] defines node-1,node-2,node-3 etc).",
            "By probing the hosts, we can check that there are enough hardware resources to" +
                " support the intended Ceph roles. It also allows you to visually check the" +
                " detected devices and configuration are as expected. Once probed, you may" +
                " hover over the hostname to show the hardware model name of the server.",
            "Separating network traffic across multiple subnets is a recommeded best practice" +
                " for performance and fault tolerance.",
            "Review the configuration information that you have provided, prior to moving to installation. Use" +
                " the back button to return to prior pages to change your selections.",
            "When you click 'Save', the Ansible settings will be committed to disk using standard" +
                " Ansible formats. This allows you to refer to or modify these settings before" +
                " starting the deployment."
        ];
        this.visited = [];
    }

    deployCluster() {
        console.log("go deploy the cluster");
        console.log("Current state is " + JSON.stringify(this.state));
    }

    deployHandler = () => {
        // invoked when the user clicks on deploy
        this.setState({deployStarted: true});
    }

    setMetricsHost = (hostname) => {
        this.setState({
            metricsHost: hostname
        });
    }

    updateState = (param) => {
        //
        // Handles applying state changes from child components to the local state
        let ignoredKeys = ['className', 'modalVisible', 'modalContent'];

        console.log("Updating state");
        if (param !== undefined) {
            if (param.constructor === {}.constructor) {
                // this is a json object
                let stateObject = param;
                console.log("Lets apply the settings to the parents config object");

                let keys = Object.keys(stateObject);
                for (var k of keys) {
                    if (ignoredKeys.includes(k)) {
                        console.log("skipping update for key: " + k);
                    } else {
                        console.log("processing key : " + k + " value of " + JSON.stringify(stateObject[k]));
                        this.setState({[k]: stateObject[k]});
                    }
                }
                console.log("installation state updated with: " + JSON.stringify(stateObject));
            }
        }
    }

    nextHandler = (param) => {
        this.updateState(param);

        let current = this.state.pageNum;
        let newPage = current + 1;
        if (current < 6) {
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

    prevPageHandler = (param) => {
        console.log("return to prior page");
        if (param != undefined) {
            if (param.constructor === {}.constructor) {
                console.log("received " + JSON.stringify(param));
                this.updateState(param);
            }
        }

        let current = this.state.pageNum;
        this.setState({
            pageNum: current - 1,
            lastPage: current
        });
    }

    render() {
        let oldPage = Object.keys(this.page)[this.state.lastPage];
        console.log("old page is " + oldPage);
        let newPage = Object.keys(this.page)[this.state.pageNum];
        console.log("new page is " + newPage);

        this.page[oldPage] = "page behind";
        this.page[newPage] = "page";
        console.log(this.page);
        return (
            <div>
                <ProgressTracker pageNum={this.state.pageNum} />
                <div id="installPages">
                    <WelcomePage
                        className={this.page['welcome']}
                        action={this.nextHandler} />
                    <EnvironmentPage
                        className={this.page['environment']}
                        defaults={this.props.defaults}
                        action={this.nextHandler} />
                    <HostsPage
                        className={this.page['hosts']}
                        action={this.nextHandler}
                        metricsHostHandler={this.setMetricsHost}
                        prevPage={this.prevPageHandler}
                        hosts={this.state.hosts}
                        cephVersion={this.state.cephVersion}
                        installType={this.state.installType}
                        clusterType={this.state.clusterType} />
                    <ValidatePage
                        className={this.page['validate']}
                        action={this.nextHandler}
                        prevPage={this.prevPageHandler}
                        hosts={this.state.hosts}
                        clusterType={this.state.clusterType}
                        installType={this.state.installType}
                        osdType={this.state.osdType}
                        flashUsage={this.state.flashUsage} />
                    <NetworkPage
                        className={this.page['network']}
                        action={this.nextHandler}
                        prevPage={this.prevPageHandler}
                        modalHandler={this.props.modalHandler}
                        hosts={this.state.hosts} />
                    <ReviewPage
                        className={this.page['review']}
                        action={this.nextHandler}
                        prevPage={this.prevPageHandler}
                        config={this.state} />
                    <DeployPage
                        className={this.page['deploy']}
                        action={this.nextHandler}
                        prevPage={this.prevPageHandler}
                        settings={this.state}
                        deployHandler={this.deployHandler}
                        modalHandler={this.props.modalHandler} />
                </div>
                <InfoBar
                     info={this.infoText[this.state.pageNum] || ''} />
            </div>
        );
    }
}

export default InstallationSteps;
