import React from 'react';
import { UIButton } from './common/nextbutton.jsx';
import { buildRoles, hostsWithRoleCount, msgCount, osdCount, removeItem } from '../services/utils.js';
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
        this.networkData = {};
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
            if (roleList.includes('grafana-server')) {
                roleList = removeItem(roleList, 'grafana-server');
            }
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

            for (let host of props.config.hosts) {
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
            this.clusterData['OSD devices'] = osdCount(props.config.hosts, props.config.flashUsage);
            this.networkData['Public Network'] = props.config.publicNetwork;
            this.networkData['Cluster Network'] = props.config.clusterNetwork;

            if (props.config.rgwNetwork) {
                this.networkData['S3 Network'] = props.config.rgwNetwork;
            } else {
                this.networkData['S3 Network'] = '';
            }

            if (props.config.iscsiNetwork) {
                this.networkData['iSCSI Network'] = props.config.iscsiNetwork;
            } else {
                this.networkData['iSCSI Network'] = '';
            }

            if (props.config.metricsHost) {
                this.clusterData['Metrics Host'] = this.props.config.metricsHost;
            }
            this.hostList = JSON.parse(JSON.stringify(this.props.config.hosts));
        }
    }

    render() {
        if (this.props.className == 'page') {
            console.log("rendering reviewpage");
            return (
                <div id="review" className={this.props.className}>
                    <h3>5. Review</h3>
                    You are now ready to deploy your cluster.<br />
                    <div className="display-inline-block">
                        <StaticTable title="Environment" data={this.environmentData} align="left" />
                        <div className="review-table-whitespace" />
                        <StaticTable title="Cluster" data={this.clusterData} align="right" />
                        <div className="review-table-whitespace" />
                        <table className="display-inline-block" style={{height: "auto"}}>
                            <tbody>
                                <tr>
                                    <td>
                                        <StaticTable title="Network" data={this.networkData} align="right" />
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <StaticTable title="Cluster Readiness" data={this.validationData} align="right" />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        {/* <div className="review-table-whitespace" /> */}
                    </div>
                    <div className="host-review">
                        <HostListing
                            hosts={this.hostList}
                            clusterNetwork={this.networkData['Cluster Network']}
                            publicNetwork={this.networkData['Public Network']}
                            s3Network={this.networkData['S3 Network']}
                            iscsiNetwork={this.networkData['iSCSI Network']} />
                    </div>
                    <div className="nav-button-container">
                        <UIButton primary btnLabel="Deploy &rsaquo;" action={this.props.action} />
                        <UIButton btnLabel="&lsaquo; Back" action={this.props.prevPage} />
                    </div>
                </div>
            );
        } else {
            console.log("Skipping render of reviewpage - not active");
            return (<div id="review" className={this.props.className} />);
        }
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
                <div className="host-review-title">Storage Cluster Hosts</div>
                <table className="host-review-table">
                    <tbody>
                        { this.props.hosts.map((host, idx) => {
                            if (!host.metrics) {
                                // only build table entries for ceph hosts
                                let roles = buildRoles([host]).join(', ');
                                let specL1 = host.cpu + " CPU, " + host.ram + "GB RAM, " + host.nic + " NIC";
                                let specL2 = host.hdd + " HDD, " + host.ssd + " SSD";
                                console.log(JSON.stringify(host.subnet_details));
                                console.log(this.props.clusterNetwork);
                                console.log("net = " + JSON.stringify(host.subnet_details[this.props.clusterNetwork]));
                                let clusterNetwork = host.subnet_details[this.props.clusterNetwork].addr + " | " + host.subnet_details[this.props.clusterNetwork].devices[0].replace('ansible_', '');
                                let publicNetwork = host.subnet_details[this.props.publicNetwork].addr + " | " + host.subnet_details[this.props.publicNetwork].devices[0].replace('ansible_', '');

                                let s3Network, iscsiNetwork;
                                if (this.props.s3Network && roles.includes('rgws')) {
                                    s3Network = host.subnet_details[this.props.s3Network].addr + " | " + host.subnet_details[this.props.s3Network].devices[0].replace('ansible_', '');
                                } else { s3Network = 'N/A' }
                                if (this.props.iscsiNetwork && roles.includes('iscsigws')) {
                                    iscsiNetwork = host.subnet_details[this.props.iscsiNetwork].addr + " | " + host.subnet_details[this.props.iscsiNetwork].devices[0].replace('ansible_', '');
                                } else { iscsiNetwork = 'N/A' }

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
                                        <td className="host-review-table-wide"><strong>iSCSI Network</strong><br />{iscsiNetwork}</td>
                                    </tr>);
                            }
                        })}
                    </tbody>
                </table>
            </div>
        );
    }
}

export default ReviewPage;
