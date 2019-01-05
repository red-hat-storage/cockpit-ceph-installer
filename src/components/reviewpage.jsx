import React from 'react';
import { UIButton } from './common/nextbutton.jsx';
import { buildRoles, hostsWithRoleCount, msgCount } from '../services/utils.js';
import '../app.scss';

export class ReviewPage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            className: this.props.className
        };
        this.environment = {
            flashUsage: "Flash Configuration",
            osdType: "OSD Type",
            sourceType: "Installation Source",
            clusterType: "Cluster Type",
            targetVersion: "Target Version",
            osdMode: "Encryption",
            installType: "Installation Type",
            networkType: "Network Connectivity"
        };

        this.environmentData = {};
        this.clusterData = {};
        this.validationData = {
            Error: 0,
            Warning: 0,
            Info: 0
        };
        this.hostList = [];
    }

    componentWillReceiveProps (props) {
        if (props.config.pageNum == 5) {
            console.log("review received updated props and pagenum is 5");
            let keynames = Object.keys(props.config);
            for (let key of keynames) {
                if (Object.keys(this.environment).includes(key)) {
                    this.environmentData[this.environment[key]] = props.config[key];
                }
            }

            this.clusterData['Hosts'] = props.config.hosts.length;
            let roleList = buildRoles(props.config.hosts);
            this.clusterData['Roles'] = roleList.join(', ');
            for (let role of roleList) {
                let roleName;
                switch (role) {
                case "iscsigws":
                    roleName = 'iscsi';
                    break;
                default:
                    roleName = role.slice(0, -1);
                }
                this.clusterData["- " + role] = hostsWithRoleCount(props.config.hosts, roleName);
            }
            let osdCount = 0;

            for (let host of props.config.hosts) {
                switch (props.config.flashUsage) {
                case "OSD Data":
                    osdCount += host.ssd;
                    break;
                default:
                    osdCount += host.hdd;
                }
                let msgStats = msgCount(host.msgs);
                for (let mType of Object.keys(msgStats)) {
                    let mTypeKey = mType.charAt(0).toUpperCase() + mType.slice(1);
                    // console.log(msgType);
                    if (this.validationData.hasOwnProperty(mTypeKey)) {
                        this.validationData[mTypeKey] += msgStats[mType];
                    } else {
                        this.validationData[mTypeKey] = msgStats[mType];
                    }
                }
                console.log(JSON.stringify(msgStats));
            }
            this.clusterData['OSD devices'] = osdCount;
            this.clusterData['Public Network'] = props.config.publicNetwork;
            this.clusterData['Cluster Network'] = props.config.clusterNetwork;
            if (props.config.rgwNetwork) {
                this.clusterData['S3 Network'] = props.config.rgwNetwork;
            } else {
                this.clusterData['S3 Network'] = '';
            }

            this.hostList = JSON.parse(JSON.stringify(this.props.config.hosts));
        }
    }

    render() {
        console.log("in review render");
        return (

            <div id="review" className={this.props.className}>
                <h3>5. Review</h3>
                You are now ready to deploy your cluster.<br />
                <div className="display-inline-block">
                    <StaticTable title="Environment" data={this.environmentData} align="left" />
                    <div className="review-table-whitespace" />
                    <StaticTable title="Cluster" data={this.clusterData} align="right" />
                    <div className="review-table-whitespace" />
                    <StaticTable title="Cluster Readiness" data={this.validationData} align="right" />
                </div>
                <div className="host-review">
                    <HostListing
                        hosts={this.hostList}
                        clusterNetwork={this.clusterData['Cluster Network']}
                        publicNetwork={this.clusterData['Public Network']}
                        s3Network={this.clusterData['S3 Network']} />
                </div>
                <div className="nav-button-container">
                    <UIButton primary btnLabel="Deploy &rsaquo;" action={this.props.action} />
                    <UIButton btnLabel="&lsaquo; Back" action={this.props.prevPage} />
                </div>
            </div>
        );
    }
}

class StaticTable extends React.Component {
    render () {
        console.log("in Table render - with " + JSON.stringify(this.props.data));
        return (
            <div className="review-table-container">
                <table className="review-table">
                    <caption>{this.props.title}</caption>
                    <tbody>
                        {
                            Object.keys(this.props.data).map((item, key) => {
                                let align = "review-table-value align-" + this.props.align;
                                let itemValue;
                                let tab = (<div />);
                                if (item.startsWith('-')) {
                                    tab = (<div className="tab" />);
                                }
                                itemValue = (this.props.data[item] === '') ? 'N/A' : this.props.data[item];

                                return (
                                    <tr key={key}>
                                        <td className="review-table-label align-left">{tab}{item}</td>
                                        <td className={align}>{itemValue}</td>
                                    </tr>);
                            })
                        }
                    </tbody>
                </table>
            </div>
        );
    }
}

class HostListing extends React.Component {
    render () {
        console.log("in hostlisting render");
        return (
            <div>
                <div className="host-review-title">Hosts</div>
                <table className="host-review-table">
                    <tbody>
                        { this.props.hosts.map((host, idx) => {
                            let roles = buildRoles([host]).join(', ');
                            let specL1 = host.cpu + " CPU, " + host.ram + " RAM, " + host.nic + " NIC";
                            let specL2 = host.hdd + " HDD, " + host.ssd + " SSD";
                            console.log(JSON.stringify(host.subnet_details));
                            console.log(this.props.clusterNetwork);
                            console.log("net = " + JSON.stringify(host.subnet_details[this.props.clusterNetwork]));
                            let clusterNetwork = host.subnet_details[this.props.clusterNetwork].addr + " | " + host.subnet_details[this.props.clusterNetwork].devices[0];
                            let publicNetwork = host.subnet_details[this.props.publicNetwork].addr + " | " + host.subnet_details[this.props.publicNetwork].devices[0];
                            let s3Network;
                            if (this.props.s3Network && roles.includes('rgws')) {
                                s3Network = host.subnet_details[this.props.s3Network].addr + " | " + host.subnet_details[this.props.s3Network].devices[0];
                            } else {
                                s3Network = 'N/A';
                            }
                            return (
                                <tr key={idx}>
                                    <td className="host-review-table-wide">
                                        <strong>{host.hostname}</strong><br />
                                        {host.vendor}&nbsp;{host.model}
                                    </td>
                                    <td className="host-review-table-std">{specL1}<br />{specL2}</td>
                                    <td className="host-review-table-std">{roles}</td>
                                    <td className="host-review-table-wide"><strong>Cluster Network</strong><br />{clusterNetwork}</td>
                                    <td className="host-review-table-wide"><strong>Public Network</strong><br />{publicNetwork}</td>
                                    <td className="host-review-table-wide"><strong>S3 Network</strong><br />{s3Network}</td>
                                </tr>);
                        })}
                    </tbody>
                </table>
            </div>
        );
    }
}

export default ReviewPage;
