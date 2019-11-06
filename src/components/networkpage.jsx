import React from 'react';
import { UIButton } from './common/nextbutton.jsx';
import { RadioSet } from './common/radioset.jsx';
import { netSummary, commonSubnets, buildSubnetLookup, buildRoles, getCephHosts } from '../services/utils.js';
import '../app.scss';

export class NetworkPage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            internalNetworks: [], // suitable for cluster connectivity
            externalNetworks: [], // shared across all nodes
            s3Networks: [], // common to Radosgw hosts
            iscsiNetworks: [], // common networks to iscsi target hosts
            subnetLookup: {}, // Used for speed/bandwidth metadata
            publicNetwork: '',
            clusterNetwork: '',
            rgwNetwork: '',
            iscsiNetwork: '',
            active: false
        };
        // this.cephHosts = [];
        // this.internalNetworks = []; // suitable for cluster connectivity
        // this.externalNetworks = []; // shared across all nodes
        // this.s3Networks = []; // common to Radosgw hosts
        // this.iscsiNetworks = []; // common networks to iscsi target hosts
        // this.subnetLookup = {}; // Used for speed/bandwidth metadata
    }

    static getDerivedStateFromProps(props, state) {
        if (props.className == 'page' && !state.active) {
            let stateObject = {
                active: true
            };
            console.log("NetworkPage: page is now active");
            let cephHosts = getCephHosts(props.hosts);
            let activeRoles = buildRoles(cephHosts);

            stateObject.subnetLookup = buildSubnetLookup(cephHosts);

            if (!state.clusterNetwork) {
                stateObject.internalNetworks = commonSubnets(cephHosts, 'osd');
                stateObject.clusterNetwork = stateObject.internalNetworks[0];
            }
            if (!state.publicNetwork) {
                stateObject.externalNetworks = commonSubnets(cephHosts, 'all');
                stateObject.publicNetwork = stateObject.externalNetworks[0];
            }
            if (!state.rgwNetwork && activeRoles.includes('rgws')) {
                stateObject.s3Networks = commonSubnets(cephHosts, 'rgw');
                stateObject.rgwNetwork = stateObject.s3Networks[0];
            }
            if (!state.iscsiNetwork && activeRoles.includes('iscsigws')) {
                stateObject.iscsiNetworks = commonSubnets(cephHosts, 'iscsi');
                stateObject.iscsiNetwork = stateObject.iscsiNetworks[0];
            }

            return stateObject;
        } else {
            console.log("NetworkPage: page is inactive");
            return null;
        }
    }

    // updateNetworkSubnets = () => {
    //     this.cephHosts = getCephHosts(this.props.hosts);

    //     let activeRoles = buildRoles(this.cephHosts);

    //     console.log("NetworkPage: setting subnet array state variables");
    //     this.internalNetworks = commonSubnets(this.cephHosts, 'osd');
    //     this.externalNetworks = commonSubnets(this.cephHosts, 'all');
    //     if (activeRoles.includes('rgws')) {
    //         this.s3Networks = commonSubnets(this.cephHosts, 'rgw');
    //     }
    //     if (activeRoles.includes('iscsigws')) {
    //         this.iscsiNetworks = commonSubnets(this.cephHosts, 'iscsi');
    //     }
    //     this.subnetLookup = buildSubnetLookup(this.cephHosts);
    // }

    updateParent = () => {
        console.log("NetworkPage: pass network state back to the parent - installationsteps state");
        this.setState({
            active: false
        });
        this.props.action(this.state);
    }

    updateHandler = (name, value) => {
        console.log("NetworkPage: subnet change for " + name + " with " + value);
        this.setState({[name]: value});
    }

    render() {
        if (this.state.active) {
            console.log("NetworkPage: rendering");
            // this.updateNetworkSubnets();
            // console.log("NetworkPage: internal subnets " + JSON.stringify(this.internalNetworks));
            // console.log("NetworkPage: external subnets " + JSON.stringify(this.externalNetworks));
            // console.log("NetworkPage: s3 subnets " + JSON.stringify(this.s3Networks));
            // console.log("NetworkPage: iscsi subnets " + JSON.stringify(this.iscsiNetworks));
            return (
                <div id="network" className={this.props.className}>
                    <h3>4. Network Configuration</h3>
                    <p>The network topology plays a significant role in determining the performance of Ceph services. An optimum
                        network configuration uses a front-end (public) and backend (cluster) network topology. This strategy
                        separates network loads like object replication from client workload (I/O). The probe performed against
                        your hosts has revealed the following networking options;
                    </p>
                    <div className="centered-container">
                        <NetworkOptions
                            title="Cluster Network"
                            description="Subnets common to OSD hosts"
                            subnets={this.state.internalNetworks}
                            selected={this.state.clusterNetwork}
                            name="clusterNetwork"
                            lookup={this.state.subnetLookup}
                            hosts={this.props.hosts}
                            updateHandler={this.updateHandler} />
                        <NetworkOptions
                            title="Public Network"
                            description="Subnets common to all hosts"
                            subnets={this.state.externalNetworks}
                            selected={this.state.publicNetwork}
                            name="publicNetwork"
                            lookup={this.state.subnetLookup}
                            hosts={this.props.hosts}
                            updateHandler={this.updateHandler} />
                        <NetworkOptions
                            title="S3 Client Network"
                            description="Subnets common to radosgw hosts"
                            subnets={this.state.s3Networks}
                            selected={this.state.rgwNetwork}
                            name="rgwNetwork"
                            lookup={this.state.subnetLookup}
                            hosts={this.props.hosts}
                            updateHandler={this.updateHandler} />
                        <NetworkOptions
                            title="iSCSI Target Network"
                            description="Subnets common to iSCSI hosts"
                            subnets={this.state.iscsiNetworks}
                            selected={this.state.iscsiNetwork}
                            name="iscsiNetwork"
                            lookup={this.state.subnetLookup}
                            hosts={this.props.hosts}
                            updateHandler={this.updateHandler} />

                    </div>
                    <div className="nav-button-container">
                        <UIButton primary btnLabel="Review &rsaquo;" action={this.updateParent} />
                        <UIButton btnLabel="&lsaquo; Back" action={this.props.prevPage} />
                    </div>
                </div>
            );
        } else {
            console.log("Skipping render of Networkpage - not active");
            return (<div id="network" className={this.props.className} />);
        }
    }
}

export class NetworkOptions extends React.Component {
    constructor(props) {
        super(props);
        let cephHosts = getCephHosts(this.props.hosts);
        this.state = {
            cephHosts: cephHosts,
            selected: props.selected,
            msg: netSummary(this.props.lookup, this.props.subnets[0], cephHosts)
        };
    }

    updateState = (event) => {
        console.log("NetworkOptions: change in the radio button set " + event.target.name);
        console.log("NetworkOptions: lookup the subnet to determine hosts by bandwidth: " + event.target.value);
        // console.log("lookup table is " + JSON.stringify(this.props.lookup));
        this.setState({
            [event.target.getAttribute('name')]: event.target.value,
            selected: event.target.value,
            msg: netSummary(this.props.lookup, event.target.value, this.state.cephHosts)
        });
        this.props.updateHandler(this.props.name, event.target.value);
    }

    render() {
        let default_subnet;
        if (this.state.selected) {
            default_subnet = this.state.selected;
        } else {
            default_subnet = this.props.subnets[0];
        }

        var radioConfig = {
            desc: this.props.description,
            options: this.props.subnets,
            default: default_subnet,
            name: this.props.name,
            horizontal: false
        };

        var subnetSelection;
        if (this.props.subnets.length > 0) {
            subnetSelection = (
                <div className="float-left network-subnets">
                    <h4 className="textCenter" ><b>{this.props.title}</b></h4>
                    <p>{this.props.description}</p>
                    <RadioSet config={radioConfig} default={radioConfig.default} callback={this.updateState} />
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
