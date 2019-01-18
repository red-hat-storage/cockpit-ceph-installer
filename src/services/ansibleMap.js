
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
    if (vars.osdMode != 'Standard') {
        forYML.dmcrypt = true;
    }

    if (vars.osdType == 'Bluestore') {
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
            if (host.hdd_devices && host.ssd_devices) {
                mixed = true;
                break;
            }
        }
    }

    if (mixed && vars.flashUsage.startsWith("Journal")) {
        forYML.osd_scenario = 'non-collocated';
    } else {
        forYML.osd_scenario = "collocated";
    }

    return forYML;
}

export function allVars (vars) {
    let forYML = {};

    switch (vars.sourceType) {
    case "Community":
        forYML.ceph_repository = "community";
        forYML.ceph_version_num = parseInt(vars.targetVersion.split(' ')[0]); // 13
        break;
    case "Red Hat":
        forYML.ceph_repository = "rhcs";
        forYML.ceph_rhcs_version = parseFloat(vars.targetVersion.split(' ')[1]); // 3 or 4
        break;
    }
    if (vars.installType == "Container") {
        forYML.containerized_deployment = true;
        forYML.docker_pull_timeout = "600s"; // workaround for local network wet string
        if (vars.sourceType === "Red Hat") {
            forYML.ceph_docker_registry = 'registry.access.redhat.com/rhceph';
            forYML.ceph_docker_image = 'rhceph-3-rhel7';
        }
    } else {
        forYML.ceph_origin = 'repository';
    }
    if (vars.rgwNetwork != '') {
        forYML.radosgw_address_block = vars.rgwNetwork;
    }

    forYML.public_network = vars.publicNetwork;
    forYML.cluster_network = vars.clusterNetwork;
    forYML.monitor_address_block = vars.clusterNetwork;
    forYML.ip_version = vars.networkType;
    forYML.disk_list = {rc: 0}; // workaround for osd_run_sh template error?

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

    const community_dashboard_versions = ["13", "14"];
    const rhcs_dashboard_versions = ["4"];

    switch (vars.sourceType) {
    case "Community":
        if (community_dashboard_versions.includes(vars.targetVersion.split(' ')[0])) {
            forYML.ceph_mgr_modules = ["dashboard", "status", "prometheus"];
        } else {
            forYML.ceph_mgr_modules = ["status", "prometheus"];
        }
        break;

    case "Red Hat":
        if (rhcs_dashboard_versions.includes(vars.targetVersion.split(' ')[1])) {
            forYML.ceph_mgr_modules = ["dashboard", "status", "prometheus"];
        } else {
            forYML.ceph_mgr_modules = ["status", "prometheus"];
        }
        break;

    default:
        forYML.ceph_mgr_modules = ["status", "prometheus"];
    }

    return forYML;
}

export function cephAnsibleSequence(roles) {
    // the goal here it to align to the execution sequence of the ceph-ansible playbook
    // roles coming in will be suffixed with 's', since thats the ceph-ansible group/role name

    // FIXME: iscsi is not included at the moment
    let rolesIn = [];
    for (let r of roles) {
        rolesIn.push(r.slice(0, -1)); // drop the last char
    }
    let allRoles = ['mon', 'mgr', 'osd', 'mds', 'rgw']; // ceph-ansible sequence
    let sequence = [];
    for (let role of allRoles) {
        if (rolesIn.includes(role)) {
            sequence.push(role);
            if (role == 'mon') { sequence.push('mgr') }
        }
    }

    return sequence;
}
