import React from 'react';
import { NextButton } from './common/nextbutton.jsx';
import { RadioSet } from './common/radioset.jsx';
import { arrayIntersect, netSummary } from '../services/utils.js';
import '../app.scss';

export class NetworkPage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            publicNetwork: '',
            clusterNetwork: ''
        };
        this.internalNetworks = [];
        this.externalNetworks = [];
        this.subnetLookup = {};
    }

    componentWillReceiveProps(props) {
        // pick up the state change from the parent
        console.log("props received, calculate the networks");

        let osdSubnets = []; // subnets present on OSD hosts
        let allSubnets = []; // subnets present on all hosts
        var speed;
        // goal is to have a lookup table like this
        // subnet -> speed -> array of hosts with that speed
        for (let idx = 0; idx < props.hosts.length; idx++) {
            if (props.hosts[idx].hasOwnProperty('subnets')) {
                allSubnets.push(props.hosts[idx].subnets);
                // process each subnet
                for (let subnet of props.hosts[idx].subnets) {
                    if (!Object.keys(this.subnetLookup).includes(subnet)) {
                        this.subnetLookup[subnet] = {};
                    }
                    let speedInt = props.hosts[idx].subnet_details[subnet].speed;
                    if (speedInt <= 0) {
                        console.log("speed is <= 0");
                        speed = 'Unknown';
                    } else {
                        console.log("speed is >0 ");
                        speed = speedInt.toString();
                    }
                    let spds = Object.keys(this.subnetLookup[subnet]);
                    let snet = this.subnetLookup[subnet];
                    if (!spds.includes(speed)) {
                        snet[speed] = [props.hosts[idx].hostname];
                    } else {
                        snet[speed].push(props.hosts[idx].hostname);
                    }
                }

                if (props.hosts[idx]['osd']) {
                    // this is an OSD host
                    osdSubnets.push(props.hosts[idx].subnets);
                }
            }
            console.log(JSON.stringify(props.hosts[idx].subnet_details));
        }
        // console.log("subnet lookup table: " + JSON.stringify(subnetLookup));
        let commonOSDSubnets = [];
        let commonSubnets = [];

        if (osdSubnets.length > 0) {
            commonOSDSubnets = arrayIntersect(osdSubnets);
        }

        if (allSubnets.length > 0) {
            commonSubnets = arrayIntersect(allSubnets);
        }

        console.log("setting subnet array state variables");
        this.internalNetworks = commonOSDSubnets;
        this.externalNetworks = commonSubnets;

        this.setState({
            clusterNetwork: commonOSDSubnets[0],
            publicNetwork: commonSubnets[0]
        });
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
                <h3>Network Configuration</h3>
                <p>The network topology plays a significant role in determining the performance of Ceph services. The ideal
                     network configuration uses a front-end (public) and backend (cluster) network topology. This approach
                     separates network load like object replication from client load. The probe performed against your hosts
                     has revealed the following networking options for the cluster and public networks.
                </p>
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
        console.log("change in the radio button set");
        console.log("lookup the subnet to determine hosts by bandwidth");
        this.setState({
            [event.target.getAttribute('name')]: event.target.value,
            selected: event.target.value,
            msg: netSummary(this.props.lookup, event.target.value, this.props.hosts)
        });
        this.props.updateHandler(this.props.name, event.target.value);
    }

    componentWillReceiveProps(props) {
        console.log("got props update");
        const {subnets} = this.state.subnets;
        if (props.subnets != subnets) {
            this.setState({
                subnets: props.subnets,
                msg: netSummary(props.lookup, props.subnets[0], props.hosts)
            });
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

        return (
            <div className="network-container">
                <h2 className="textCenter" >{this.props.title}</h2>
                <p>{this.props.description}</p>
                <RadioSet config={radioConfig} callback={this.updateState} />
                <SubnetMsg msg={this.state.msg} />
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
