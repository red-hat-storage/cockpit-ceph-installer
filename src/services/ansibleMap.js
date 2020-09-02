import { hostsWithRoleCount } from "./utils.js";

export function hostVars(hostMetadata, flashUsage) {
    // gets run once per host to generate the hostvars variables
    console.log("hostvars called with " + JSON.stringify(hostMetadata));
    console.log("and " + flashUsage);
    let forYML = {};
    if (flashUsage.startsWith('OSD')) {
        if (hostMetadata.ssd_devices.length > 0) {
            forYML.devices = hostMetadata.ssd_devices.map(d => "/dev/" + d);
            return forYML;
        } else {
            // flash as osd selected but no ssd devices listed. We'll fall through
            // to the hdd handling logic
        }
    }

    if (hostMetadata.hdd_devices.length > 0) {
        forYML.devices = hostMetadata.hdd_devices.map(d => "/dev/" + d);

        if (hostMetadata.ssd_devices.length > 0) {
            forYML.dedicated_devices = [];
            var fastDevice = hostMetadata.ssd_devices.shift();
            var shareLimit = (fastDevice.startsWith('nvm')) ? 10 : 5;
            let shareCount = 0;

            for (let i = 0; i < hostMetadata.hdd_devices.length; i++) {
                forYML.dedicated_devices.push("/dev/" + fastDevice);
                shareCount++;
                if (shareCount == shareLimit) {
                    fastDevice = hostMetadata.ssd_devices.shift();
                    shareLimit = (fastDevice.startsWith('nvm')) ? 10 : 5;
                    shareCount = 0;
                }
            }
        }
    }

    return forYML;
}

export function osdsVars (vars) {
    // gets run once for osds.yml
    let forYML = {
        osd_auto_discovery: false
    };
    if (vars.osdMode == 'Encrypted') {
        forYML.dmcrypt = true;
    }

    if (vars.osdType == 'BlueStore') {
        forYML.osd_objectstore = 'bluestore';
    } else {
        forYML.osd_objectstore = 'filestore';
    }

    let hosts = vars.hosts;

    // assume Homogeneous configurations
    // look through the hosts for osd roles, and check for presence of ssd and hdd
    let mixed = false;
    for (let host of hosts) {
        if (host.osd) {
            if (host.hdd_devices.length > 0 && host.ssd_devices.length > 0) {
                mixed = true;
                break;
            }
        }
    }

    switch (vars.cephVersion) {
    case "14":
        // ceph-volume based OSDs
        forYML.osd_scenario = 'lvm';
        break;
    default:
        // Older Ceph versions based on ceph-disk not ceph-volume
        if (mixed && vars.flashUsage.startsWith("Journal")) {
            forYML.osd_scenario = 'non-collocated';
        } else {
            forYML.osd_scenario = "collocated";
        }
    }

    return forYML;
}

export function allVars (vars) {
    let forYML = {};

    switch (vars.sourceType) {
    case "Community":
        forYML.ceph_repository = "community";
        forYML.ceph_origin = "repository";
        forYML.ceph_version_num = parseInt(vars.cephVersion);
        forYML.ceph_stable_release = vars.targetVersion.split('(')[1].slice(0, -1).toLowerCase(); // nautilus
        break;
    case "Red Hat":
        forYML.ceph_repository = "rhcs";
        forYML.ceph_repository_type = 'cdn';
        forYML.ceph_origin = "repository";
        forYML.ceph_rhcs_version = parseInt(vars.targetVersion.split(' ')[1]); // 3 or 4
        break;
    case "Distribution":
        forYML.ceph_origin = "distro";
        break;
    case "ISO":
        // ISO installation requested - assumes an RHCS 4 install
        forYML.ceph_origin = "repository";
        forYML.ceph_repository = 'rhcs';
        forYML.ceph_repository_type = 'iso';
        forYML.ceph_rhcs_version = 4;
        forYML.ceph_rhcs_iso_path = '/usr/share/ansible-runner-service/iso/' + vars.targetVersion;
        break;
    }

    if (parseInt(vars.cephVersion) >= 14) {
        forYML.dashboard_enabled = true;
        forYML.dashboard_admin_password = vars.dashboardPassword;
        forYML.grafana_admin_password = vars.grafanaPassword;
    }

    if (forYML.ceph_repository === "rhcs" && parseInt(vars.cephVersion) >= 14) {
        forYML.ceph_docker_registry = 'registry.redhat.io'; // authenticated registry
        forYML.ceph_docker_registry_auth = true;
        forYML.ceph_docker_image = vars.rhcs_ceph_image;
        forYML.ceph_docker_registry_username = vars.rhLogin;
        forYML.ceph_docker_registry_password = vars.rhToken;
        forYML.node_exporter_container_image = vars.rhcs_node_exporter_image;
        forYML.grafana_container_image = vars.rhcs_grafana_image;
        forYML.prometheus_container_image = vars.rhcs_prometheus_image;
        forYML.alertmanager_container_image = vars.rhcs_alertmanager_image;
    }

    switch (vars.installType) {
    case "Container":
        forYML.containerized_deployment = true;
        forYML.docker_pull_timeout = "600s"; // workaround for slow networks

        if (vars.sourceType === "Red Hat") {
            let vers = parseInt(vars.targetVersion.split(' ')[1]); // 3 or 4
            if (vers == 3) {
                forYML.ceph_docker_image = 'rhceph/rhceph-3-rhel7';
                forYML.ceph_docker_registry = 'registry.access.redhat.com';
            } else {
                forYML.ceph_docker_image = vars.rhcs_ceph_image;
                forYML.ceph_docker_image_tag = 'latest';
            }
        }

        break;
    default:
        // RPM deployment
        if (forYML.ceph_repository === "rhcs") {
            if (vars.sourceType != "ISO") {
                forYML.ceph_repository_type = "cdn";
            }
        }
        forYML.containerized_deployment = false;
    }

    if (vars.rgwNetwork != '') {
        forYML.radosgw_address_block = vars.rgwNetwork;
    }

    forYML.public_network = vars.publicNetwork;
    forYML.cluster_network = vars.clusterNetwork;
    forYML.monitor_address_block = vars.clusterNetwork;
    forYML.ip_version = vars.networkType.toLowerCase();

    if (!vars.firewall) {
        forYML.configure_firewall = false;
    }

    // with only a single host, we need to change the default crush policy from 1 (host)
    // to 0 (osd)
    if (hostsWithRoleCount(vars.hosts, 'osd') == 1) {
        console.log("changing default crush rules : only a single osd host requires chooseleaf_type = 0 (instead of 1)");
        forYML.ceph_conf_overrides = {
            "global": {
                "osd_crush_chooseleaf_type": 0,
                "osd_pool_default_size": 1
            }
        };
    }

    return forYML;
}
export function dashboardVars (vars) {
    let forYML = {};
    forYML.grafana_server_group_name = "grafana-server";
    return forYML;
}

export function monsVars (vars) {
    let forYML = {};
    forYML.secure_cluster = false;
    forYML.secure_cluster_flags = ["nopgchange", "nodelete", "nosizechange"];
    return forYML;
}

export function mgrsVars (vars) {
    let forYML = {};

    let module_map = {
        "12" : ["prometheus", "status"],
        "13" : ["prometheus", "status", "dashboard"],
        "14" : ["prometheus", "status", "dashboard", "pg_autoscaler"],
    };

    forYML.ceph_mgr_modules = module_map[vars.cephVersion];

    return forYML;
}

export function rgwsVars(vars) {
    // RGW settings based on a high performance object workload, which is a typical
    // target for Ceph

    // FIXME: this currently uses static pgnum assignments

    let forYML = {};

    if (parseInt(vars.cephVersion) >= 14) {
        // Nautilus or above = beast
        forYML.radosgw_frontend_type = "beast";
    } else {
        forYML.radosgw_address_block = vars.rgwNetwork;
        forYML.radosgw_frontend_type = "civetweb";
        forYML.radosgw_frontend_options = "num_threads=2048 request_timeout_ms=100000";
    }

    forYML.radosgw_frontend_port = "8080";
    return forYML;
}

export function iscsiVars (vars) {
    let forYML = {};
    let iscsiTargets = [];

    if (parseInt(vars.cephVersion) >= 14) {
        // ceph-ansible deployment for Nautilus+ does NOT preconfigure
        // anything ... all config is deferred to the dashboard UI
        forYML.dummy = true;
    } else {
        // older deployment that pre-configures the targets
        for (let host of vars.hosts) {
            if (host.iscsi) {
                iscsiTargets.push(host.subnet_details[vars.iscsiNetwork].addr);
            }
        }
        forYML.gateway_iqn = vars.iscsiTargetName;
        forYML.gateway_ip_list = iscsiTargets.join(',');
    }

    return forYML;
}

export function cephAnsibleSequence(roles) {
    // the goal here it to align to the execution sequence of the ceph-ansible playbook
    // roles coming in will be suffixed with 's', since thats the ceph-ansible group/role name

    // input  : ['mons','rgws','osds','iscsigws', 'grafana-server']
    // output : ['mon','mgr','osd','rgw','iscsi-gw', 'grafana']

    // FIXME: iscsi is not tested/validated at the moment
    console.log("Debug: roles to convert to ansible sequence are : " + JSON.stringify(roles));
    let rolesIn = [];
    for (let r of roles) {
        switch (r) {
        case "grafana-server":
            rolesIn.push('grafana');
            break;
        case "iscsigws":
            rolesIn.push('iscsi-gw');
            break;
        default:
            rolesIn.push(r.slice(0, -1)); // eg. mons becomes mon
        }
    }

    // sequence of riles stripped of the ceph- prefix
    let allRoles = ['mon', 'mgr', 'osd', 'mds', 'rgw', 'iscsi-gw', 'grafana']; // ceph-ansible sequence in site-*.yml
    let sequence = [];
    for (let role of allRoles) {
        if (rolesIn.includes(role)) {
            sequence.push(role);
            if (role == 'mon') { sequence.push('mgr') }
        }
    }
    console.log("Debug: ansible sequence returned - " + JSON.stringify(sequence));
    return sequence;
}
