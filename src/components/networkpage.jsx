import React from 'react';
import { NextButton } from './common/nextbutton.jsx';
import { RadioSet } from './common/radioset.jsx';
import { netSummary, commonSubnets, buildSubnetLookup, buildRoles } from '../services/utils.js';
import '../app.scss';

export class NetworkPage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            publicNetwork: '',
            clusterNetwork: '',
            rgwNetwork: ''
        };
        this.internalNetworks = []; // suitable for cluster connectivity
        this.externalNetworks = []; // shared across all nodes
        this.s3Networks = []; // common to Radosgw hosts
        this.subnetLookup = {}; // Used for speed/bandwidth metadata
    }

    componentWillReceiveProps(props) {
        if (props.className == 'page') {
            // the page is active, so refresh the items with updated props
            // from the parent

            console.log("setting subnet array state variables");
            this.internalNetworks = commonSubnets(props.hosts, 'osd');
            this.externalNetworks = commonSubnets(props.hosts, 'all');
            this.subnetLookup = buildSubnetLookup(props.hosts);
            let netState = {};

            netState['clusterNetwork'] = this.internalNetworks[0];
            netState['publicNetwork'] = this.externalNetworks[0];

            if (buildRoles(props.hosts).includes('rgws')) {
                console.log("determining the rgw networks");
                this.s3Networks = commonSubnets(props.hosts, 'rgw');
                netState['rgwNetwork'] = this.s3Networks[0];
            } else {
                console.log("no rgw role seen across the hosts");
                this.s3Networks = [];
                netState['rgwNetwork'] = '';
            }

            this.setState(netState);
        }
    }

    updateParent = () => {
        console.log("pass network state back to the parent - installationsteps state");
        this.props.action(this.state);
    }

    updateHandler = (name, value) => {
        console.log("subnet change for " + name + " with " + value);
        this.setState({[name]: value});
    }

    render() {
        console.log("rendering network page");

        return (
            <div id="network" className={this.props.className}>
                <h3>4. Network Configuration</h3>
                <p>The network topology plays a significant role in determining the performance of Ceph services. The ideal
                     network configuration uses a front-end (public) and backend (cluster) network topology. This approach
                     separates network load like object replication from client load. The probe performed against your hosts
                     has revealed the following networking options;
                </p>
                <div className="centered-container">
                    <NetworkOptions
                        title="Cluster Network"
                        description="Subnets common to all OSD hosts"
                        subnets={this.internalNetworks}
                        name="clusterNetwork"
                        lookup={this.subnetLookup}
                        hosts={this.props.hosts}
                        updateHandler={this.updateHandler} />
                    <NetworkOptions
                        title="Public Network"
                        description="Subnets common to all hosts within the cluster"
                        subnets={this.externalNetworks}
                        name="publicNetwork"
                        lookup={this.subnetLookup}
                        hosts={this.props.hosts}
                        updateHandler={this.updateHandler} />
                    <NetworkOptions
                        title="S3 Client Network"
                        description="Subnets common to radosgw hosts"
                        subnets={this.s3Networks}
                        name="rgwNetwork"
                        lookup={this.subnetLookup}
                        hosts={this.props.hosts}
                        updateHandler={this.updateHandler} />
                </div>

                <NextButton action={this.updateParent} />
            </div>
        );
    }
}

export class NetworkOptions extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            selected: null,
            subnets: [],
            msg: []
        };
    }

    updateState = (event) => {
        console.log("change in the radio button set " + event.target.name);
        console.log("lookup the subnet to determine hosts by bandwidth: " + event.target.value);
        // console.log("lookup table is " + JSON.stringify(this.props.lookup));
        this.setState({
            [event.target.getAttribute('name')]: event.target.value,
            selected: event.target.value,
            msg: netSummary(this.props.lookup, event.target.value, this.props.hosts)
        });
        this.props.updateHandler(this.props.name, event.target.value);
    }

    componentWillReceiveProps(props) {
        console.log("checking to see if subnet list need to change: " + props.name);
        var subnets = this.state.subnets.sort();
        // console.log("comparing " + JSON.stringify(props.subnets) + " to " + JSON.stringify(subnets));
        if (JSON.stringify(props.subnets.sort()) != JSON.stringify(subnets)) {
            console.log("- initialising the radio set");
            this.setState({
                subnets: props.subnets,
                msg: netSummary(props.lookup, props.subnets[0], props.hosts)
            });
        } else {
            console.log("no change in subnets");
        }
    }

    render() {
        var radioConfig = {
            desc: this.props.description,
            options: this.state.subnets,
            default: this.state.subnets[0],
            name: this.props.name,
            horizontal: false
        };
        var subnetSelection;
        if (this.state.subnets.length > 0) {
            subnetSelection = (
                <div className="float-left network-subnets">
                    <h4 className="textCenter" ><b>{this.props.title}</b></h4>
                    <p>{this.props.description}</p>
                    <RadioSet config={radioConfig} callback={this.updateState} />
                    <SubnetMsg msg={this.state.msg} />
                </div>

            );
        } else {
            subnetSelection = (
                <div />
            );
        }
        return (
            <div>
                { subnetSelection }
            </div>
        );
    }
}
export class SubnetMsg extends React.Component {
    render() {
        var msgs;
        msgs = this.props.msg.map((m, i) => {
            return <div key={i}>{m}</div>;
        });
        return (
            <div className="network-msgs">
                { msgs }
            </div>
        );
    }
}

export default NetworkPage;
