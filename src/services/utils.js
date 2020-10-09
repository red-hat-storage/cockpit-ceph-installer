
import cockpit from 'cockpit';
import { addGroup, deleteGroup, changeHost, getPlaybookState, getTaskEvents } from './apicalls.js';

const validRoles = ['mon', 'osd', 'mds', 'rgw', 'mgr', 'iscsi', 'metrics'];

export function readFile (fileName, fileType) {
    console.log("Fetching contents of '" + fileName + "'");
    let spec = {
        "superuser": "require"
    };
    if (fileType == 'JSON') { spec['syntax'] = JSON }

    let promise = cockpit.file(fileName, spec).read();
    return promise;
}

export function writeFile(fileName, content) {
    let promise = cockpit.file(fileName).replace(content);
    return promise;
}

export function getUser() {
    let promise = cockpit.user();
    return promise;
}

export function listDir (pathname) {
    console.log("listing contents of " + pathname);
    let cmd = ['/usr/bin/find', pathname, "-type", "f"];
    let promise = cockpit.spawn(cmd);
    return promise;
}

export function getISOContents(ISOimage) {
    // requires the host to have libcdio installed for the iso-info command
    console.log("looking for contents of " + ISOimage);
    let cmd = ["/usr/bin/iso-info", "-f", "-i", ISOimage]; //, "|", "grep", "-i", "-m", "1", fileTarget];
    let promise = cockpit.spawn(cmd);
    return promise;
}

export function versionSupportsMetrics(version) {
    // check the version number is 14 (Nautilus) or above, when metrics are integrated into the mgr/dashboard
    return parseInt(version) >= 14;
}

export function getCephVersionNumber(versionStr) {
    switch (versionStr) {
    case "RHCS 3":
        return "12";
    case "RHCS 4":
        return "14";
    case "12 (Luminous)":
    case "13 (Mimic)":
    case "14 (Nautilus)":
        return versionStr.split(' ')[0];
    }
}

export function buildRoles(hosts) {
    // return a list of roles from an array of host state objects
    console.log("building role list from " + hosts.length + " hosts");
    var roleList = [];
    for (let host of hosts) {
        validRoles.forEach(function(roleName, index, array) {
            let ansibleGroup = convertRole(roleName);
            if (host[roleName] && !roleList.includes(ansibleGroup)) {
                roleList.push(ansibleGroup);
            }
        });
    }

    console.log("role list is " + roleList);
    return roleList;
}

export function removeItem(ary, element) {
    console.log("remove " + element + " from " + ary);
    return ary.filter(e => e !== element);
}

export function convertRole(role) {
    switch (role) {
    case "mon":
    case "mgr":
    case "osd":
    case "mds":
    case "rgw":
        role += 's';
        break;
    case "mons":
    case "mgrs":
    case "osds":
    case "mdss":
    case "rgws":
        role = role.slice(0, -1);
        break;
    case "iscsi":
    case "iscsi-gw":
        role = 'iscsigws';
        break;
    case "iscsigws":
        role = 'iscsi';
        break;
    case "metrics":
        role = "grafana-server";
        break;
    case "grafana-server":
        role = "metrics";
        break;
    case "grafana":
        // used by deploypage
        role = "metrics";
        break;
    default:
        console.log("processing an unknown role type : " + role);
        break;
    }
    return role;
}

export function getHost(hosts, hostname) {
    /* return the host object from the given hosts array */
    console.log("scanning for " + hostname + " in " + JSON.stringify(hosts));

    for (let i = 0; i < hosts.length; i++) {
        console.log("checking .. " + JSON.stringify(hosts[i]));
        console.log("name is " + hosts[i].hostname);
        if (hosts[i].hostname == hostname) {
            console.log("match found");
            return hosts[i];
        }
    }
}

export function activeRoleCount(host) {
    /* return a count of the roles enabled for the given host */
    console.log("looking at " + JSON.stringify(host));
    let roleCount = 0;
    validRoles.forEach(role => {
        if (host[role]) { roleCount++ }
    });
    console.log("active roles for " + host.hostname + " " + roleCount);
    return roleCount;
}

export function activeRoles(host) {
    /* return an array of the active roles for the given host */
    console.log("looking at " + JSON.stringify(host));
    let rolesActive = [];
    validRoles.forEach(role => {
        if (host[role]) { rolesActive.push(role) }
    });
    console.log("active roles for " + host.hostname + " " + rolesActive);
    return rolesActive;
}
export function allRoles(hosts) {
    // generate a long list of the roles defined within the cluster
    // to detect when a role change is made
    let roleList = [];
    for (let host of hosts) {
        let hostRoles = activeRoles(host);
        roleList.push(...hostRoles);
    }
    return roleList;
}

export function hostsWithRoleCount(hosts, role) {
    /* return a count of the number of hosts that have the given role active */
    console.log("checking hosts for role " + role);
    var hostCount = 0;
    hosts.forEach(host => {
        console.log("checking host " + host.hostname);
        if (host[role]) { hostCount++ }
    });
    console.log("there are " + hostCount + " hosts with the role " + role);
    return hostCount;
}

export function hostsWithRole(hosts, role) {
    /* return an array of indices into the hosts array for those hosts that have the required role */
    console.log("checking hosts for role " + role);
    var hostIndices = [];
    for (let idx = 0; idx < hosts.length; idx++) {
        console.log("checking host " + hosts[idx].hostname);
        if (hosts[idx][role]) { hostIndices.push(idx) }
    }
    console.log("there are " + hostIndices.length + " hosts with the role " + role);
    return hostIndices;
}

export function toggleHostRole(hosts, callback, hostname, role, checked) {
    // change roles for a host
    // Used in hostspage and validatepage
    console.log("Debug: toggle host called for role " + role);
    let ansibleRole = convertRole(role);
    console.log("debug: " + role + " = " + ansibleRole);
    console.log("processing against a hosts array of " + JSON.stringify(hosts));
    var groupRemoval = false;

    if (!checked) {
        console.log("check to see if this removal will leave the host without any group");
        let thisHost = getHost(hosts, hostname);
        console.log("Looking at " + JSON.stringify(thisHost));

        // Prevent the user from removing the last role on a host - hosts must have roles for the
        // inventory to be valid
        if (activeRoleCount(thisHost) == 1) {
            console.log("can't remove the role - it's the only one enabled for " + hostname);
            callback(hosts);
            return;
        }

        // determine if the removal of this role would leave an empty group in the inventory
        if (hostsWithRoleCount(hosts, role) == 1) { groupRemoval = true }
    }

    var groupChain = Promise.resolve();
    var groups = [];
    groups.push(convertRole(role));
    if (role == 'mon') { groups.push(convertRole('mgr')) }

    if (!groupRemoval) {
        for (let g = 0; g < groups.length; g++) {
            groupChain = groupChain.then(() => addGroup(groups[g]));
        }
    }
    console.log("DEBUG toggleHostRole - groups are" + JSON.stringify(groups));
    groupChain
            .then(() => {
                changeHost(hostname, ansibleRole, checked)
                        .then((resp) => {
                            console.log("changeHost call completed, updating internal host information");
                            // console.log("Updated host entry in inventory");
                            // console.log("BEFORE hosts look like this " + JSON.stringify(hosts));
                            for (let i = 0; i < hosts.length; i++) {
                                let thishost = hosts[i];
                                console.log("comparing host *" + thishost.hostname + "*, compared to *" + hostname + "*");
                                if (thishost.hostname == hostname) {
                                    console.log("updating host role in state");
                                    thishost[role] = checked;
                                    break;
                                }
                            }
                            // console.log("AFTER hosts look like this " + JSON.stringify(hosts));
                            callback(hosts);
                        })
                        .then(() => {
                            console.log("running a task after the host update is complete");
                            if (groupRemoval) {
                                console.log("removing " + role + "from the inventory");
                                var groups = [];
                                groups.push(convertRole(role));
                                if (role == 'mon') { groups.push(convertRole('mgr')) }
                                console.log("changeHost - groups being removed " + JSON.stringify(groups));
                                let chain = Promise.resolve();
                                for (let i = 0; i < groups.length; i++) {
                                    console.log("Issuing delete for group " + groups[i]);
                                    chain = chain.then(() => deleteGroup(groups[i]))
                                            .then(() => {});
                                }
                                chain.then(() => {
                                    console.log("cleanup after group removal");
                                    // callback(hosts);
                                });
                                chain.catch(err => {
                                    console.log("failed to remove group: " + err);
                                });
                            }
                        })
                        .catch(e => {
                            // Problem returned from the changeHost request..blocked method?
                            console.error("Problem making a changeHost request: " + JSON.stringify(e));
                        });
            });
    groupChain.catch(err => {
        console.log("problem adding groups to the inventory: " + err);
    });
}

export function checkPlaybook(playUUID, activeCB, finishedCB) {
    console.log("checking status");
    getPlaybookState(playUUID)
            .then((resp) => {
                let response = JSON.parse(resp);
                console.log("- " + JSON.stringify(response));
                if (response.msg == "running") {
                    console.log("fetching event info");
                    getTaskEvents(playUUID, "CEPH_CHECK_ROLE")
                            .then((resp) => {
                                activeCB(JSON.parse(resp), playUUID);
                                setTimeout(() => {
                                    checkPlaybook(playUUID, activeCB, finishedCB);
                                }, 2000);
                            });
                } else {
                    console.log("Playbook ended : " + response.msg);
                    getTaskEvents(playUUID, "CEPH_CHECK_ROLE")
                            .then((resp) => {
                                activeCB(JSON.parse(resp), playUUID);
                                finishedCB(response.msg);
                            });
                }
            });
}

export function countNICs(facts) {
    var NICtotal = 0;
    facts.network.subnets.forEach((subnet, idx, ary) => {
        NICtotal += facts.network.subnet_details[subnet].count;
    });
    return NICtotal;
}

export function msgCount(msgs) {
    // summarize the messages by type, returning an object
    var summary = {};
    for (let m of msgs) {
        let msgType = m.split(':')[0];
        // console.log(msgType);
        if (summary.hasOwnProperty(msgType)) {
            summary[msgType] += 1;
        } else {
            summary[msgType] = 1;
        }
    }
    return summary;
}

/**
 * Function to sort alphabetically an array of objects by some specific key.
 *
 * @param {String} property Key of the object to sort.
 */
export function sortByKey(property) {
    var sortOrder = 1;

    if (property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }

    return function (a, b) {
        if (sortOrder == -1) {
            return b[property].localeCompare(a[property]);
        } else {
            return a[property].localeCompare(b[property]);
        }
    };
}

export function arrayIntersect(arrays) {
    /* ref: https://stackoverflow.com/questions/11076067/finding-matches-between-multiple-javascript-arrays */
    return arrays.reduce((prev, curr) => prev.filter(elem => curr.includes(elem)));
}

export function readableBits(mbits) {
    var sizes = ['Mb', 'Gb'];
    let i;
    console.log("converting " + mbits);
    switch (mbits) {
    case "Unknown":
    case "0":
    case "-1":
        console.log("matched on unknown, 0 or -1");
        return "'unknown bandwidth'";
    default:
        console.log("executing default clause");
        i = parseInt(Math.floor(Math.log(mbits) / Math.log(1024)));
        return Math.round(mbits / Math.pow(1024, i), 2) + sizes[i];
    }
}

export function netSummary(lookupTable, subnet, hosts) {
    var subnetSummary = [];
    let hostCount = hosts.length;
    let hostnames = [];
    hosts.forEach(host => {
        hostnames.push(host.hostname);
    });

    if (subnet == null) {
        // catch invocation during early page renders
        return subnetSummary;
    } else {
        console.log("calculating summary info for " + subnet);
        let majority = {
            count: 0,
            speed: 0,
            hosts: []
        };

        let subnetSpeeds = Object.keys(lookupTable[subnet]);
        for (let speed of subnetSpeeds) {
            if (lookupTable[subnet][speed].length > majority.count) {
                majority.count = lookupTable[subnet][speed].length;
                majority.speed = speed;
                majority.hosts = lookupTable[subnet][speed];
            }
        }
        console.log(JSON.stringify(majority));
        subnetSummary.push(majority.count + "/" + hostCount + " hosts @ " + readableBits(majority.speed));
        if (majority.count < hostCount) {
            console.log("Exceptions detected");
            let badHosts = hostnames.slice(0);
            majority.hosts.forEach(host => {
                badHosts = removeItem(badHosts, host);
            });
            subnetSummary.push("Configuration anomalies: " + badHosts.join(','));
        }
        return subnetSummary;
    }
}

export function collocationOK(currentRoles, newRole, installType, clusterType) {
    let validCollocation = ['osds', 'rgws'];
    console.log("checking for collocation violations");
    console.log("current roles " + currentRoles);
    console.log("new role is " + newRole);
    if ((newRole == 'metrics' && currentRoles.length > 0) || (currentRoles.includes('grafana-server'))) {
        console.log("request for metrics on a host with other ceph roles is denied");
        return false;
    }
    newRole = convertRole(newRole);
    if (installType.toLowerCase() == 'container') {
        return true;
    }
    // installation is rpm based, so check if this is dev mode
    if (clusterType.includes('POC')) {
        return true;
    }
    // At this point the cluster is for production use and based on rpm (old school!)
    if (currentRoles.length >= 2) {
        console.error("request for " + newRole + " would result in collocation violation");
        return false;
    }

    currentRoles.push(newRole);
    console.log("candidate roles are : " + currentRoles);
    if (currentRoles.length == validCollocation.length) {
        if (JSON.stringify(currentRoles.sort()) != JSON.stringify(validCollocation)) {
            console.error("request for " + newRole + " would result in collocation violation");
            return false;
        }
    }

    return true;
}

export function copyToClipboard(text) {
    console.log("copying to clipboard");
    var textField = document.createElement('textarea');
    textField.innerText = text;
    document.body.appendChild(textField);
    textField.select();
    document.execCommand('copy');
    textField.remove();
}

export function getCephHosts(hosts) {
    // return list of hosts objects that don't have a non-ceph role
    let excludedRoles = ['metrics'];
    let cephHosts = [];
    console.log("getCephHosts: hosts provided : " + hosts.length);
    for (let idx = 0; idx < hosts.length; idx++) {
        let hostRoles = activeRoles(hosts[idx]);
        if (excludedRoles.some(val => hostRoles.includes(val))) {
            continue;
        }
        cephHosts.push(hosts[idx]);
    }
    console.log("getCephHosts: hosts with ceph only role : " + cephHosts.length);
    return cephHosts;
}

export function commonSubnets(hostArray, role) {
    // determine the common subnets for a given role
    let subnets = []; // subnets present on all hosts
    console.log("Looking for common subnets across " + hostArray.length + " hosts, with role " + role);

    for (let idx = 0; idx < hostArray.length; idx++) {
        if (hostArray[idx].hasOwnProperty('subnets')) {
            switch (role) {
            case "all":
                subnets.push(hostArray[idx].subnets);
                break;
            case "osd":
                if (hostArray[idx].osd) {
                    subnets.push(hostArray[idx].subnets);
                }
                break;
            case "rgw":
                if (hostArray[idx].rgw) {
                    subnets.push(hostArray[idx].subnets);
                }
                break;
            case "iscsi":
                if (hostArray[idx].iscsi) {
                    subnets.push(hostArray[idx].subnets);
                }
                break;
            }
        }
    }

    if (subnets.length > 0) {
        console.log("subnets :" + JSON.stringify(subnets));
        return arrayIntersect(subnets);
    } else {
        console.error("No subnets found in host data!");
        return [];
    }
}

export function buildSubnetLookup(hostArray) {
    // look through the subnets to determine useful metadata
    var speed;
    var subnetLookup = {};

    // goal is to have a lookup table like this
    // subnet -> speed -> array of hosts with that speed
    for (let idx = 0; idx < hostArray.length; idx++) {
        if (hostArray[idx].hasOwnProperty('subnets')) {
            // process each subnet
            for (let subnet of hostArray[idx].subnets) {
                if (!Object.keys(subnetLookup).includes(subnet)) {
                    subnetLookup[subnet] = {};
                }
                let speedInt = hostArray[idx].subnet_details[subnet].speed;
                if (speedInt <= 0) {
                    // console.log("speed is <= 0");
                    speed = 'Unknown';
                } else {
                    // console.log("speed is >0 ");
                    speed = speedInt.toString();
                }
                let spds = Object.keys(subnetLookup[subnet]);
                let snet = subnetLookup[subnet];
                if (!spds.includes(speed)) {
                    snet[speed] = [hostArray[idx].hostname];
                } else {
                    snet[speed].push(hostArray[idx].hostname);
                }
            }
        }
    }
    console.log("lookup " + JSON.stringify(subnetLookup));
    return subnetLookup;
}

export function currentTime() {
    /* return current time in 24hr format */
    let d = new Date();
    return d.toLocaleTimeString('en-GB');
}

export function osdCount(hosts, flashUsage) {
    // return the number of OSD devices from the hosts array
    let ctr = 0;
    for (let host of hosts) {
        if (!host.osd) {
            continue;
        }

        switch (flashUsage) {
        case "OSD Data":
            ctr += parseInt(host.ssd, 10) || 0;
            break;
        default:
            console.log("osdcount : " + host.hdd);
            ctr += parseInt(host.hdd, 10) || 0;
        }
    }
    console.log("Detected " + ctr + " candidate disks for OSDs");
    return ctr;
}

export function isEmpty(str) {
    // return bool representing whether a string is empty or not
    return (!str || str.trim().length === 0);
}
