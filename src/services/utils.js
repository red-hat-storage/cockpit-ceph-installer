
import cockpit from 'cockpit';
import { addGroup, deleteGroup, changeHost, getPlaybookState, getTaskEvents } from './apicalls.js';

const validRoles = ['mon', 'osd', 'mds', 'rgw', 'mgr', 'iscsi'];

export function getSVCToken () {
    console.log("external function fetching svctoken from filesystem");
    // var token_path = '/etc/hosts';
    var tokenPath = '/etc/ansible-runner-service/svctoken';

    let promise = cockpit.file(tokenPath, {"superuser": "require"}).read();
    return promise;
}

export function buildRoles(hosts) {
    // return a list of roles from an array of host state objects
    console.log("building role list from " + hosts.length + " hosts");
    var roleList = [];
    for (let host of hosts) {
        validRoles.forEach(function(roleName, index, array) {
            let ansibleGroup = convertRole(roleName);
            if (host[roleName] && !roleList.includes(ansibleGroup)) {
                roleList.push(convertRole(roleName));
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
    case "iscsi":
        role = 'iscsigws';
        break;
    default:
        console.error("processing an unknown role type");
        role = "??";
        break;
    }
    return role;
}

export function getHost(hosts, hostname) {
    /* return the host object from the given hosts array */
    console.log("scanning for " + hostname);

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

export function toggleHostRole(hosts, callback, hostname, role, checked, svctoken) {
    // change roles for a host
    // Used in hostspage and validatepage

    let ansibleRole = convertRole(role);
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

    for (var groupName of groups) {
        groupChain = groupChain.then(() => addGroup(groupName, svctoken));
    }
    groupChain
            .then(() => {
                changeHost(hostname, ansibleRole, checked, svctoken)
                        .then((resp) => {
                            console.log("changeHost call completed, updating internal host information");
                            // console.log("Updated host entry in inventory");
                            // console.log("BEFORE hosts look like this " + JSON.stringify(hosts));
                            for (let i in hosts) {
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

                                let chain = Promise.resolve();
                                for (var groupName of groups) {
                                    chain = chain.then(() => deleteGroup(groupName, svctoken));
                                }
                                chain.catch(err => {
                                    console.log("failed to remove " + groupName + ": " + err);
                                });
                            }
                        });
            });
    groupChain.catch(err => {
        console.log("problem adding groups to the inventory: " + err);
    });
}

export function checkPlaybook(playUUID, svctoken, activeCB, finishedCB) {
    console.log("checking status");
    getPlaybookState(playUUID, svctoken)
            .then((resp) => {
                let response = JSON.parse(resp);
                console.log("- " + JSON.stringify(response));
                if (response.msg == "running") {
                    console.log("fetching event info");
                    getTaskEvents(playUUID, "CEPH_CHECK_ROLE", svctoken)
                            .then((resp) => {
                                activeCB(JSON.parse(resp), playUUID);
                                setTimeout(() => {
                                    checkPlaybook(playUUID, svctoken, activeCB, finishedCB);
                                }, 2000);
                            });
                } else {
                    console.log("Playbook ended : " + response.msg);
                    getTaskEvents(playUUID, "CEPH_CHECK_ROLE", svctoken)
                            .then((resp) => {
                                activeCB(JSON.parse(resp), playUUID);
                                finishedCB();
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
